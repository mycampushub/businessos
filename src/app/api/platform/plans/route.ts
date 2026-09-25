import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str, num } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../guard'
import { planItem, planSubscriptionCounts, encodeFeatures } from '@/lib/server/billing'
import { toCents } from '@/lib/server/money'

/** GET /api/platform/plans — the plan catalog with live subscription counts. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const [plans, counts] = await Promise.all([
    db.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    planSubscriptionCounts(),
  ])
  return ok({ items: plans.map((p) => planItem(p, counts.get(p.id) ?? 0)) })
})

/** POST /api/platform/plans — create a plan. `code` is immutable after creation. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const data = await body(req)
  const name = str(data.name, 'name', { max: 60 })
  if (name.length < 2) return fail('Plan name must be at least 2 characters', 422)

  const rawCode = str(data.code, 'code', { max: 40 })
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!code) return fail('A valid plan code is required', 422)

  const existing = await db.plan.findUnique({ where: { code } })
  if (existing) return fail(`A plan with code "${code}" already exists`, 409)

  // C7: client sends dollars, DB stores cents. Yearly defaults to monthly × 12 (whole cents) when not supplied.
  const priceMonthlyRaw = num(data.priceMonthly, 'priceMonthly', { min: 0 })
  const priceYearlyRaw =
    data.priceYearly === undefined || data.priceYearly === null || data.priceYearly === ''
      ? undefined
      : num(data.priceYearly, 'priceYearly', { min: 0 })
  const priceMonthly = toCents(priceMonthlyRaw) ?? 0
  const priceYearly = priceYearlyRaw !== undefined
    ? (toCents(priceYearlyRaw) ?? 0)
    : Math.round(priceMonthlyRaw * 12 * 100)
  const seatLimit = num(data.seatLimit, 'seatLimit', { min: 1, max: 100000 })
  const projectLimit = num(data.projectLimit, 'projectLimit', { min: 1, max: 100000 })
  const storageGb = num(data.storageGb, 'storageGb', { min: 1, max: 100000 })
  const description = data.description ? str(data.description, 'description', { required: false, max: 200 }) : null
  const features = encodeFeatures(data.features)
  const isActive = data.isActive === undefined ? true : data.isActive === true
  const sortOrder = num(data.sortOrder, 'sortOrder', { required: false, min: 0, max: 999 })

  const created = await db.plan.create({
    data: { code, name, description, priceMonthly, priceYearly, seatLimit, projectLimit, storageGb, features, isActive, sortOrder },
  })

  // plans are platform-level entities — audit rows need an org, so this is
  // console-logged by the guard (documented behavior for org-less entities)
  await platformAudit({
    orgId: null,
    action: 'plan.created',
    entity: 'Plan',
    entityId: created.id,
    newValues: { code, name, priceMonthly, priceYearly, seatLimit, projectLimit, storageGb, isActive },
  })

  return ok(planItem(created, 0), 201)
})
