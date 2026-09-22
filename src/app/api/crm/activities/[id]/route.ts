import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

type RouteParams = { params: Promise<{ id: string }> }

/** PATCH /api/crm/activities/[id] — complete or reopen a CRM activity.
 *  Body: { completedAt?: Date | null } — a non-null value (or ISO date) marks the
 *  activity done, null reopens it. CRM_ROLES gate (OWNER/ADMIN/MANAGER) +
 *  crm-deals module FULL (activities live on the deals pipeline, like /api/crm/activities). */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    requireRole(ctx, ['MANAGER', 'ADMIN']) // CRM_ROLES (OWNER auto-allowed)
    const denied = requireAccess(ctx, 'crm-deals', 'full')
    if (denied) return denied

    const existing = await db.crmActivity.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Activity not found', 404)

    const b = await body(req)
    if (b.completedAt === undefined) {
      return fail('Field "completedAt" is required (date to complete, null to reopen)', 422)
    }
    if (b.completedAt !== null && typeof b.completedAt === 'string' && b.completedAt !== '') {
      const d = new Date(b.completedAt)
      if (Number.isNaN(d.getTime())) return fail('Invalid completedAt date', 422)
    }

    const done = b.completedAt !== null && b.completedAt !== ''
    const updated = await db.crmActivity.update({
      where: { id: existing.id },
      data: { done },
      include: { createdBy: { select: { user: { select: { name: true } } } } },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: done ? 'crm_activity.completed' : 'crm_activity.reopened',
      entityType: existing.entityType,
      entityId: existing.id,
      message: `${existing.type.charAt(0) + existing.type.slice(1).toLowerCase()} “${existing.subject ?? existing.id}” ${done ? 'completed' : 'reopened'}`,
    })

    return ok({ ...updated, createdByName: updated.createdBy?.user?.name ?? null })
  })(req)
}
