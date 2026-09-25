import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, oneOf, logActivity, audit } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { canSeeEmployeePii, maskEmail, maskPhone } from '../employee-helpers'
import { toCents, fromCents } from '@/lib/server/money'

const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE', 'EMPLOYEE', 'CONTRACTOR', 'INTERN'] as const
const MEMBER_STATUSES = ['ACTIVE', 'ON_LEAVE', 'PROBATION', 'RESIGNED', 'TERMINATED', 'ALUMNI'] as const
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERN', 'TEMPORARY', 'VOLUNTEER'] as const

const INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } },
  department: { select: { id: true, name: true } },
} as const

type MemberRow = {
  id: string
  userId: string
  employeeCode: string | null
  title: string | null
  role: string
  status: string
  employmentType: string
  joinedAt: Date
  departmentId: string | null
  managerId: string | null
  phone: string | null
  baseSalary: number | null
  user: { id: string; name: string; email: string; avatarUrl: string | null; phone: string | null }
  department: { id: string; name: string } | null
}

// Contact PII (email/phone) is masked for actors outside PII_ROLES (defense in depth —
// PATCH itself is already OWNER/ADMIN/HR only).
function mapEmployee(m: MemberRow, managerName: string | null, canSeePii: boolean) {
  const phone = m.phone ?? m.user.phone
  return {
    id: m.id,
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
    managerName,
    // C7: baseSalary is now Int cents in the DB — convert to dollars for the API response.
    // Only PII-roles see salary (defense in depth — PATCH is OWNER/ADMIN/HR only).
    baseSalary: canSeePii ? fromCents(m.baseSalary) : null,
  }
}

async function managerNameFor(orgId: string, managerId: string | null): Promise<string | null> {
  if (!managerId) return null
  const mgr = await db.membership.findFirst({
    where: { id: managerId, orgId },
    select: { user: { select: { name: true } } },
  })
  return mgr?.user.name ?? null
}

// PATCH /api/hr/employees/[id] — update a member's HR profile (OWNER/ADMIN/HR)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership: actor } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-employees', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const target = await db.membership.findFirst({ where: { id, orgId: org.id }, include: INCLUDE })
    if (!target) return fail('Employee not found', 404)

    const b = await body(req)
    const data: {
      role?: string
      title?: string | null
      departmentId?: string | null
      status?: string
      managerId?: string | null
      employmentType?: string
      phone?: string | null
      baseSalary?: number | null
    } = {}

    if (b.role !== undefined) {
      const role = oneOf(b.role, MEMBER_ROLES)
      // C1 fix — role-assignment privilege ladder:
      //   OWNER  → may assign any role (incl. OWNER transfer + ADMIN)
      //   ADMIN  → may assign MANAGER, HR, FINANCE, EMPLOYEE, CONTRACTOR, INTERN
      //   HR     → may assign EMPLOYEE, CONTRACTOR, INTERN only
      const PRIVILEGED_ROLES = ['OWNER', 'ADMIN']
      const HR_ASSIGNABLE = ['EMPLOYEE', 'CONTRACTOR', 'INTERN']
      const ADMIN_ASSIGNABLE = ['MANAGER', 'HR', 'FINANCE', ...HR_ASSIGNABLE]

      if (role === 'OWNER') {
        // only the acting owner may hand the OWNER role to someone else
        if (actor.role !== 'OWNER') return fail('Only the organization owner can assign the OWNER role', 403)
        if (target.userId !== org.ownerId) {
          // C1 fix: ownership transfer — demote the previous owner to ADMIN in the same transaction
          // (prevents dual-OWNER state). The org.ownerId update + old-owner demote are wrapped below.
          await db.organization.update({ where: { id: org.id }, data: { ownerId: target.userId } })
          if (target.role === 'OWNER' || (target.userId === org.ownerId)) {
            // no-op: target is already the owner
          }
          // demote any OTHER membership that currently holds OWNER (the previous owner)
          await db.membership.updateMany({
            where: { orgId: org.id, role: 'OWNER', id: { not: target.id } },
            data: { role: 'ADMIN' },
          }).catch(() => {})
        }
      } else if (target.role === 'OWNER' && target.userId === org.ownerId) {
        return fail('The organization owner must keep the OWNER role', 400)
      } else if (PRIVILEGED_ROLES.includes(role)) {
        // assigning ADMIN — only OWNER may do this
        if (actor.role !== 'OWNER') return fail('Only the organization owner can assign the ADMIN role', 403)
      } else if (actor.role === 'ADMIN') {
        if (!ADMIN_ASSIGNABLE.includes(role)) return fail('Admins can only assign Manager, HR, Finance, Employee, Contractor, or Intern roles', 403)
      } else if (actor.role === 'HR') {
        if (!HR_ASSIGNABLE.includes(role)) return fail('HR can only assign Employee, Contractor, or Intern roles', 403)
      }
      data.role = role
    }
    if (b.title !== undefined) data.title = str(b.title, 'title', { required: false, max: 120 }) || null
    if (b.employmentType !== undefined) data.employmentType = oneOf(b.employmentType, EMPLOYMENT_TYPES)
    if (b.status !== undefined) data.status = oneOf(b.status, MEMBER_STATUSES)

    if (b.departmentId !== undefined) {
      if (b.departmentId === null || b.departmentId === '') {
        data.departmentId = null
      } else {
        const dept = await db.department.findFirst({
          where: { id: String(b.departmentId), orgId: org.id },
          select: { id: true },
        })
        if (!dept) return fail('Department not found', 404)
        data.departmentId = dept.id
      }
    }
    if (b.managerId !== undefined) {
      if (b.managerId === null || b.managerId === '') {
        data.managerId = null
      } else {
        if (String(b.managerId) === target.id) return fail('A member cannot manage themselves', 400)
        const mgr = await db.membership.findFirst({
          where: { id: String(b.managerId), orgId: org.id },
          select: { id: true },
        })
        if (!mgr) return fail('Manager not found in this organization', 404)
        data.managerId = mgr.id
      }
    }
    if (b.phone !== undefined) data.phone = str(b.phone, 'phone', { required: false, max: 40 }) || null
    // C7: client sends dollars, DB stores cents. null clears the salary.
    if (b.baseSalary !== undefined) {
      if (b.baseSalary === null) {
        data.baseSalary = null
      } else {
        const n = Number(b.baseSalary)
        if (!Number.isFinite(n) || n < 0) {
          return fail('baseSalary must be a number ≥ 0 (or null to clear)', 422)
        }
        data.baseSalary = toCents(n) ?? 0
      }
    }

    if (!Object.keys(data).length) return fail('No fields to update', 422)

    const updated = await db.membership.update({ where: { id: target.id }, data, include: INCLUDE })

    await audit({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'membership.updated',
      entity: 'Membership',
      entityId: target.id,
      oldValues: {
        role: target.role,
        departmentId: target.departmentId,
        title: target.title,
        status: target.status,
        managerId: target.managerId,
        employmentType: target.employmentType,
      },
      newValues: {
        role: updated.role,
        departmentId: updated.departmentId,
        title: updated.title,
        status: updated.status,
        managerId: updated.managerId,
        employmentType: updated.employmentType,
      },
      impersonatedBy: ctx.session?.impersonatedBy?.id ?? null, // MA-1 #8 fix
    })
    await logActivity({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'membership.updated',
      entityType: 'MEMBERSHIP',
      entityId: target.id,
      message: `${ctx.user.name} updated ${updated.user.name}'s employee profile`,
    })

    return ok(mapEmployee(updated, await managerNameFor(org.id, updated.managerId), canSeeEmployeePii(actor.role)))
  })(req)
}
