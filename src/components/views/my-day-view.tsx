'use client'

import { useEffect, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import {
  fmtDate, fmtTime, minutesToHours, relativeTime, dueLabel, currencySymbol,
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE,
  TASK_STATUS_LABELS, TASK_STATUS_TONE,
} from '@/lib/format'
import type { BadgeTone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Sun, Timer, LogIn, LogOut, ArrowRight, Plus, Trash2, Clock, CalendarRange, TrendingUp,
  CheckSquare, CalendarDays, AlertTriangle, Umbrella, History,
} from 'lucide-react'

// ---------- local types (GET /api/my/day — frozen T3-b contract) ----------

interface SessionEntry {
  id: string
  taskId: string | null
  taskTitle: string | null
  minutes: number
  note: string | null
}

interface Session {
  id: string
  checkIn: string
  checkOut: string | null
  minutes: number | null
  note: string | null
  entries: SessionEntry[]
}

interface MyDayData {
  today: {
    date: string
    status: string | null
    checkIn: string | null
    checkOut: string | null
    workedMinutes: number | null
    openSession: boolean
    sessions: Session[]
  }
  stats: {
    hoursThisWeek: number
    hoursThisMonth: number
    avgDailyMinutes: number
    daysPresent30: number
    lateDays30: number
    onTimeRate: number
    tasksCompleted30: number
    tasksOverdue: number
  }
  hoursTrend: Array<{ date: string; minutes: number }>
  tasksToday: TaskLite[]
  tasksOverdue: TaskLite[]
  leaveBalances: Array<{
    leaveTypeId: string
    name: string
    color: string | null
    paid: boolean
    usedDays: number
    entitledDays: number
  }>
  /** T5: next 5 upcoming org holidays + the late-penalty context for this member. */
  holidays?: Array<{
    id: string
    name: string
    type: string
    startDate: string
    endDate: string
    days: number
    description: string | null
  }>
  latePolicy?: {
    enabled: boolean
    threshold: number
    mode: string
    amount: number
    lateThisMonth: number
    latePenaltyOccurrences: number
  }
  recentActivity: Array<{ id: string; message: string; createdAt: string; actorName: string | null }>
}

/** task slice actually used by this view (API returns the full TASK item) */
interface TaskLite {
  id: string
  title: string
  priority: string
  status: string
  dueDate: string | null
  project: { id: string; name: string; color: string | null } | null
}

/** POST /api/hr/attendance/check-out response (T3-b 10-key shape) */
interface DayPayload {
  id: string
  date: string
  status: string
  checkIn: string | null
  checkOut: string | null
  workedMinutes: number | null
  note: string | null
  sessions: Session[]
  userName: string
  userAvatar: string | null
}

// ---------- helpers ----------

const UNTRACKED = 'none'

/** compact chip label: 45m · 1h · 1.5h */
function hoursCompact(m: number): string {
  if (m < 60) return `${m}m`
  const h = m / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

const SHORT_DATE = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// ---------- upcoming holidays (T5) ----------

const HOLIDAY_TYPE_LABELS: Record<string, string> = { GOVT: 'Government', COMPANY: 'Company', CUSTOM: 'Custom' }
const HOLIDAY_TYPE_TONE: Record<string, BadgeTone> = { GOVT: 'warning', COMPANY: 'info', CUSTOM: 'muted' }

/** holiday rows under the leave balances card */
function UpcomingHolidays({ holidays }: { holidays: Array<{ id: string; name: string; type: string; startDate: string; days: number }> }) {
  return (
    <div className="border-t pt-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4 text-amber-600 dark:text-amber-400" aria-hidden /> Upcoming holidays
      </h4>
      {holidays.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No upcoming holidays.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5" role="list">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center gap-2.5">
              <CalendarDays className="size-4 shrink-0 text-amber-600/80 dark:text-amber-400/80" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
              {h.days > 1 && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {h.days}d
                </span>
              )}
              <StatusBadge
                label={HOLIDAY_TYPE_LABELS[h.type] ?? h.type}
                tone={HOLIDAY_TYPE_TONE[h.type] ?? 'outline'}
                dot={false}
                className="hidden shrink-0 sm:inline-flex"
              />
              <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(h.startDate.slice(0, 10) + 'T12:00:00')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- live clock + running timer ----------

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="inline-flex items-center gap-2" aria-label="Current time">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </span>
  )
}

/** minutes since check-in for an open session — ticks every 30s */
function RunningTimer({ checkIn }: { checkIn: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const mins = Math.max(0, Math.floor((now - new Date(checkIn).getTime()) / 60000))
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
      <Timer className="size-3.5" aria-hidden />
      {mins}m so far
      <span className="sr-only">Session open for {mins} minutes</span>
    </span>
  )
}

function OpenBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      </span>
      Open
    </span>
  )
}

