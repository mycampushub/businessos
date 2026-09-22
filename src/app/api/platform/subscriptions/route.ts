import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body } from '@/lib/server/api'
import { requirePlatform } from '../guard'
import { subItem, subInclude, assignSubscription, LIVE_SUB_STATUSES } from '@/lib/server/billing'

/** GET /api/platform/subscriptions?status=&planCode=&q= — all subscriptions
 *  (newest first). q matches the organization name/slug. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const url = new URL(req.url)
  const status = url.searchParams.get('status')?.trim().toUpperCase() || undefined
  const planCode = url.searchParams.get('planCode')?.trim().toUpperCase() || undefined
  const q = url.searchParams.get('q')?.trim() || undefined

  const where: Record<string, unknown> = {}
  if (status && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'].includes(status)) {
    where.status = status
  }
  if (planCode) where.plan = { code: planCode }
  if (q) where.org = { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }

  const subs = await db.subscription.findMany({
    where,
    include: subInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const [active, trialing, mrv] = await Promise.all([
    db.subscription.count({ where: { status: 'ACTIVE' } }),
    db.subscription.count({ where: { status: 'TRIALING' } }),
    db.subscription.aggregate({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } }, _sum: { amountMonthly: true } }),
  ])
  const mrr = Math.round((mrv._sum.amountMonthly ?? 0) * 100) / 100

  return ok({ items: subs.map(subItem), kpis: { active, trialing, mrr } })
})

/** POST /api/platform/subscriptions — assign a plan to an organization.
 *  Body: { orgId, planCode, billingCycle?, seats?, status? ('ACTIVE'|'TRIALING'), trialDays? }
 *  Cancels the org's existing live subscription, syncs Organization.plan. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const data = await body(req)
  const orgId = typeof data.orgId === 'string' ? data.orgId.trim() : ''
  if (!orgId) return fail('Field "orgId" is required', 422)
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } })
  if (!org) return fail('Organization not found', 404)

  const planCode = typeof data.planCode === 'string' ? data.planCode.trim().toUpperCase() : ''
  if (!planCode) return fail('Field "planCode" is required', 422)

  const current = await db.subscription.findFirst({
    where: { orgId: org.id, status: { in: LIVE_SUB_STATUSES } },
    include: subInclude,
  })

  try {
    const created = await assignSubscription({
      orgId: org.id,
      planCode,
      billingCycle: typeof data.billingCycle === 'string' ? data.billingCycle : undefined,
      seats: typeof data.seats === 'number' ? data.seats : undefined,
      status: data.status === 'TRIALING' ? 'TRIALING' : 'ACTIVE',
      trialDays: typeof data.trialDays === 'number' ? data.trialDays : undefined,
      actorName: ctx.user.name,
    })
    return ok(
      { ...subItem(created), replaced: current ? { id: current.id, planName: current.plan.name, status: current.status } : null },
      201,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not assign the subscription'
    return fail(message, 422)
  }
})
