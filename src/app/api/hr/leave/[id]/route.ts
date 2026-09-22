import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, oneOf, logActivity, notifyUsers } from '@/lib/server/api'
import { getOrgPolicy, parseWorkDays } from '@/lib/server/policy'
import { holidayDateKeys } from '@/lib/server/holidays'
import { storedDateKey, addDaysToKey, weekdayOfDateKey } from '@/lib/server/tz'

const LEAVE_ACTIONS = ['approve', 'reject', 'cancel'] as const

const INCLUDE = {
  membership: { select: { userId: true, user: { select: { name: true, avatarUrl: true } } } },
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
  membership: { userId: string; user: { name: string; avatarUrl: string | null } }
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

async function approverName(orgId: string, approverMembershipId: string | null): Promise<string | null> {
  if (!approverMembershipId) return null
  const mgr = await db.membership.findFirst({
    where: { id: approverMembershipId, orgId },
    select: { user: { select: { name: true } } },
  })
  return mgr?.user.name ?? null
}

// PATCH /api/hr/leave/[id] — {action: 'approve'|'reject'|'cancel'}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const b = await body(req)
    const action = oneOf(b.action, LEAVE_ACTIONS)

    const lr = await db.leaveRequest.findUnique({ where: { id }, include: INCLUDE })
    if (!lr || lr.orgId !== org.id) return fail('Leave request not found', 404)

    if (action === 'cancel') {
      if (lr.membershipId !== membership.id) return fail('You can only cancel your own requests', 403)
      if (lr.status !== 'PENDING') return fail('Only pending requests can be cancelled', 400)
      const updated = await db.leaveRequest.update({
        where: { id: lr.id },
        data: { status: 'CANCELLED' },
        include: INCLUDE,
      })
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'leave.cancelled',
        entityType: 'LEAVE_REQUEST',
        entityId: lr.id,
        message: `${ctx.user.name} cancelled their leave request (${lr.days} day(s) ${lr.leaveType.name})`,
      })
      return ok(mapLeave(updated, await approverName(org.id, updated.approverMembershipId)))
    }

    // approve / reject — OWNER/ADMIN/MANAGER/HR
    requireRole(ctx, ['ADMIN', 'MANAGER', 'HR'])
    if (lr.status !== 'PENDING') return fail('Request has already been decided', 400)

    const status = action === 'approve' ? 'APPROVED' : 'REJECTED'
    const updated = await db.leaveRequest.update({
      where: { id: lr.id },
      data: { status, approverMembershipId: membership.id, decidedAt: new Date() },
      include: INCLUDE,
    })

    await notifyUsers({
      orgId: org.id,
      userIds: [lr.membership.userId],
      type: 'LEAVE',
      title: `Your leave request was ${action === 'approve' ? 'approved' : 'rejected'}`,
      body: `${lr.days} day(s) of ${lr.leaveType.name}`,
      module: 'hr-leave',
    })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: action === 'approve' ? 'leave.approved' : 'leave.rejected',
      entityType: 'LEAVE_REQUEST',
      entityId: lr.id,
      message:
        action === 'approve'
          ? `${ctx.user.name} approved ${lr.membership.user.name}'s leave request`
          : `${ctx.user.name} rejected ${lr.membership.user.name}'s leave request`,
    })

    // T3-b: on APPROVE, sync attendance — every WORK day (policy.workDays) in [startDate..endDate]
    // gets an Attendance row with status LEAVE — but only when no row exists OR the existing row has
    // no sessions (never clobber a day that already has real check-in/out sessions).
    // T5: org holidays (govt/company/custom) in the range are SKIPPED — a holiday is not leave.
    // F1: the range is iterated in calendar date-key space (stored whole-day rows).
    if (action === 'approve') {
      const policy = await getOrgPolicy(org.id)
      const workDays = parseWorkDays(policy.workDays)
      const orgHolidays = await db.holiday.findMany({
        where: { orgId: org.id, startDate: { lte: lr.endDate }, endDate: { gte: lr.startDate } },
        select: { startDate: true, endDate: true },
      })
      const holidayKeys = holidayDateKeys(orgHolidays)
      let cursor = storedDateKey(lr.startDate)
      const endKey = storedDateKey(lr.endDate)
      let guard = 0
      while (cursor <= endKey && guard < 400) {
        const weekday = weekdayOfDateKey(cursor) // 1=Mon..7=Sun
        if (workDays.includes(weekday) && !holidayKeys.has(cursor)) {
          const existing = await db.attendance.findUnique({
            where: { membershipId_date: { membershipId: lr.membershipId, date: cursor } },
            include: { _count: { select: { sessions: true } } },
          })
          if (!existing || existing._count.sessions === 0) {
            await db.attendance.upsert({
              where: { membershipId_date: { membershipId: lr.membershipId, date: cursor } },
              create: { orgId: org.id, membershipId: lr.membershipId, date: cursor, status: 'LEAVE' },
              update: { status: 'LEAVE' },
            })
          }
        }
        cursor = addDaysToKey(cursor, 1)
        guard++
      }
    }

    return ok(mapLeave(updated, await approverName(org.id, updated.approverMembershipId)))
  })(req)
}

// DELETE /api/hr/leave/[id] — requester deletes their own PENDING request
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)

    const lr = await db.leaveRequest.findUnique({ where: { id } })
    if (!lr || lr.orgId !== org.id) return fail('Leave request not found', 404)
    if (lr.membershipId !== membership.id) return fail('You can only delete your own requests', 403)
    if (lr.status !== 'PENDING') return fail('Only pending requests can be deleted', 400)

    await db.leaveRequest.delete({ where: { id: lr.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'leave.deleted',
      entityType: 'LEAVE_REQUEST',
      entityId: lr.id,
      message: `${ctx.user.name} deleted a pending leave request`,
    })

    return ok({ id: lr.id })
  })(req)
}
