import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { canSeeEmployeePii, maskEmail, maskPhone } from './employee-helpers'
import { fromCents } from '@/lib/server/money'

// GET /api/hr/employees — employee directory of the active org
// Contact PII (email/phone) is masked for roles outside PII_ROLES.
export async function GET(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-employees', 'view')
    if (denied) return denied
    const canSeePii = canSeeEmployeePii(membership.role)

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

    const items = memberships.map((m) => {
      const phone = m.phone ?? m.user.phone
      return {
        id: m.id, // membership id — use for PATCH /api/hr/employees/[id]
        userId: m.userId,
        employeeCode: m.employeeCode,
        name: m.user.name,
        email: canSeePii ? m.user.email : maskEmail(m.user.email),
        avatarUrl: m.user.avatarUrl,
        phone: canSeePii ? phone : phone ? maskPhone(phone) : null,
        title: m.title,
        role: m.role,
        status: m.status,
        employmentType: m.employmentType,
        joinedAt: m.joinedAt,
        departmentId: m.departmentId,
        departmentName: m.department?.name ?? null,
        managerId: m.managerId,
        managerName: m.managerId ? (managerNames.get(m.managerId) ?? null) : null,
        // C7: baseSalary is now Int cents in the DB — convert to dollars for the API response.
        // Only PII-roles see salary (defense in depth — PATCH is OWNER/ADMIN/HR only).
        baseSalary: canSeePii ? fromCents(m.baseSalary) : null,
      }
    })

    return ok({ items })
  })(req)
}
