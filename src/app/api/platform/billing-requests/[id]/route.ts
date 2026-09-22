import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str, oneOf, notifyUsers, invalidateSubscriptionCache } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../../guard'
import { assignSubscription, billingRequestInclude, billingRequestItem } from '@/lib/server/billing'

type RouteParams = { params: Promise<{ id: string }> }

const DECISIONS = ['approve', 'reject'] as const

/** POST /api/platform/billing-requests/[id] — decide a tenant plan request.
 *  Body: { action: 'approve' | 'reject', reason? }
 *  Approve = payment received: assignSubscription activates the requested plan
 *  (period resets, yearly amount normalizes to monthly ÷12, Organization.plan
 *  resyncs) and the org's subscription cache is invalidated immediately.
 *  Only PENDING requests can be decided (idempotent — anything else is 409). */
export async function POST(req: NextRequest, route: RouteParams) {
  const { id } = await route.params
  return withAuth(async (rq: NextRequest, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const request = await db.billingRequest.findUnique({
      where: { id },
      include: {
        org: { select: { id: true, name: true, slug: true, ownerId: true } },
        plan: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { user: { select: { name: true } } } },
      },
    })
    if (!request) return fail('Request not found', 404)
    if (request.status !== 'PENDING') return fail('This request has already been decided', 409)

    const data = await body<Record<string, unknown>>(rq)
    const action = oneOf(data.action, DECISIONS)
    const reason = action === 'reject' ? str(data.reason, 'reason', { required: false, max: 500 }) || null : null
    const now = new Date()

    if (action === 'approve') {
      // activate the requested plan (cancels the previous live subscription)
      await assignSubscription({
        orgId: request.orgId,
        planCode: request.plan.code,
        billingCycle: request.billingCycle,
        seats: request.seats,
        status: 'ACTIVE',
        actorName: ctx.user.name,
      })
      const updated = await db.billingRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED', decidedAt: now },
        include: billingRequestInclude,
      })
      await platformAudit({
        orgId: request.orgId,
        action: 'billing_request.approved',
        entity: 'BillingRequest',
        entityId: request.id,
        oldValues: { status: 'PENDING' },
        newValues: { status: 'APPROVED', plan: request.plan.name, billingCycle: request.billingCycle, seats: request.seats, amount: request.amount },
      })
      await notifyUsers({
        orgId: request.orgId,
        userIds: [request.org.ownerId],
        type: 'SYSTEM',
        title: `Your plan request was approved — you're now on ${request.plan.name}`,
        body: `${request.org.name} is now on the ${request.plan.name} plan (${request.billingCycle.toLowerCase()} billing, ${request.seats} seats). Payment received — thank you!`,
      })
      // enforcement is immediate: clear the cached subscription status
      invalidateSubscriptionCache(request.orgId)
      return ok(billingRequestItem(updated))
    }

    // ---- reject ----
    const updated = await db.billingRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', decidedAt: now },
      include: billingRequestInclude,
    })
    await platformAudit({
      orgId: request.orgId,
      action: 'billing_request.rejected',
      entity: 'BillingRequest',
      entityId: request.id,
      oldValues: { status: 'PENDING' },
      newValues: { status: 'REJECTED', plan: request.plan.name, billingCycle: request.billingCycle, seats: request.seats, amount: request.amount, reason },
    })
    await notifyUsers({
      orgId: request.orgId,
      userIds: [request.org.ownerId],
      type: 'SYSTEM',
      title: 'Your plan request was declined',
      body: `The ${request.plan.name} plan request for ${request.org.name} was declined.${reason ? ` Reason: ${reason}` : ''} You can submit a new request from Billing & Plan any time.`,
    })
    return ok(billingRequestItem(updated))
  })(req)
}