// ---------- session row (check-in card) ----------

function SessionRow({ session, index }: { session: Session; index: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          <span className="text-xs font-normal text-muted-foreground">#{index}</span>
          <LogIn className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="tabular-nums">{fmtTime(session.checkIn)}</span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          {session.checkOut ? (
            <>
              <LogOut className="size-3.5 shrink-0 text-rose-500" aria-hidden />
              <span className="tabular-nums">{fmtTime(session.checkOut)}</span>
            </>
          ) : (
            <OpenBadge />
          )}
        </p>
        {session.checkOut && session.minutes != null ? (
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {minutesToHours(session.minutes)}
          </span>
        ) : (
          <RunningTimer checkIn={session.checkIn} />
        )}
      </div>
      {session.entries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {session.entries.map((e) => (
            <span
              key={e.id}
              className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              title={e.note ?? undefined}
            >
              {e.taskTitle ?? 'Untracked'} · {hoursCompact(e.minutes)}
            </span>
          ))}
        </div>
      )}
      {session.note && <p className="mt-2 text-xs text-muted-foreground">{session.note.trim()}</p>}
    </div>
  )
}

// ---------- task list rows (due today / overdue) ----------

function TaskRow({ task, showDue, onOpen }: { task: TaskLite; showDue: boolean; onOpen: () => void }) {
  const due = dueLabel(task.dueDate)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <PriorityDot priority={task.priority} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
      {task.project && (
        <span className="hidden min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground md:inline-flex">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.project.color ?? '#10b981' }} aria-hidden />
          <span className="max-w-32 truncate">{task.project.name}</span>
        </span>
      )}
      {showDue ? (
        <span className="inline-flex shrink-0 items-center rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
          {due.text}
        </span>
      ) : (
        <StatusBadge
          label={TASK_STATUS_LABELS[task.status] ?? task.status}
          tone={TASK_STATUS_TONE[task.status] ?? 'outline'}
          className="shrink-0"
        />
      )}
    </button>
  )
}

// ---------- chart tooltip (minimal, dashboard-view style) ----------

