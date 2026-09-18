import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const COUNT_INCLUDE = { _count: { select: { memberships: true, teams: true } } } as const

// PATCH /api/departments/[id] — update a department (OWNER/ADMIN/HR)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const dept = await db.department.findFirst({ where: { id, orgId: org.id }, include: COUNT_INCLUDE })
    if (!dept) return fail('Department not found', 404)

    const b = await body(req)
    const data: {
      name?: string
      description?: string | null
      color?: string | null
      parentId?: string | null
    } = {}

    if (b.name !== undefined) data.name = str(b.name, 'name', { max: 80 })
    if (b.description !== undefined) {
      data.description =
        b.description === null ? null : String(b.description).trim().slice(0, 500) || null
    }
    if (b.color !== undefined) {
      data.color = b.color === null ? null : String(b.color).trim().slice(0, 20) || null
    }
    if (b.parentId !== undefined) {
      if (b.parentId === null || b.parentId === '') {
        data.parentId = null
      } else {
        if (String(b.parentId) === dept.id) return fail('A department cannot be its own parent', 400)
        const parent = await db.department.findFirst({
          where: { id: String(b.parentId), orgId: org.id },
          select: { id: true },
        })
        if (!parent) return fail('Parent department not found', 404)
        data.parentId = parent.id
      }
    }

    if (!Object.keys(data).length) return fail('No fields to update', 422)

    const updated = await db.department.update({ where: { id: dept.id }, data, include: COUNT_INCLUDE })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'department.updated',
      entityType: 'DEPARTMENT',
      entityId: dept.id,
      message: `${ctx.user.name} updated the ${updated.name} department`,
    })

    return ok({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      color: updated.color,
      parentId: updated.parentId,
      createdAt: updated.createdAt,
      memberCount: updated._count.memberships,
      teamCount: updated._count.teams,
    })
  })(req)
}

// DELETE /api/departments/[id] — blocked while members are attached
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const dept = await db.department.findFirst({ where: { id, orgId: org.id } })
    if (!dept) return fail('Department not found', 404)

    const memberCount = await db.membership.count({ where: { departmentId: dept.id } })
    if (memberCount > 0) return fail('Department has members', 400)

    await db.department.delete({ where: { id: dept.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'department.deleted',
      entityType: 'DEPARTMENT',
      entityId: dept.id,
      message: `${ctx.user.name} deleted the ${dept.name} department`,
    })

    return ok({ id: dept.id })
  })(req)
}
