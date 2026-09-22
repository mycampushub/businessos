import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str, num } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../../guard'
import { planItem, planSubscriptionCounts, encodeFeatures } from '@/lib/server/billing'

type RouteParams = { params: Promise<{ id: string }> }

/** PATCH /api/platform/plans/[id] — update plan fields (code immutable). */
export async function PATCH(req: NextRequest, route: RouteParams) {
  const { id } = await route.params
  return withAuth(async (rq: NextRequest, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const plan = await db.plan.findUnique({ where: { id } })
    if (!plan) return fail('Plan not found', 404)

    const data = await body(rq)
    if (data.code !== undefined && data.code !== plan.code) {
      return fail('The plan code is immutable — create a new plan instead', 422)
    }

    const updates: Record<string, unknown> = {}
    if (data.name !== undefined) {
      const name = str(data.name, 'name', { max: 60 })
      if (name.length < 2) return fail('Plan name must be at least 2 characters', 422)
      updates.name = name
    }
    if (data.description !== undefined) {
      updates.description = data.description ? str(data.description, 'description', { required: false, max: 200 }) : null
    }
    if (data.priceMonthly !== undefined) updates.priceMonthly = num(data.priceMonthly, 'priceMonthly', { min: 0 })
    if (data.priceYearly !== undefined) updates.priceYearly = num(data.priceYearly, 'priceYearly', { min: 0 })
    if (data.seatLimit !== undefined) updates.seatLimit = num(data.seatLimit, 'seatLimit', { min: 1, max: 100000 })
    if (data.projectLimit !== undefined) updates.projectLimit = num(data.projectLimit, 'projectLimit', { min: 1, max: 100000 })
    if (data.storageGb !== undefined) updates.storageGb = num(data.storageGb, 'storageGb', { min: 1, max: 100000 })
    if (data.features !== undefined) updates.features = encodeFeatures(data.features)
    if (data.isActive !== undefined) updates.isActive = data.isActive === true

    if (Object.keys(updates).length === 0) return fail('Nothing to update', 422)

    const updated = await db.plan.update({ where: { id: plan.id }, data: updates })
    await platformAudit({
      orgId: null,
      action: 'plan.updated',
      entity: 'Plan',
      entityId: plan.id,
      oldValues: {
        name: plan.name, priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly,
        seatLimit: plan.seatLimit, projectLimit: plan.projectLimit, storageGb: plan.storageGb, isActive: plan.isActive,
      },
      newValues: updates,
    })

    const counts = await planSubscriptionCounts()
    return ok(planItem(updated, counts.get(updated.id) ?? 0))
  })(req)
}

/** DELETE /api/platform/plans/[id] — blocked while subscriptions reference the plan. */
export async function DELETE(req: NextRequest, route: RouteParams) {
  const { id } = await route.params
  return withAuth(async (_rq: NextRequest, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const plan = await db.plan.findUnique({ where: { id } })
    if (!plan) return fail('Plan not found', 404)

    const refCount = await db.subscription.count({ where: { planId: plan.id } })
    if (refCount > 0) {
      return fail(`${refCount} subscription${refCount === 1 ? '' : 's'} still reference the ${plan.name} plan — move them to another plan first`, 409)
    }

    await db.plan.delete({ where: { id: plan.id } })
    await platformAudit({
      orgId: null,
      action: 'plan.deleted',
      entity: 'Plan',
      entityId: plan.id,
      oldValues: { code: plan.code, name: plan.name },
    })
    return ok({ id: plan.id })
  })(req)
}
