import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { getOrgPolicy, minutesFromHHMM } from '@/lib/server/policy'
import { localDate, minutesOfDay, sessionInclude, mapSession } from '@/lib/server/attendance'
import { holidayItem, startOfDay, type HolidayRow } from '@/lib/server/holidays'

// ---------- TASK ITEM composition (mirrors /api/tasks — see T1-d/T3 contracts) ----------

const taskInclude = Prisma.validator<Prisma.TaskInclude>()({
  project: { select: { id: true, name: true, color: true, status: true } },
  milestone: { select: { id: true, title: true } },
  subtasks: { select: { id: true, title: true, status: true, assigneeMembershipId: true } },
  _count: { select: { dependencies: true, comments: true } },
})

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

const membershipUserSelect = {
  id: true,
  role: true,
  title: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const

type MemberLite = { id: string; role: string; title: string | null; user: { id: string; name: string; avatarUrl: string | null } }

/** attach assignee/creator membership→user objects to tasks (no direct Prisma relation exists) */
async function enrichTasks(orgId: string, tasks: TaskWithRelations[]) {
  const ids = new Set<string>()
  for (const t of tasks) {
    if (t.assigneeMembershipId) ids.add(t.assigneeMembershipId)
    if (t.creatorMembershipId) ids.add(t.creatorMembershipId)
    for (const s of t.subtasks) if (s.assigneeMembershipId) ids.add(s.assigneeMembershipId)
  }
  const members: MemberLite[] = ids.size
    ? await db.membership.findMany({ where: { orgId, id: { in: [...ids] } }, select: membershipUserSelect })
    : []
  const map = new Map(members.map((m) => [m.id, m]))
  return tasks.map((t) => {
    const assignee = t.assigneeMembershipId ? map.get(t.assigneeMembershipId) ?? null : null
    const creator = t.creatorMembershipId ? map.get(t.creatorMembershipId) ?? null : null
    return {
      ...t,
      assignee,
      assigneeName: assignee?.user.name ?? null,
      creator,
      creatorName: creator?.user.name ?? null,
      subtaskCount: t.subtasks.length,
      subtasks: t.subtasks.map((s) => {
        const sa = s.assigneeMembershipId ? map.get(s.assigneeMembershipId) ?? null : null
        return { ...s, assignee: sa, assigneeName: sa?.user.name ?? null }
      }),
    }
  })
}

// ---------- route ----------

// GET /api/my/day — the signed-in member's own "My Day" dashboard (any org member, NO module access).
// Shape (frozen T3 contract):
// { today, stats, hoursTrend, tasksToday, tasksOverdue, leaveBalances, recentActivity }
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)

  const now = new Date()
  const today = localDate(now)

  // ---- policy (on-time cutoff for the onTimeRate stat) ----
  const policy = await getOrgPolicy(org.id)
  const checkInMins = minutesFromHHMM(policy.checkInTime)
  const cutoff = (Number.isFinite(checkInMins) ? checkInMins : 540) + policy.lateGraceMins

  // ---- today's row + sessions ----
  const todayRow = await db.attendance.findUnique({
    where: { membershipId_date: { membershipId: membership.id, date: today } },
    include: { sessions: { orderBy: { checkIn: 'asc' }, include: sessionInclude } },
  })
  const todayPayload = todayRow
    ? {
        date: todayRow.date,
        status: todayRow.status,
        checkIn: todayRow.checkIn,
        checkOut: todayRow.checkOut,
        workedMinutes: todayRow.workedMinutes,
        openSession: todayRow.sessions.some((s) => !s.checkOut),
        sessions: todayRow.sessions.map(mapSession),
      }
    : {
        date: today,
        status: null,
        checkIn: null,
        checkOut: null,
        workedMinutes: null,
        openSession: false,
        sessions: [] as ReturnType<typeof mapSession>[],
      }

  // ---- stats window (Mon-based week · calendar month · last 30 days) ----
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const start30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
  const fromStats = [monday, monthStart, start30].reduce((a, b) => (a < b ? a : b))
  const mondayStr = localDate(monday)
  const monthStartStr = localDate(monthStart)
  const start30Str = localDate(start30)

  const statsRows = await db.attendance.findMany({
    where: { membershipId: membership.id, date: { gte: localDate(fromStats), lte: today } },
    select: { date: true, status: true, checkIn: true, workedMinutes: true, _count: { select: { sessions: true } } },
  })

  let weekMinutes = 0
  let monthMinutes = 0
  const workedDays: number[] = []
  let daysPresent30 = 0
  let lateDays30 = 0
  let daysWithSessions = 0
  let onTimeDays = 0
  for (const r of statsRows) {
    if (r.date >= mondayStr) weekMinutes += r.workedMinutes ?? 0
    if (r.date >= monthStartStr) monthMinutes += r.workedMinutes ?? 0
    if (r.date < start30Str) continue
    if (r.workedMinutes !== null && r.workedMinutes > 0) workedDays.push(r.workedMinutes)
    if (r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'HALF_DAY') daysPresent30++
    if (r.status === 'LATE') lateDays30++
    if (r._count.sessions > 0) {
      daysWithSessions++
      if (r.checkIn && minutesOfDay(r.checkIn) <= cutoff) onTimeDays++
    }
  }
  const hoursThisWeek = Math.round((weekMinutes / 60) * 10) / 10
  const hoursThisMonth = Math.round((monthMinutes / 60) * 10) / 10
  const avgDailyMinutes = workedDays.length
    ? Math.round(workedDays.reduce((a, b) => a + b, 0) / workedDays.length)
    : 0
  const onTimeRate = daysWithSessions ? Math.round((onTimeDays / daysWithSessions) * 100) : 0

  // ---- hours trend: last 14 days WITH rows, ascending ----
  const trend = await db.attendance.groupBy({
    by: ['date'],
    where: { membershipId: membership.id, date: { lte: today } },
    _sum: { workedMinutes: true },
    orderBy: { date: 'desc' },
    take: 14,
  })
  const hoursTrend = trend
    .map((t) => ({ date: t.date, minutes: t._sum.workedMinutes ?? 0 }))
    .reverse()

  // ---- my tasks: done columns are dynamic (org TASK BoardColumns with isDone) ----
  const columns = await db.boardColumn.findMany({
    where: { orgId: org.id, surface: 'TASK' },
    select: { key: true, order: true, isDone: true },
  })
  const doneKeys = columns.filter((c) => c.isDone).map((c) => c.key)
  const statusOrderMap = new Map(columns.map((c) => [c.key, c.order]))
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const tasksCompleted30 = await db.task.count({
    where: { orgId: org.id, assigneeMembershipId: membership.id, completedAt: { gte: start30 } },
  })
  const tasksOverdueCount = await db.task.count({
    where: {
      orgId: org.id,
      assigneeMembershipId: membership.id,
      status: { notIn: doneKeys },
      dueDate: { lt: todayMidnight },
    },
  })

  const taskBase = { orgId: org.id, assigneeMembershipId: membership.id, status: { notIn: doneKeys } }
  const [todayTasksRaw, overdueTasksRaw] = await Promise.all([
    db.task.findMany({
      where: { ...taskBase, dueDate: { gte: todayMidnight, lt: new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000) } },
      include: taskInclude,
    }),
    db.task.findMany({
      where: { ...taskBase, dueDate: { lt: todayMidnight } },
      include: taskInclude,
    }),
  ])
  const sortTasks = (a: TaskWithRelations, b: TaskWithRelations) => {
    const s = (statusOrderMap.get(a.status) ?? 99) - (statusOrderMap.get(b.status) ?? 99)
    if (s !== 0) return s
    if (a.dueDate === null && b.dueDate === null) return 0
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  }
  const tasksToday = await enrichTasks(org.id, [...todayTasksRaw].sort(sortTasks).slice(0, 10))
  const tasksOverdue = await enrichTasks(org.id, [...overdueTasksRaw].sort(sortTasks).slice(0, 10))

  // ---- leave balances ----
  const leaveTypes = await db.leaveType.findMany({ where: { orgId: org.id }, orderBy: { name: 'asc' } })
  const used = await db.leaveRequest.groupBy({
    by: ['leaveTypeId'],
    where: { orgId: org.id, membershipId: membership.id, status: 'APPROVED' },
    _sum: { days: true },
  })
  const usedMap = new Map(used.map((u) => [u.leaveTypeId, u._sum.days ?? 0]))
  const leaveBalances = leaveTypes.map((lt) => ({
    leaveTypeId: lt.id,
    name: lt.name,
    color: lt.color,
    paid: lt.paid,
    usedDays: usedMap.get(lt.id) ?? 0,
    entitledDays: lt.daysPerYear,
  }))

  // ---- recent own activity ----
  const recentActivity = await db.activityLog.findMany({
    where: { orgId: org.id, actorMembershipId: membership.id },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { actor: { select: { user: { select: { name: true } } } } },
  })

  // ---- T5: upcoming org holidays (next 5 from today) + late-penalty context ----
  const todayMidnightH = startOfDay(now)
  const upcomingHolidays = (
    await db.holiday.findMany({
      where: { orgId: org.id, endDate: { gte: todayMidnightH } },
      orderBy: { startDate: 'asc' },
      take: 8,
    })
  )
    .filter((h) => startOfDay(h.endDate) >= todayMidnightH)
    .slice(0, 5)

  // calendar-month LATE count (mirrors the payroll period cut) + penalty preview
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const myMonthRows = statsRows.filter((r) => r.date.startsWith(monthPrefix))
  const lateThisMonth = myMonthRows.filter((r) => r.status === 'LATE').length
  const latePolicy = {
    enabled: policy.latePenaltyEnabled,
    threshold: policy.latePenaltyThreshold,
    mode: policy.latePenaltyMode,
    amount: policy.latePenaltyAmount,
  }
  const latePenaltyOccurrences = latePolicy.enabled
    ? Math.floor(lateThisMonth / Math.max(1, latePolicy.threshold))
    : 0

  return ok({
    today: todayPayload,
    stats: {
      hoursThisWeek,
      hoursThisMonth,
      avgDailyMinutes,
      daysPresent30,
      lateDays30,
      onTimeRate,
      tasksCompleted30,
      tasksOverdue: tasksOverdueCount,
    },
    hoursTrend,
    tasksToday,
    tasksOverdue,
    leaveBalances,
    holidays: upcomingHolidays.map((h) => holidayItem(h as HolidayRow)),
    latePolicy: {
      ...latePolicy,
      lateThisMonth,
      latePenaltyOccurrences,
    },
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      message: a.message,
      createdAt: a.createdAt,
      actorName: a.actor?.user.name ?? null,
    })),
  })
})
