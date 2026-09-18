import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, logActivity } from '@/lib/server/api'
import { getOrgPolicy, parseWorkDays, minutesFromHHMM } from '@/lib/server/policy'
import { localDate, localTime, minutesOfDay, weekdayOf, computeAggregates, buildDayPayload } from '@/lib/server/attendance'

/** note marker appended when someone works on a non-work day (only when no note exists yet) */
const OFF_DAY_NOTE = ' (off-day)'

// POST /api/hr/attendance/check-in — any member checks in for today (self-service, auth+org only).
// T3-b multi-session: every check-in opens a NEW AttendanceSession (unrestricted multi-session);
// the Attendance row is upserted and its aggregates recomputed from the sessions.
export async function POST(req: NextRequest) {
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)

    const policy = await getOrgPolicy(org.id)
    const now = new Date()
    const date = localDate(now)

    // work-day check (1=Mon..7=Sun per policy.workDays CSV)
    const workDays = parseWorkDays(policy.workDays)
    const isWorkDay = workDays.includes(weekdayOf(now))

    // PRESENT when now ≤ checkInTime + lateGraceMins, else LATE; off-day work is always PRESENT
    const checkInMins = minutesFromHHMM(policy.checkInTime)
    const cutoff = (Number.isFinite(checkInMins) ? checkInMins : 540) + policy.lateGraceMins
    const status = !isWorkDay || minutesOfDay(now) <= cutoff ? 'PRESENT' : 'LATE'

    const existing = await db.attendance.findUnique({
      where: { membershipId_date: { membershipId: membership.id, date } },
      select: { note: true },
    })

    const row = await db.attendance.upsert({
      where: { membershipId_date: { membershipId: membership.id, date } },
      create: {
        orgId: org.id,
        membershipId: membership.id,
        date,
        checkIn: now,
        status,
        note: isWorkDay ? null : OFF_DAY_NOTE,
      },
      update: {
        status,
        // keep the off-day marker only when no (HR-set) note exists — never clobber notes
        ...(!isWorkDay && !existing?.note ? { note: OFF_DAY_NOTE } : {}),
      },
    })

    // unrestricted multi-session: always open a new session, even if one is already open
    await db.attendanceSession.create({
      data: { orgId: org.id, membershipId: membership.id, attendanceId: row.id, checkIn: now },
    })

    // recompute row aggregates from all sessions (checkIn=first, checkOut=last closed, workedMinutes=Σ closed)
    const aggregates = await computeAggregates(row.id)
    await db.attendance.update({ where: { id: row.id }, data: aggregates })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'attendance.checkin',
      entityType: 'ATTENDANCE',
      entityId: row.id,
      message: `${ctx.user.name} checked in at ${localTime(now)}`,
    })

    const payload = await buildDayPayload(row.id)
    if (!payload) return fail('Attendance row not found', 404)
    return ok(payload)
  })(req)
}
