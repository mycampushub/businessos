import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ---------- T3-b shared attendance helpers (multi-session) ----------
// Used by: /api/hr/attendance (GET/POST), check-in, check-out, /api/my/day, /api/hr/leave/[id].
// SESSION shape (frozen T3 contract):
//   { id, checkIn, checkOut, minutes, note, entries: [{ id, taskId, taskTitle, minutes, note }] }

/** local (server timezone) YYYY-MM-DD string */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** local HH:MM */
export function localTime(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** minutes since local midnight */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** weekday number 1=Mon..7=Sun (local) */
export function weekdayOf(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

// ---------- session mapping ----------

export const sessionInclude = Prisma.validator<Prisma.AttendanceSessionInclude>()({
  entries: { include: { task: { select: { title: true } } } },
})

export type SessionRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionInclude }>

export type SessionPayload = {
  id: string
  checkIn: Date
  checkOut: Date | null
  minutes: number | null
  note: string | null
  entries: Array<{ id: string; taskId: string | null; taskTitle: string | null; minutes: number; note: string | null }>
}

export function mapSession(s: SessionRow): SessionPayload {
  return {
    id: s.id,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    minutes: s.minutes,
    note: s.note,
    entries: s.entries.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      taskTitle: e.task?.title ?? null,
      minutes: e.minutes,
      note: e.note,
    })),
  }
}

/** Attendance + user + sessions (checkIn asc) — the standard include for attendance reads */
export const attendanceInclude = Prisma.validator<Prisma.AttendanceInclude>()({
  membership: { select: { user: { select: { name: true, avatarUrl: true } } } },
  sessions: { orderBy: { checkIn: 'asc' }, include: sessionInclude },
})

export type AttendanceRow = Prisma.AttendanceGetPayload<{ include: typeof attendanceInclude }>

/** GET /api/hr/attendance item shape (T1-c shape + T3-b sessions) */
export function mapAttendanceItem(r: AttendanceRow) {
  return {
    id: r.id,
    membershipId: r.membershipId,
    userName: r.membership.user.name,
    userAvatar: r.membership.user.avatarUrl,
    date: r.date,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status,
    workedMinutes: r.workedMinutes,
    note: r.note,
    sessions: r.sessions.map(mapSession),
  }
}

// ---------- aggregate recomputation ----------
// Attendance row mirrors its sessions:
//   checkIn = earliest session checkIn · checkOut = latest CLOSED session checkOut
//   workedMinutes = Σ minutes of closed sessions

export async function computeAggregates(attendanceId: string): Promise<{
  checkIn: Date | null
  checkOut: Date | null
  workedMinutes: number
}> {
  const sessions = await db.attendanceSession.findMany({
    where: { attendanceId },
    select: { checkIn: true, checkOut: true, minutes: true },
  })
  let checkIn: Date | null = null
  let checkOut: Date | null = null
  let workedMinutes = 0
  for (const s of sessions) {
    if (!checkIn || s.checkIn < checkIn) checkIn = s.checkIn
    if (s.checkOut && (!checkOut || s.checkOut > checkOut)) checkOut = s.checkOut
    if (s.checkOut) workedMinutes += s.minutes ?? 0
  }
  return { checkIn, checkOut, workedMinutes }
}

/** check-in / check-out response shape (frozen T3 contract):
 *  { id, date, status, checkIn, checkOut, workedMinutes, note, sessions: SESSION[], userName, userAvatar } */
export async function buildDayPayload(attendanceId: string) {
  const row = await db.attendance.findUnique({
    where: { id: attendanceId },
    include: attendanceInclude,
  })
  if (!row) return null
  return {
    id: row.id,
    date: row.date,
    status: row.status,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    workedMinutes: row.workedMinutes,
    note: row.note,
    sessions: row.sessions.map(mapSession),
    userName: row.membership.user.name,
    userAvatar: row.membership.user.avatarUrl,
  }
}
