import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { chargeableLeaveDays, holidayDateKeys, holidayContext } from '@/lib/server/holidays'

const INCLUDE = {
  membership: { select: { user: { select: { name: true, avatarUrl: true } } } },
  leaveType: { select: { id: true, name: true, color: true } },
} as const

type LeaveRow = {
  id: string
  membershipId: string
  leaveTypeId: string
  startDate: Date
  endDate: Date
  days: number
  reason: string | null
  status: string
  approverMembershipId: string | null
  decidedAt: Date | null
  createdAt: Date
  membership: { user: { name: string; avatarUrl: string | null } }
  leaveType: { id: string; name: string; color: string | null }
}

function mapLeave(lr: LeaveRow, approverName: string | null) {
  return {
    id: lr.id,
    membershipId: lr.membershipId,
    userName: lr.membership.user.name,
    userAvatar: lr.membership.user.avatarUrl,
    leaveTypeId: lr.leaveType.id,
    leaveTypeName: lr.leaveType.name,
    leaveTypeColor: lr.leaveType.color,
    startDate: lr.startDate,
    endDate: lr.endDate,
    days: lr.days,
    reason: lr.reason,
    status: lr.status,
    approverMembershipId: lr.approverMembershipId,
    approverName,
    decidedAt: lr.decidedAt,
    createdAt: lr.createdAt,
  }
}

/** approverMembershipId is a plain string column (no relation) — resolve names in bulk */
async function approverNameMap(orgId: string, rows: LeaveRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.approverMembershipId).filter((x): x is string => !!x))]
  if (!ids.length) return new Map()
  const approvers = await db.membership.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, user: { select: { name: true } } },
  })
  return new Map(approvers.map((a) => [a.id, a.user.name]))
}

// GET /api/hr/leave?mine=true — leave requests + org leave types + ctx user's balances
// DA-H2 fix: non-approver roles (EMPLOYEE, CONTRACTOR, INTERN) are auto-scoped to their own
// leave requests even without ?mine=true — prevents privacy leak of other employees' leave.
const APPROVER_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR']
export async function GET(req: NextRequest) {
  return withAuth(async (rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-leave', 'view')
    if (denied) return denied
    const mineParam = rq.nextUrl.searchParams.get('mine') === 'true'
    // DA-H2 fix: force self-scoping for non-approvers
    const mine = mineParam || !APPROVER_ROLES.includes(membership.role)

    const rows = await db.leaveRequest.findMany({
      where: { orgId: org.id, ...(mine ? { membershipId: membership.id } : {}) },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    const approvers = await approverNameMap(org.id, rows)

    const leaveTypes = await db.leaveType.findMany({
      where: { orgId: org.id },
      orderBy: { name: 'asc' },
    })
    const used = await db.leaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: { orgId: org.id, membershipId: membership.id, status: 'APPROVED' },
      _sum: { days: true },
    })
    const usedMap = new Map(used.map((u) => [u.leaveTypeId, u._sum.days ?? 0]))

    return ok({
      items: rows.map((r) => mapLeave(r, r.approverMembershipId ? (approvers.get(r.approverMembershipId) ?? null) : null)),
      leaveTypes: leaveTypes.map((lt) => ({ id: lt.id, name: lt.name, daysPerYear: lt.daysPerYear, color: lt.color })),
      balances: leaveTypes.map((lt) => ({
        leaveTypeId: lt.id,
        name: lt.name,
        usedDays: usedMap.get(lt.id) ?? 0,
        entitledDays: lt.daysPerYear,
      })),
    })
  })(req)
}

// POST /api/hr/leave — any member files their own leave request (PENDING)
export async function POST(req: NextRequest) {
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)

    const b = await body(req)
    const leaveTypeId = str(b.leaveTypeId, 'leaveTypeId')
    const lt = await db.leaveType.findFirst({ where: { id: leaveTypeId, orgId: org.id } })
    if (!lt) return fail('Leave type not found', 404)

    // M20 fix: strict YYYY-MM-DD format check before parsing — Date will happily
    // accept a wide range of strings (e.g. "2024-1-2", "2024/01/02", even
    // "Mar 1 2024"), which would silently mask client-side bugs.
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
    const startDateStr = str(b.startDate, 'startDate')
    const endDateStr = str(b.endDate, 'endDate')
    if (!DATE_RE.test(startDateStr)) return fail('Start date must be YYYY-MM-DD', 422)
    if (!DATE_RE.test(endDateStr)) return fail('End date must be YYYY-MM-DD', 422)

    const startDate = new Date(startDateStr)
    const endDate = new Date(endDateStr)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return fail('"startDate" and "endDate" must be valid dates', 422)
    }
    // M20 fix: prevent an inverted range from silently producing a 0- or negative-day
    // request (the day-count math relies on this invariant).
    if (endDateStr < startDateStr) {
      return fail('End date cannot be before start date', 422)
    }

    // T5: days are SERVER-COMPUTED — work days minus weekly holidays (policy) and
    // public/company holidays, in pure calendar-key space. The client "days"
    // value is ignored (preview-only).
    const { holidays, workDays } = await holidayContext(org.id)
    const holidayKeys = holidayDateKeys(holidays)
    const days = chargeableLeaveDays(startDate, endDate, workDays, holidayKeys)
    if (days < 1) {
      return fail('The selected range has no chargeable days — it falls entirely on weekly or public holidays', 422)
    }
    const reason =
      b.reason !== undefined && b.reason !== null ? (String(b.reason).trim().slice(0, 500) || null) : null

    const created = await db.leaveRequest.create({
      data: {
        orgId: org.id,
        membershipId: membership.id,
        leaveTypeId,
        startDate,
        endDate,
        days,
        reason,
        status: 'PENDING',
      },
      include: INCLUDE,
    })

    // notify the requester's manager (fallback: org managers)
    const me = await db.membership.findUnique({
      where: { id: membership.id },
      select: { managerId: true },
    })
    let approverUserIds: string[] = []
    if (me?.managerId) {
      const mgr = await db.membership.findFirst({
        where: { id: me.managerId, orgId: org.id },
        select: { userId: true },
      })
      if (mgr) approverUserIds.push(mgr.userId)
    }
    if (!approverUserIds.length) approverUserIds = await managerUserIds(org.id)
    approverUserIds = [...new Set(approverUserIds)].filter((uid) => uid !== ctx.user.id)
    await notifyUsers({
      orgId: org.id,
      userIds: approverUserIds,
      type: 'LEAVE',
      title: 'Leave request awaiting approval',
      body: `${ctx.user.name} requested ${days} day(s) of ${lt.name}`,
      module: 'hr-leave',
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'leave.requested',
      entityType: 'LEAVE_REQUEST',
      entityId: created.id,
      message: `${ctx.user.name} requested ${days} day(s) of ${lt.name} leave`,
    })

    return ok(mapLeave(created, null))
  })(req)
}
