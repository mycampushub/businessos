import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const COUNT_INCLUDE = { _count: { select: { memberships: true, teams: true } } } as const

type DeptRow = {
  id: string
  orgId: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
  createdAt: Date
  _count: { memberships: number; teams: number }
}

function mapDepartment(d: DeptRow) {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    color: d.color,
    parentId: d.parentId,
    createdAt: d.createdAt,
    memberCount: d._count.memberships,
    teamCount: d._count.teams,
  }
}

// GET /api/departments — org departments (name asc) with member/team counts
export async function GET(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'view')
    if (denied) return denied

    const depts = await db.department.findMany({
      where: { orgId: org.id },
      include: COUNT_INCLUDE,
      orderBy: { name: 'asc' },
    })

    return ok({ items: depts.map(mapDepartment) })
  })(req)
}

// POST /api/departments — create a department (OWNER/ADMIN/HR)
export async function POST(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const b = await body(req)
    const name = str(b.name, 'name', { max: 80 })
    const description =
      b.description !== undefined && b.description !== null
        ? String(b.description).trim().slice(0, 500) || null
        : null
    const color =
      b.color !== undefined && b.color !== null ? (String(b.color).trim().slice(0, 20) || null) : null

    let parentId: string | null = null
    if (b.parentId !== undefined && b.parentId !== null && b.parentId !== '') {
      const parent = await db.department.findFirst({
        where: { id: String(b.parentId), orgId: org.id },
        select: { id: true },
      })
      if (!parent) return fail('Parent department not found', 404)
      parentId = parent.id
    }

    const dept = await db.department.create({
      data: { orgId: org.id, name, description, color, parentId },
      include: COUNT_INCLUDE,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'department.created',
      entityType: 'DEPARTMENT',
      entityId: dept.id,
      message: `${ctx.user.name} created the ${name} department`,
    })

    return ok(mapDepartment(dept))
  })(req)
}
