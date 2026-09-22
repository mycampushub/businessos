import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, logActivity } from '@/lib/server/api'

type RouteParams = { params: Promise<{ id: string }> }

/** DELETE /api/billing/requests/[id] — cancel one of this org's PENDING requests.
 *  Only own-org rows are visible; decided requests are immutable history. */
export async function DELETE(req: NextRequest, route: RouteParams) {
  const { id } = await route.params
  return withAuth(async (_req: NextRequest, ctx) => {
    const actor = requireRole(ctx, ['ADMIN']) // OWNER always passes
    const { org } = requireOrg(ctx)

    const request = await db.billingRequest.findFirst({
      where: { id, orgId: org.id },
      include: { plan: { select: { name: true } } },
    })
    if (!request) return fail('Request not found', 404)
    if (request.status !== 'PENDING') return fail('Only pending requests can be cancelled', 409)

    await db.billingRequest.delete({ where: { id: request.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'billing.request.cancelled',
      entityType: 'BILLING_REQUEST',
      entityId: request.id,
      message: `${ctx.user.name} cancelled the ${request.plan.name} plan request (${request.billingCycle.toLowerCase()}, ${request.seats} seats)`,
    })

    return ok({ id: request.id })
  })(req)
}
