import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, num, oneOf, logActivity } from '@/lib/server/api'
import { BILLING_CYCLES, billingRequestInclude, billingRequestItem } from '@/lib/server/billing'

/** round to 2 decimals — every stored money value passes through this */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** POST /api/billing/requests — request a plan change / renewal.
 *  OWNER/ADMIN only. EXPIRED orgs may use this (the 402 write-gate exempts
 *  /api/billing) — that is exactly the renewal path. Amount = the per-period
 *  price; payment is confirmed manually by a platform admin. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const actor = requireRole(ctx, ['ADMIN']) // OWNER always passes
  const { org } = requireOrg(ctx)

  const data = await body<Record<string, unknown>>(req)
  const planId = str(data.planId, 'planId', { max: 40 })
  const billingCycle = oneOf(data.billingCycle, BILLING_CYCLES, 'MONTHLY')
  const seats = num(data.seats, 'seats', { min: 1, max: 100000 })
  const note = str(data.note, 'note', { required: false, max: 500 }) || null

  const plan = await db.plan.findUnique({ where: { id: planId } })
  if (!plan) return fail('Plan not found', 404)
  if (!plan.isActive) return fail(`The ${plan.name} plan is not available right now`, 422)

  const amount = round2(billingCycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly)

  const created = await db.billingRequest.create({
    data: {
      orgId: org.id,
      planId: plan.id,
      billingCycle,
      seats: Math.round(seats),
      amount,
      note,
      status: 'PENDING',
      requestedById: actor.id,
    },
    include: billingRequestInclude,
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: actor.id,
    action: 'billing.requested',
    entityType: 'BILLING_REQUEST',
    entityId: created.id,
    message: `${ctx.user.name} requested the ${plan.name} plan (${billingCycle.toLowerCase()}, ${seats} seats, ৳${amount}) for ${org.name}`,
  })

  // notify every platform admin to review the request in the console.
  // (Platform admins are org-less — Notification.orgId is nullable, and a row
  // with orgId null stays visible to its target user in any org context — but
  // the shared notifyUsers helper is org-scoped, so these rows are written
  // directly, one per admin.)
  const admins = await db.user.findMany({ where: { platformAdmin: true }, select: { id: true } })
  if (admins.length) {
    await db.notification
      .createMany({
        data: admins.map((a) => ({
          orgId: null,
          userId: a.id,
          type: 'SYSTEM',
          title: `Plan request from ${org.name}`,
          body: `${ctx.user.name} requested the ${plan.name} plan (${billingCycle.toLowerCase()}, ${seats} seats) for ৳${amount}. Review it in the platform console → Requests.`,
        })),
      })
      .catch((e) => console.error('[notify]', e))
  }

  return ok(billingRequestItem(created), 201)
})
