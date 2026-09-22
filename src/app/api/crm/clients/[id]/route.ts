import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

type RouteParams = { params: Promise<{ id: string }> }

const CLIENT_STATUSES = ['PROSPECT', 'ACTIVE', 'INACTIVE', 'CHURNED'] as const

/** PATCH /api/crm/clients/[id] — edit a client record (status + health note).
 *  CRM_ROLES gate (OWNER/ADMIN/MANAGER) + crm-contacts module FULL (contacts & clients board). */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    requireRole(ctx, ['MANAGER', 'ADMIN']) // CRM_ROLES (OWNER auto-allowed)
    const denied = requireAccess(ctx, 'crm-contacts', 'full')
    if (denied) return denied

    const client = await db.client.findFirst({ where: { id, orgId: org.id } })
    if (!client) return fail('Client not found', 404)

    const b = await body(req)
    const update: Record<string, unknown> = {}

    if (b.status !== undefined) {
      update.status = oneOf(b.status, CLIENT_STATUSES)
    }
    if (b.healthNote !== undefined) {
      update.healthNote =
        b.healthNote === null ? null : str(b.healthNote, 'healthNote', { required: false, max: 2000 }) || null
    }

    if (Object.keys(update).length === 0) return fail('No valid fields to update', 422)

    const updated = await db.client.update({ where: { id: client.id }, data: update })

    const bits: string[] = []
    if (update.status !== undefined && update.status !== client.status) {
      bits.push(`status ${client.status} → ${updated.status}`)
    }
    if (update.healthNote !== undefined) bits.push('health note updated')
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'client.updated',
      entityType: 'CLIENT',
      entityId: client.id,
      message: `Client "${client.name}" updated${bits.length ? ` — ${bits.join(', ')}` : ''}`,
    })

    return ok(updated)
  })(req)
}
