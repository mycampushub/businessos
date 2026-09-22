import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import {
  localDate,
  attendanceInclude,
  mapAttendanceItem,
  mapSession,
} from '@/lib/server/attendance'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY'] as const

// GET /api/hr/attendance?date=YYYY-MM-DD  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 14 days)
// T3-b: items and myToday now include sessions: SESSION[]; workedMinutes is the daily total.
// F1: default range + myToday use org-local date keys (server runs UTC).
// Guard: hr-attendance VIEW (EMPLOYEE default HIDDEN).
export async function GET(req: NextRequest) {
  return withAuth(async (rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-attendance', 'view')
    if (denied) return denied
    const q = rq.nextUrl.searchParams
    const tz = org.timezone

    const dateParam = q.get('date')
    const fromParam = q.get('from')
    const toParam = q.get('to')

    let single: string | null = null
    let from: string
    let to: string
    if (dateParam && DATE_RE.test(dateParam)) {
      single = dateParam
      from = dateParam
      to = dateParam
    } else {
      const today = new Date()
      to = toParam && DATE_RE.test(toParam) ? toParam : localDate(today, tz)
      from =
        fromParam && DATE_RE.test(fromParam)
          ? fromParam
          : localDate(new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000), tz)
    }

    const rows = await db.attendance.findMany({
      where: { orgId: org.id, date: { gte: from, lte: to } },
      include: attendanceInclude,
    })

    const items = rows
      .map(mapAttendanceItem)
      .sort((a, b) =>
        single
          ? a.userName.localeCompare(b.userName)
          : b.date.localeCompare(a.date) || a.userName.localeCompare(b.userName),
      )

    const myTodayRow = await db.attendance.findUnique({
      where: { membershipId_date: { membershipId: membership.id, date: localDate(new Date(), tz) } },
      include: attendanceInclude,
    })

    return ok({
      items,
      date: single,
      range: single ? null : { from, to },
      myToday: myTodayRow ? mapAttendanceItem(myTodayRow) : null,
    })
  })(req)
}

// POST /api/hr/attendance — admin/HR create-or-update a member's attendance row (upsert on [membershipId, date]).
// T3-b: guard is now hr-attendance FULL (module access) instead of a role gate; response includes sessions.
// Manual upserts never touch existing sessions.
export async function POST(req: NextRequest) {
  return withAuth(async (_rq, ctx) => {
    const { org, membership: actor } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-attendance', 'full')
    if (denied) return denied

    const b = await body(req)
    const membershipId = str(b.membershipId, 'membershipId')
    const date = str(b.date, 'date')
    if (!DATE_RE.test(date)) return fail('"date" must be a YYYY-MM-DD string', 422)
    const status = oneOf(b.status, ATTENDANCE_STATUSES)
    const hasNote = b.note !== undefined && b.note !== null
    const note = hasNote ? (String(b.note).trim().slice(0, 500) || null) : undefined

    const target = await db.membership.findFirst({
      where: { id: membershipId, orgId: org.id },
      select: { id: true, user: { select: { name: true, avatarUrl: true } } },
    })
    if (!target) return fail('Member not found', 404)

    const upserted = await db.attendance.upsert({
      where: { membershipId_date: { membershipId, date } },
      create: { orgId: org.id, membershipId, date, status, note: note ?? null },
      update: { status, ...(hasNote ? { note } : {}) },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'attendance.updated',
      entityType: 'ATTENDANCE',
      entityId: upserted.id,
      message: `${ctx.user.name} marked ${target.user.name} as ${status} on ${date}`,
    })

    const row = await db.attendance.findUnique({
      where: { id: upserted.id },
      include: attendanceInclude,
    })
    if (!row) return fail('Attendance row not found', 404)
    const { membership: _m, sessions, ...rest } = row
    void _m
    return ok({
      ...rest,
      userName: target.user.name,
      userAvatar: target.user.avatarUrl,
      sessions: sessions.map(mapSession),
    })
  })(req)
}