interface TipDatum {
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

function HoursTip({ active, payload, label }: { active?: boolean; payload?: TipDatum[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { fullDate?: string; hours?: number } | undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{d.fullDate ?? String(label ?? '')}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Worked</span>
        <span className="font-medium tabular-nums">{hoursCompact(Math.round((d.hours ?? 0) * 60))}</span>
      </div>
    </div>
  )
}

// ---------- loading skeleton ----------

function MyDaySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

// ---------- view ----------

export default function MyDayView() {
  const { org, navigate } = useWorkspace()

  const dayData = useData<MyDayData>('/api/my/day')
  const tasksData = useData<{ items: TaskLite[] }>('/api/tasks?view=mine&limit=200')

  const [clocking, setClocking] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const data = dayData.data
  const today = data?.today
  const stats = data?.stats
  const myTasks = tasksData.data?.items ?? []

  const longDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // open (running) session for the checkout dialog — the latest one without a check-out
  const openSession = today?.sessions.find((s) => !s.checkOut) ?? null
  const openSinceMinutes = openSession
    ? Math.max(1, Math.floor((Date.now() - new Date(openSession.checkIn).getTime()) / 60000))
    : 0
  const latePolicy = data?.latePolicy
  const upcomingHolidays = data?.holidays ?? []
  const penaltyText =
    latePolicy?.mode === 'AMOUNT'
      ? `${currencySymbol(org?.currency)}${latePolicy.amount}`
      : "half a day's pay"

  const chart = (data?.hoursTrend ?? []).map((t) => ({
    label: SHORT_DATE(t.date),
    fullDate: new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    hours: Math.round((t.minutes / 60) * 10) / 10,
  }))

  async function checkIn() {
    setClocking(true)
    try {
      await api('/api/hr/attendance/check-in', { method: 'POST' })
      toast({ title: 'Checked in', description: `${fmtTime(new Date())} — new session started.` })
      dayData.refresh()
    } catch {
      // api() toasts the error
    } finally {
      setClocking(false)
    }
  }

  // ---------- render ----------

  if (!dayData.loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={Sun} title="My Workspace" description={`${longDate} · your personal day at ${org?.name ?? 'your workspace'}`} />
        <EmptyState
          icon={Sun}
          title="Couldn't load your day"
          description={dayData.error ?? 'Something went wrong while loading your workspace data.'}
          action={<Button variant="outline" onClick={dayData.refresh}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Sun}
        title="My Workspace"
        description={`${longDate} · your personal day at ${org?.name ?? 'your workspace'}`}
      />

      {dayData.loading || !data || !today || !stats ? (
        <MyDaySkeleton />
      ) : (
        <>
          {/* ---------- check-in hero card ---------- */}
          <Card className="py-0">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> My day
                </CardTitle>
                <CardDescription className="mt-1">Check in, log task hours, check out.</CardDescription>
              </div>
              <LiveClock />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                  <div className="mt-1">
                    {today.status ? (
                      <StatusBadge
                        label={ATTENDANCE_STATUS_LABELS[today.status] ?? today.status}
                        tone={ATTENDANCE_STATUS_TONE[today.status] ?? 'outline'}
                      />
                    ) : (
                      <StatusBadge label="No record" tone="muted" />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">First check-in</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                    <LogIn className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />{fmtTime(today.checkIn)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Last check-out</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                    <LogOut className="size-3.5 text-rose-500" aria-hidden />{fmtTime(today.checkOut)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Worked today</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {today.workedMinutes == null ? '—' : minutesToHours(today.workedMinutes)}
                  </p>
                </div>
                {latePolicy?.enabled && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Late this month</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {latePolicy.lateThisMonth}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        late arrival{latePolicy.lateThisMonth === 1 ? '' : 's'}
                      </span>
                    </p>
                    {latePolicy.latePenaltyOccurrences > 0 && (
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                        {latePolicy.latePenaltyOccurrences} penalty{latePolicy.latePenaltyOccurrences === 1 ? '' : 's'} so
                        far — {penaltyText} deducted from this month&apos;s payroll
                      </p>
                    )}
                  </div>
                )}
              </div>

              {today.sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                  <p className="text-sm font-medium">Haven&apos;t checked in yet — start your day</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Each check-in opens a session; at check-out you log the tasks you worked on.
                  </p>
                </div>
              ) : (
                <div className={cn('flex max-h-64 flex-col gap-2 overflow-y-auto pr-1', today.sessions.length <= 2 && 'max-h-none')}>
                  {today.sessions.map((s, i) => <SessionRow key={s.id} session={s} index={i + 1} />)}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {today.openSession ? (
                  <Button
                    variant="outline"
                    onClick={() => setCheckoutOpen(true)}
                    disabled={clocking}
                    className="min-h-11"
                    aria-label="Check out — closes your open session"
                  >
                    <LogOut className="mr-1.5 size-4" aria-hidden /> Check out
                  </Button>
                ) : (
                  <Button
                    onClick={checkIn}
                    disabled={clocking}
                    className="min-h-11"
                    aria-label="Check in for today"
                  >
                    <LogIn className="mr-1.5 size-4" aria-hidden /> Check in
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {today.openSession
                  ? 'You are checked in — check out to close this session and log its task hours.'
                  : "You haven't checked in yet — check in to start your day."}
              </p>
            </CardContent>
          </Card>

          {/* ---------- stats grid ---------- */}
          <section aria-label="My stats" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatCard label="Hours this week" value={`${stats.hoursThisWeek}h`} sub="Since Monday" icon={Clock} />
            <StatCard label="Hours this month" value={`${stats.hoursThisMonth}h`} sub="Calendar month to date" icon={CalendarRange} />
            <StatCard
              label="On-time rate"
              value={`${stats.onTimeRate}%`}
              sub={`${stats.lateDays30} late day${stats.lateDays30 === 1 ? '' : 's'} in 30d`}
              tone={stats.onTimeRate >= 90 ? 'success' : 'default'}
              icon={TrendingUp}
            />
            <StatCard
              label="Tasks done · 30d"
              value={stats.tasksCompleted30}
              sub={`${stats.tasksOverdue} overdue`}
              icon={CheckSquare}
              onClick={() => navigate('my-tasks')}
            />
          </section>

          {/* ---------- work hours chart ---------- */}
          <Card className="py-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Work hours
              </CardTitle>
              <CardDescription>Hours logged per day — your last 14 recorded days.</CardDescription>
            </CardHeader>
            <CardContent>
              {chart.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No recorded days yet"
                  description="Check in and out to build your work-hours trend."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                      <Tooltip content={<HoursTip />} cursor={{ fill: 'var(--muted)' }} />
                      <Bar dataKey="hours" name="Hours" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- due today / overdue ---------- */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden py-0">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Due today
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {data.tasksToday.length}
                  </span>
                </h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('my-tasks')}>
                  My Tasks <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              </div>
              {data.tasksToday.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium">Nothing due today</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tasks with today&apos;s due date will appear here.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {data.tasksToday.map((t) => <TaskRow key={t.id} task={t} showDue={false} onOpen={() => navigate('my-tasks')} />)}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden py-0">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="size-4 text-rose-500" aria-hidden /> Overdue
                  <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    {stats.tasksOverdue}
                  </span>
                </h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('my-tasks')}>
                  My Tasks <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              </div>
              {data.tasksOverdue.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium">No overdue tasks</p>
                  <p className="mt-1 text-xs text-muted-foreground">You&apos;re all caught up — keep it up.</p>
                </div>
              ) : (
                <div className="max-h-72 divide-y overflow-y-auto">
                  {data.tasksOverdue.map((t) => <TaskRow key={t.id} task={t} showDue onOpen={() => navigate('my-tasks')} />)}
                </div>
              )}
            </Card>
          </div>

          {/* ---------- leave balances + recent activity ---------- */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden py-0">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Umbrella className="size-4 text-amber-600 dark:text-amber-400" aria-hidden /> Leave balances
                </h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('hr-leave')}>
                  View leave <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              </div>
              <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                {data.leaveBalances.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No leave types configured yet.</p>
                ) : (
                  data.leaveBalances.map((b) => {
                    const pct = b.entitledDays > 0
                      ? Math.min(100, Math.round((b.usedDays / b.entitledDays) * 100))
                      : 0
                    return (
                      <div key={b.leaveTypeId} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color ?? '#10b981' }} aria-hidden />
                            {b.name}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge label={b.paid ? 'Paid' : 'Unpaid'} tone={b.paid ? 'success' : 'muted'} dot={false} />
                            <span className="text-xs tabular-nums text-muted-foreground">{b.usedDays} of {b.entitledDays} days</span>
                          </div>
                        </div>
                        <Progress value={pct} aria-label={`${b.name} leave usage`} />
                      </div>
                    )
                  })
                )}
                <UpcomingHolidays holidays={upcomingHolidays} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden py-0">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <History className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> My recent activity
                </h3>
                <span className="text-xs text-muted-foreground">Last {data.recentActivity.length} actions</span>
              </div>
              {data.recentActivity.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No recent activity of yours yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {data.recentActivity.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 border-b px-4 py-2.5 last:border-b-0">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500/70" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{a.message}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(a.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ---------- checkout dialog ---------- */}
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        tasks={myTasks}
        tasksLoading={tasksData.loading}
        openSession={openSession}
        openSinceMinutes={openSinceMinutes}
        onSaved={() => dayData.refresh()}
      />
    </div>
  )
}

// ---------- checkout dialog ----------

interface EntryDraft {
  taskId: string // task id or UNTRACKED
  minutes: string
  note: string
}

const BLANK_ROW: EntryDraft = { taskId: UNTRACKED, minutes: '', note: '' }

function CheckoutDialog({
  open, onOpenChange, tasks, tasksLoading, openSession, openSinceMinutes, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tasks: TaskLite[]
  tasksLoading: boolean
  openSession: Session | null
  openSinceMinutes: number
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<EntryDraft[]>([BLANK_ROW])
  const [saving, setSaving] = useState(false)

  // reset the form whenever the dialog opens
  useEffect(() => {
    if (open) {
      setNote('')
      setRows([BLANK_ROW])
      setSaving(false)
    }
  }, [open])

  function updateRow(i: number, patch: Partial<EntryDraft>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((rs) => [...rs, BLANK_ROW])
  }

  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i))
  }

  async function submit() {
    // skip fully-empty rows; validate the rest (server: integer minutes 1..1440)
    const entries = rows
      .filter((r) => r.taskId !== UNTRACKED || r.minutes !== '' || r.note.trim() !== '')
      .map((r) => ({
        taskId: r.taskId === UNTRACKED ? undefined : r.taskId,
        minutes: Number(r.minutes),
        note: r.note.trim() || undefined,
      }))
    for (const e of entries) {
      if (!Number.isFinite(e.minutes) || !Number.isInteger(e.minutes) || e.minutes < 1 || e.minutes > 1440) {
        toast({
          title: 'Check your task entries',
          description: 'Minutes must be a whole number between 1 and 1440.',
          variant: 'destructive',
        })
        return
      }
    }
    setSaving(true)
    try {
      const data = await api<DayPayload>('/api/hr/attendance/check-out', {
        method: 'POST',
        body: { note: note.trim() || undefined, taskEntries: entries },
      })
      const closed = data.sessions.filter((s) => s.checkOut)
      const last = closed.length ? closed[closed.length - 1] : null
      const logged = last?.minutes ?? data.workedMinutes ?? 0
      toast({
        title: `Checked out — ${logged}m logged`,
        description: `Today's total: ${minutesToHours(data.workedMinutes ?? 0)}${last && last.entries.length ? ` · ${last.entries.length} task entr${last.entries.length === 1 ? 'y' : 'ies'}` : ''}.`,
      })
      onSaved()
      onOpenChange(false)
    } catch {
      // api() toasts the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="size-4 text-rose-500" aria-hidden /> Check out
          </DialogTitle>
          <DialogDescription>
            {openSession
              ? `Closes your open session (since ${fmtTime(openSession.checkIn)} · ~${minutesToHours(openSinceMinutes)} elapsed).`
              : 'Closes your open session for today.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-note">Session note (optional)</Label>
            <Textarea
              id="checkout-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on overall?"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Task entries</Label>
            <div className="hidden gap-2 sm:grid sm:grid-cols-[minmax(0,1.5fr)_88px_minmax(0,1fr)_2.25rem]">
              <span className="text-xs text-muted-foreground">Task</span>
              <span className="text-xs text-muted-foreground">Minutes</span>
              <span className="text-xs text-muted-foreground">Note</span>
              <span />
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_88px_minmax(0,1fr)_2.25rem]"
                >
                  <Select value={r.taskId} onValueChange={(v) => updateRow(i, { taskId: v })}>
                    <SelectTrigger className="w-full" aria-label={`Task for entry ${i + 1}`}>
                      <SelectValue placeholder={tasksLoading ? 'Loading tasks…' : 'Untracked time'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNTRACKED}>Untracked — no task</SelectItem>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="max-w-none">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: t.project?.color ?? '#10b981' }}
                              aria-hidden
                            />
                            <span className="truncate">{t.title}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={1440}
                    step={5}
                    value={r.minutes}
                    onChange={(e) => updateRow(i, { minutes: e.target.value })}
                    placeholder="60"
                    aria-label={`Minutes for entry ${i + 1}`}
                    className="tabular-nums"
                  />
                  <Input
                    value={r.note}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    placeholder="Optional"
                    maxLength={500}
                    aria-label={`Note for entry ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    aria-label={`Remove entry row ${i + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
              <Plus className="mr-1 size-3.5" aria-hidden /> Add task row
            </Button>
            <p className="text-xs text-muted-foreground">
              Log the tasks you worked on this session — hours flow into task actuals.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Checking out…' : 'Check out'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
