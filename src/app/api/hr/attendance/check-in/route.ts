import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, logActivity } from '@/lib/server/api'
import { getOrgPolicy, parseWorkDays, minutesFromHHMM } from '@/lib/server/policy'
import {
  localDate,
  localTime,
  weekdayOf,
  computeAggregates,
  buildDayPayload,
  baseDayStatus,
} from '@/lib/server/attendance'

/** note marker appended when someone works on a non-work day (only when no note exists yet) */
const OFF_DAY_NOTE = ' (off-day)'

// POST /api/hr/attendance/check-in — any member checks in for today (self-service, auth+org only).
// T3-b multi-session: every check-in opens a NEW AttendanceSession (unrestricted multi-session);
// the Attendance row is upserted and its aggregates recomputed from the sessions.
// F1: the day's status derives from the EARLIEST session check-in vs checkInTime +
// lateGraceMins in the ORG timezone — a later re-check-in never flips PRESENT→LATE.
export async function POST(req: NextRequest) {
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const tz = org.timezone

    const policy = await getOrgPolicy(org.id)
    const now = new Date()
    const date = localDate(now, tz)

    // work-day check (1=Mon..7=Sun per policy.workDays CSV) in org tz
    const workDays = parseWorkDays(policy.workDays)
    const isWorkDay = workDays.includes(weekdayOf(now, tz))

    // PRESENT when the day's earliest check-in ≤ checkInTime + lateGraceMins, else LATE;
    // off-day work is always PRESENT
    const checkInMins = minutesFromHHMM(policy.checkInTime)
    const cutoff = (Number.isFinite(checkInMins) ? checkInMins : 540) + policy.lateGraceMins
    const initialStatus = baseDayStatus(now, isWorkDay, cutoff, tz)

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
        status: initialStatus,
        note: isWorkDay ? null : OFF_DAY_NOTE,
      },
      update: {
        // keep the off-day marker only when no (HR-set) note exists — never clobber notes;
        // status is NOT set here: it is recomputed below from the day's earliest session
        ...(!isWorkDay && !existing?.note ? { note: OFF_DAY_NOTE } : {}),
      },
    })

    // unrestricted multi-session: always open a new session, even if one is already open
    await db.attendanceSession.create({
      data: { orgId: org.id, membershipId: membership.id, attendanceId: row.id, checkIn: now },
    })

    // recompute row aggregates from all sessions (checkIn=first, checkOut=last closed, workedMinutes=Σ closed)
    // and derive the status from the EARLIEST session check-in — the 09:00 PRESENT person
    // re-checking-in at 13:00 stays PRESENT.
    const aggregates = await computeAggregates(row.id)
    const status = baseDayStatus(aggregates.checkIn, isWorkDay, cutoff, tz)
    await db.attendance.update({ where: { id: row.id }, data: { ...aggregates, status } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'attendance.checkin',
      entityType: 'ATTENDANCE',
      entityId: row.id,
      message: `${ctx.user.name} checked in at ${localTime(now, tz)}`,
    })

    const payload = await buildDayPayload(row.id)
    if (!payload) return fail('Attendance row not found', 404)
    return ok(payload)
  })(req)
}
