import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { fromCents0 } from '@/lib/server/money'

/**
 * GET /api/crm/clients — org clients with aggregated engagement metrics.
 * Additive read-only route (frontend task T2-b); clients are created by the
 * deal-won flow (see /api/crm/deals/[id] PATCH), never via POST here.
 *
 * Shape: ok({ items: [{ id, name, status, contactEmail, healthNote, since,
 * projectCount, revenue }] }) — projectCount = projects linked to the client,
 * revenue = Σ invoice.total where status PAID|PARTIALLY_PAID.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-contacts', 'view')
  if (denied) return denied

  const [clients, revenueRows] = await Promise.all([
    db.client.findMany({
      where: { orgId: org.id },
      include: { _count: { select: { projects: true } } },
      orderBy: { name: 'asc' },
    }),
    db.invoice.groupBy({
      by: ['clientId'],
      where: { orgId: org.id, status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      _sum: { total: true },
    }),
  ])

  const revenueByClient = new Map(
    revenueRows.filter((r) => r.clientId).map((r) => [r.clientId as string, r._sum.total ?? 0])
  )

  return ok({
    items: clients.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      contactEmail: c.contactEmail,
      healthNote: c.healthNote,
      since: c.since,
      projectCount: c._count.projects,
      revenue: fromCents0(revenueByClient.get(c.id) ?? 0),
    })),
  })
})
