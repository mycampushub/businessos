import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

// GET /api/hr/employees — employee directory of the active org
export async function GET(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-employees', 'view')
    if (denied) return denied

    const memberships = await db.membership.findMany({
      where: { orgId: org.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    })

    // managerId is a plain string column (no Prisma relation) — resolve manager names manually
    const managerIds = [...new Set(memberships.map((m) => m.managerId).filter((x): x is string => !!x))]
    const managers = managerIds.length
      ? await db.membership.findMany({
          where: { id: { in: managerIds }, orgId: org.id },
          select: { id: true, user: { select: { name: true } } },
        })
      : []
    const managerNames = new Map(managers.map((m) => [m.id, m.user.name]))

    const items = memberships.map((m) => ({
      id: m.id, // membership id — use for PATCH /api/hr/employees/[id]
      userId: m.userId,
      employeeCode: m.employeeCode,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      phone: m.phone ?? m.user.phone,
      title: m.title,
      role: m.role,
      status: m.status,
      employmentType: m.employmentType,
      joinedAt: m.joinedAt,
      departmentId: m.departmentId,
      departmentName: m.department?.name ?? null,
      managerId: m.managerId,
      managerName: m.managerId ? (managerNames.get(m.managerId) ?? null) : null,
    }))

    return ok({ items })
  })(req)
}
