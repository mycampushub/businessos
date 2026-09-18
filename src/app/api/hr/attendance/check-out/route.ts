import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, logActivity } from '@/lib/server/api'
import { getOrgPolicy } from '@/lib/server/policy'
import { localDate, localTime, computeAggregates, buildDayPayload } from '@/lib/server/attendance'

type TaskEntryInput = {
  taskId: string | null
  minutes: number
  note: string | null
}

// POST /api/hr/attendance/check-out — closes the LATEST open session of today, stores task entries,
// recomputes Attendance aggregates + HALF_DAY status and Task.actualHours for referenced tasks.
// body: { note?: string, taskEntries?: [{ taskId?: string, minutes: number, note?: string }] }
export async function POST(req: NextRequest) {
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const b = await body<Record<string, unknown>>(req)

    const date = localDate()

    // ---- latest open session for ctx member today ----
    const row = await db.attendance.findUnique({
      where: { membershipId_date: { membershipId: membership.id, date } },
      include: {
        sessions: { orderBy: { checkIn: 'asc' }, select: { id: true, checkIn: true, checkOut: true } },
      },
    })
    const openSession = row?.sessions.filter((s) => !s.checkOut).pop()
    if (!row || !openSession) return fail('No open check-in session', 400)

    // ---- session note ----
    let note: string | null = null
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== 'string') return fail('Note must be a string', 422)
      note = b.note.trim()
      if (note.length > 500) return fail('Note must be at most 500 characters', 422)
      if (!note) note = null
    }

    // ---- task entries validation (no writes on invalid input) ----
    const entries: TaskEntryInput[] = []
    if (b.taskEntries !== undefined && b.taskEntries !== null) {
      if (!Array.isArray(b.taskEntries)) return fail('taskEntries must be an array', 422)
      for (const raw of b.taskEntries) {
        if (!raw || typeof raw !== 'object') return fail('Invalid task entry', 422)
        const e = raw as Record<string, unknown>
        const minutes = e.minutes
        if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
          return fail('Task entry minutes must be an integer between 1 and 1440', 422)
        }
        let taskId: string | null = null
        if (e.taskId !== undefined && e.taskId !== null && e.taskId !== '') {
          if (typeof e.taskId !== 'string') return fail('Task entry taskId must be a string', 422)
          taskId = e.taskId
        }
        let entryNote: string | null = null
        if (e.note !== undefined && e.note !== null) {
          if (typeof e.note !== 'string') return fail('Task entry note must be a string', 422)
          entryNote = e.note.trim()
          if (entryNote.length > 500) return fail('Task entry note must be at most 500 characters', 422)
          if (!entryNote) entryNote = null
        }
        entries.push({ taskId, minutes, note: entryNote })
      }
    }

    // referenced tasks must belong to ctx.org
    const taskIds = [...new Set(entries.map((e) => e.taskId).filter((t): t is string => !!t))]
    if (taskIds.length) {
      const found = await db.task.findMany({
        where: { orgId: org.id, id: { in: taskIds } },
        select: { id: true },
      })
      if (found.length !== taskIds.length) return fail('Unknown task', 422)
    }

    // ---- close the session ----
    const now = new Date()
    const diffMins = Math.floor((now.getTime() - openSession.checkIn.getTime()) / 60000)
    const minutes = diffMins < 1 ? 1 : diffMins
    await db.attendanceSession.update({
      where: { id: openSession.id },
      data: { checkOut: now, minutes, note },
    })

    // ---- task entries linked to the session ----
    if (entries.length) {
      await db.sessionTaskEntry.createMany({
        data: entries.map((e) => ({ sessionId: openSession.id, taskId: e.taskId, minutes: e.minutes, note: e.note })),
      })
    }

    // ---- recompute Attendance aggregates + HALF_DAY rule ----
    const policy = await getOrgPolicy(org.id)
    const aggregates = await computeAggregates(row.id)
    const data: { checkIn: Date | null; checkOut: Date | null; workedMinutes: number; status?: string } = {
      ...aggregates,
    }
    if (
      aggregates.workedMinutes > 0 &&
      aggregates.workedMinutes < policy.halfDayMins &&
      (row.status === 'PRESENT' || row.status === 'LATE')
    ) {
      data.status = 'HALF_DAY' // never downgrades LEAVE/HOLIDAY/ABSENT statuses set by HR
    }
    await db.attendance.update({ where: { id: row.id }, data })

    // ---- recompute actualHours = round(Σ all SessionTaskEntry minutes for the task / 60, 1) ----
    for (const taskId of taskIds) {
      const taskEntries = await db.sessionTaskEntry.findMany({
        where: { taskId },
        select: { minutes: true },
      })
      const totalMinutes = taskEntries.reduce((sum, e) => sum + e.minutes, 0)
      await db.task.update({
        where: { id: taskId },
        data: { actualHours: Math.round((totalMinutes / 60) * 10) / 10 },
      })
    }

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'attendance.checkout',
      entityType: 'ATTENDANCE',
      entityId: row.id,
      message: `${ctx.user.name} checked out at ${localTime(now)} (${Math.floor(aggregates.workedMinutes / 60)}h ${aggregates.workedMinutes % 60}m worked today)`,
    })

    const payload = await buildDayPayload(row.id)
    if (!payload) return fail('Attendance row not found', 404)
    return ok(payload)
  })(req)
}
