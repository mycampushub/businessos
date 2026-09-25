import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, num, notifyUsers, logActivity } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../../guard'
import { subItem, subInclude, monthlyAmount, nextPeriodEnd } from '@/lib/server/billing'

type RouteParams = { params: Promise<{ id: string }> }

const SUB_ACTIONS = ['cancel', 'reactivate', 'renew'] as const

/**
 * PATCH /api/platform/subscriptions/[id] — manage one subscription.
 *  { planCode }          → move to another plan (amount + org.plan resynced)
 *  { billingCycle }       → switch MONTHLY ↔ YEARLY (period resets)
 *  { seats }              → resize seats
 *  { action }             → 'cancel' | 'reactivate' | 'renew'
 */
export async function PATCH(req: NextRequest, route: RouteParams) {
  const { id } = await route.params
  return withAuth(async (rq: NextRequest, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const sub = await db.subscription.findUnique({ where: { id }, include: subInclude })
    if (!sub) return fail('Subscription not found', 404)

    const org = await db.organization.findUnique({
      where: { id: sub.orgId },
      select: { id: true, name: true, ownerId: true, plan: true },
    })
    if (!org) return fail('Organization not found', 404)

    const data = await body(rq)
    const now = new Date()

    // ---- action-based operations ----
    if (data.action !== undefined) {
      const action = typeof data.action === 'string' && (SUB_ACTIONS as readonly string[]).includes(data.action)
        ? (data.action as (typeof SUB_ACTIONS)[number])
        : null
      if (!action) return fail(`Action must be one of: ${SUB_ACTIONS.join(', ')}`, 422)

      if (action === 'cancel') {
        if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
          return fail('This subscription is already cancelled', 409)
        }
        const updated = await db.subscription.update({
          where: { id: sub.id },
          data: { status: 'CANCELLED', cancelledAt: now },
          include: subInclude,
        })
        await notifyUsers({
          orgId: org.id,
          userIds: [org.ownerId],
          type: 'SYSTEM',
          title: `Your ${sub.plan.name} subscription was cancelled`,
          body: `${org.name} no longer has an active subscription. Existing data stays intact — reactivate any time.`,
        })
        await platformAudit({
          orgId: org.id, action: 'subscription.cancelled', entity: 'Subscription', entityId: sub.id,
          oldValues: { status: sub.status }, newValues: { status: 'CANCELLED' },
        })
        await logActivity({
          orgId: org.id, actorMembershipId: null, action: 'subscription.cancelled', entityType: 'SUBSCRIPTION', entityId: sub.id,
          message: `Platform administration cancelled ${org.name}'s ${sub.plan.name} subscription — by ${ctx.user.name}`,
        })
        return ok(subItem(updated))
      }

      if (action === 'reactivate') {
        if (sub.status === 'ACTIVE' || sub.status === 'TRIALING') {
          return fail('This subscription is already active', 409)
        }
        const periodStart = now
        const periodEnd = nextPeriodEnd(sub.billingCycle, now)
        const updated = await db.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'ACTIVE',
            cancelledAt: null,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            amountMonthly: monthlyAmount(sub.plan.priceMonthly, sub.plan.priceYearly, sub.billingCycle),
          },
          include: subInclude,
        })
        // H13-db fix: restore the denormalized plan — store Plan.code not Plan.name
        if (org.plan !== sub.plan.code) {
          await db.organization.update({ where: { id: org.id }, data: { plan: sub.plan.code } })
        }
        await notifyUsers({
          orgId: org.id,
          userIds: [org.ownerId],
          type: 'SYSTEM',
          title: `Your ${sub.plan.name} subscription is active again`,
          body: `${org.name} is back on the ${sub.plan.name} plan until ${periodEnd.toISOString().slice(0, 10)}.`,
        })
        await platformAudit({
          orgId: org.id, action: 'subscription.reactivated', entity: 'Subscription', entityId: sub.id,
          oldValues: { status: sub.status }, newValues: { status: 'ACTIVE' },
        })
        await logActivity({
          orgId: org.id, actorMembershipId: null, action: 'subscription.reactivated', entityType: 'SUBSCRIPTION', entityId: sub.id,
          message: `Platform administration reactivated ${org.name}'s ${sub.plan.name} subscription — by ${ctx.user.name}`,
        })
        return ok(subItem(updated))
      }

      // renew — advance the billing period from the current end (or today when already past)
      const base = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now
      const updated = await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          cancelledAt: null,
          currentPeriodStart: base,
          currentPeriodEnd: nextPeriodEnd(sub.billingCycle, base),
        },
        include: subInclude,
      })
      await notifyUsers({
        orgId: org.id,
        userIds: [org.ownerId],
        type: 'SYSTEM',
        title: `Your ${sub.plan.name} subscription was renewed`,
        body: `${org.name}'s ${sub.plan.name} subscription now runs until ${updated.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      })
      await platformAudit({
        orgId: org.id, action: 'subscription.renewed', entity: 'Subscription', entityId: sub.id,
        oldValues: { currentPeriodEnd: sub.currentPeriodEnd.toISOString() },
        newValues: { currentPeriodEnd: updated.currentPeriodEnd.toISOString() },
      })
      await logActivity({
        orgId: org.id, actorMembershipId: null, action: 'subscription.renewed', entityType: 'SUBSCRIPTION', entityId: sub.id,
        message: `Platform administration renewed ${org.name}'s ${sub.plan.name} subscription until ${updated.currentPeriodEnd.toISOString().slice(0, 10)} — by ${ctx.user.name}`,
      })
      return ok(subItem(updated))
    }

    // ---- field updates ----
    const updates: Record<string, unknown> = {}
    let newPlan: { id: string; code: string; name: string; priceMonthly: number; priceYearly: number } | null = null

    if (data.planCode !== undefined) {
      const planCode = String(data.planCode).trim().toUpperCase()
      const plan = await db.plan.findUnique({ where: { code: planCode } })
      if (!plan) return fail('Unknown plan', 422)
      if (!plan.isActive) return fail(`The ${plan.name} plan is not available for assignment`, 422)
      if (plan.id !== sub.planId) {
        newPlan = { id: plan.id, code: plan.code, name: plan.name, priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly }
        updates.planId = plan.id
      }
    }
    let cycleChanged = false
    if (data.billingCycle !== undefined) {
      const cycle = data.billingCycle === 'YEARLY' ? 'YEARLY' : data.billingCycle === 'MONTHLY' ? 'MONTHLY' : null
      if (!cycle) return fail('Billing cycle must be MONTHLY or YEARLY', 422)
      if (cycle !== sub.billingCycle) {
        cycleChanged = true
        updates.billingCycle = cycle
      }
    }

    if (data.seats !== undefined) {
      updates.seats = num(data.seats, 'seats', { min: 1, max: 100000 })
    }

    if (Object.keys(updates).length === 0) return fail('Nothing to update', 422)

    // plan/cycle changes reset the billing period and re-price the subscription
    const effectivePlan = newPlan ?? sub.plan
    const planChanged = newPlan !== null
    const effectiveCycle = (updates.billingCycle as string | undefined) ?? sub.billingCycle
    if (planChanged || cycleChanged) {
      updates.currentPeriodStart = now
      updates.currentPeriodEnd = nextPeriodEnd(effectiveCycle, now)
      updates.amountMonthly = monthlyAmount(effectivePlan.priceMonthly, effectivePlan.priceYearly, effectiveCycle)
    }

    const updated = await db.subscription.update({ where: { id: sub.id }, data: updates, include: subInclude })

    // H13-db fix: keep the denormalized org plan in sync — store Plan.code not Plan.name
    if (planChanged && org.plan !== effectivePlan.code) {
      await db.organization.update({ where: { id: org.id }, data: { plan: effectivePlan.code } })
    }

    if (planChanged || cycleChanged || data.seats !== undefined) {
      await notifyUsers({
        orgId: org.id,
        userIds: [org.ownerId],
        type: 'SYSTEM',
        title: planChanged ? `Your plan changed to ${effectivePlan.name}` : 'Your subscription was updated',
        body: planChanged
          ? `${org.name} is now on the ${effectivePlan.name} plan (${effectiveCycle === 'YEARLY' ? 'yearly' : 'monthly'} billing, ${updated.seats} seats).`
          : `${org.name}'s subscription now bills ${effectiveCycle === 'YEARLY' ? 'yearly' : 'monthly'} with ${updated.seats} seats.`,
      })
      await platformAudit({
        orgId: org.id,
        action: 'subscription.updated',
        entity: 'Subscription',
        entityId: sub.id,
        oldValues: { planCode: sub.plan.code, billingCycle: sub.billingCycle, seats: sub.seats, amountMonthly: sub.amountMonthly },
        newValues: { planCode: effectivePlan.code, billingCycle: effectiveCycle, seats: updated.seats, amountMonthly: updated.amountMonthly },
      })
      await logActivity({
        orgId: org.id,
        actorMembershipId: null,
        action: 'subscription.updated',
        entityType: 'SUBSCRIPTION',
        entityId: sub.id,
        message: `Platform administration updated ${org.name}'s subscription${planChanged ? ` → ${effectivePlan.name}` : ''}${cycleChanged ? ` (${effectiveCycle === 'YEARLY' ? 'yearly' : 'monthly'})` : ''} — by ${ctx.user.name}`,
      })
    }

    return ok(subItem(updated))
  })(req)
}
