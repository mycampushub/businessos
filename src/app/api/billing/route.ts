import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg, requireRole } from '@/lib/server/api'
import { getOrgPlanLimits, planItem, planSubscriptionCounts, billingRequestInclude, billingRequestItem } from '@/lib/server/billing'
import { fromCents0 } from '@/lib/server/money'

/** GET /api/billing — the tenant Billing & Plan page in one call.
 *  OWNER/ADMIN only. Deliberately readable for EXPIRED orgs (the 402 write-gate
 *  exempts /api/billing) so they can see usage and request a renewal. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  requireRole(ctx, ['ADMIN']) // OWNER always passes
  const { org } = requireOrg(ctx)

  const [sub, limits, plans, counts, requests, members, projects, documents, tasks, storage] = await Promise.all([
    db.subscription.findFirst({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      select: {
        plan: { select: { code: true, name: true } },
        billingCycle: true,
        status: true,
        seats: true,
        amountMonthly: true,
        currentPeriodEnd: true,
      },
    }),
    getOrgPlanLimits(org.id),
    db.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    planSubscriptionCounts(),
    db.billingRequest.findMany({
      where: { orgId: org.id },
      include: billingRequestInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.membership.count({ where: { orgId: org.id, status: 'ACTIVE' } }),
    db.project.count({ where: { orgId: org.id, status: { notIn: ['CANCELLED', 'ARCHIVED'] } } }),
    db.document.count({ where: { orgId: org.id } }),
    db.task.count({ where: { orgId: org.id } }),
    db.document.aggregate({ where: { orgId: org.id }, _sum: { size: true } }),
  ])

  return ok({
    subscription: sub
      ? {
          planName: sub.plan.name,
          planCode: sub.plan.code,
          cycle: sub.billingCycle,
          status: sub.status,
          seats: sub.seats,
          // C7: amountMonthly is now Int cents in the DB — convert to dollars for the API response
          amountMonthly: fromCents0(sub.amountMonthly),
          currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        }
      : null,
    usage: {
      members,
      projects,
      documents,
      tasks,
      storageBytes: storage._sum.size ?? 0,
    },
    limits,
    plans: plans.map((p) => planItem(p, counts.get(p.id) ?? 0)),
    requests: requests.map(billingRequestItem),
  })
})
