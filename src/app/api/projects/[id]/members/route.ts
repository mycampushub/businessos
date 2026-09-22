import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity, notifyUsers } from '@/lib/server/api'

type RouteParams = { params: Promise<{ id: string }> }

const membershipSelect = {
  id: true,
  role: true,
  title: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const

/** POST /api/projects/[id]/members — staff the project team.
 *  Gate mirrors PATCH /api/projects/[id]: OWNER/ADMIN/MANAGER or the project's manager.
 *  Body: { membershipId, role? } — 409 when the member is already staffed. */
export async function POST(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const project = await db.project.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, name: true, managerMembershipId: true },
    })
    if (!project) return fail('Project not found', 404)

    const isProjectManager = project.managerMembershipId === membership.id
    const canManage =
      membership.role === 'OWNER' ||
      membership.role === 'ADMIN' ||
      membership.role === 'MANAGER' ||
      isProjectManager
    if (!canManage) return fail('Insufficient permissions', 403)

    const b = await body(req)
    const membershipId = str(b.membershipId, 'membershipId')
    const role = b.role === undefined || b.role === null || b.role === ''
      ? null
      : str(b.role, 'role', { required: false, max: 60 })

    // membership must belong to the same org
    const target = await db.membership.findFirst({
      where: { id: membershipId, orgId: org.id },
      select: { ...membershipSelect, userId: true, status: true },
    })
    if (!target) return fail('Member not found in this organization', 404)

    const existing = await db.projectMember.findFirst({
      where: { projectId: project.id, membershipId },
      select: { id: true },
    })
    if (existing) return fail('This member is already on the project', 409)

    const pm = await db.projectMember.create({
      data: { projectId: project.id, membershipId, role },
      select: { id: true, projectId: true, membershipId: true, role: true },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'project.member.added',
      entityType: 'PROJECT',
      entityId: project.id,
      message: `${target.user.name} added to project "${project.name}"${role ? ` as ${role}` : ''}`,
    })
    if (target.userId !== ctx.user.id) {
      await notifyUsers({
        orgId: org.id,
        userIds: [target.userId],
        type: 'PROJECT',
        title: `You were added to "${project.name}"`,
        body: `${ctx.user.name} staffed you on the project team${role ? ` as ${role}` : ''}.`,
        module: 'projects',
      })
    }

    return ok(
      { ...pm, membership: target, user: target.user },
      201,
    )
  })(req)
}

/** DELETE /api/projects/[id]/members?membershipId=… — remove a member from the
 *  project team (managers only, same gate as POST). */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const project = await db.project.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, name: true, managerMembershipId: true },
    })
    if (!project) return fail('Project not found', 404)

    const isProjectManager = project.managerMembershipId === membership.id
    const canManage =
      membership.role === 'OWNER' ||
      membership.role === 'ADMIN' ||
      membership.role === 'MANAGER' ||
      isProjectManager
    if (!canManage) return fail('Insufficient permissions', 403)

    const membershipId = req.nextUrl.searchParams.get('membershipId')?.trim()
    if (!membershipId) return fail('Query parameter "membershipId" is required', 422)

    const existing = await db.projectMember.findFirst({
      where: { projectId: project.id, membershipId },
      include: { membership: { select: { userId: true, ...membershipSelect } } },
    })
    if (!existing) return fail('This member is not on the project', 404)

    await db.projectMember.delete({ where: { id: existing.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'project.member.removed',
      entityType: 'PROJECT',
      entityId: project.id,
      message: `${existing.membership.user.name} removed from project "${project.name}"`,
    })
    if (existing.membership.userId !== ctx.user.id) {
      await notifyUsers({
        orgId: org.id,
        userIds: [existing.membership.userId],
        type: 'PROJECT',
        title: `You were removed from "${project.name}"`,
        body: `${ctx.user.name} removed you from the project team.`,
        module: 'projects',
      })
    }

    return ok({})
  })(req)
}
