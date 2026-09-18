'use client'

import { useData } from '@/lib/client/api'
import { useWorkspace, type ModuleId } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { money, dueLabel, relativeTime, TASK_STATUS_LABELS, TASK_STATUS_TONE } from '@/lib/format'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  BarChart3, Wallet, Receipt, Target, Briefcase, Clock, FolderKanban, AlertTriangle, Users,
  CalendarCheck, ChevronRight, CheckSquare, Flag, Inbox, Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------- local types (from GET /api/dashboard, worklog T1-a) ----------

interface DashboardData {
  kpis: {
    revenue: number; expenses: number
    openDealsValue: number; openDealsCount: number
    activeProjects: number; overdueTasks: number
    employeeCount: number; todayPresent: number; todayTotal: number
    pendingApprovals: number
  }
  revenueTrend: Array<{ month: string; revenue: number; expenses: number }>
  pipeline: Array<{ stage: string; count: number; value: number }>
  taskStatus: Array<{ status: string; label: string; count: number }>
  attendanceTrend: Array<{ date: string; present: number; late: number; leave: number; absent: number }>
  recentActivities: Array<{ id: string; message: string; action: string; createdAt: string; actorName: string | null }>
  myTasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; projectName: string | null }>
  upcomingDeadlines: Array<{ type: string; title: string; dueDate: string; context: string | null }>
  clients: Array<{ name: string; revenue: number; projectCount: number }>
}

// ---------- chart palette (emerald/amber/rose/teal/lime — themed CSS vars) ----------

const CHART = {
  1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)',
} as const

/** donut cell color — cycles the 5 chart vars by index (any column count works) */
const donutColor = (i: number) => CHART[((i % 5) + 1) as keyof typeof CHART]

const DEADLINE_META: Record<string, { icon: LucideIcon; label: string; target: ModuleId; tint: string }> = {
  TASK: { icon: CheckSquare, label: 'Task', target: 'tasks', tint: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' },
  MILESTONE: { icon: Flag, label: 'Milestone', target: 'tasks', tint: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  INVOICE: { icon: Receipt, label: 'Invoice', target: 'finance-invoices', tint: 'bg-rose-500/12 text-rose-600 dark:text-rose-400' },
}

const ATTENDANCE_DATE = (d: string) => {
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ---------- chart tooltips ----------

interface TipDatum {
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

function TrendTip({ active, payload, label, currency }: {
  active?: boolean; payload?: TipDatum[]; label?: string | number; currency?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{String(label ?? '')}</p>
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-[2px]" style={{ backgroundColor: p.color }} aria-hidden />
              {p.name === 'revenue' ? 'Revenue' : 'Expenses'}
            </span>
            <span className="font-medium tabular-nums">{money(Number(p.value ?? 0), currency, true)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineTip({ active, payload, currency }: { active?: boolean; payload?: TipDatum[]; currency?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { stage?: string; count?: number; value?: number } | undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{d.stage}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{d.count ?? 0} deals</span>
        <span className="font-medium tabular-nums">{money(d.value ?? 0, currency, true)}</span>
      </div>
    </div>
  )
}

function DonutTip({ active, payload }: { active?: boolean; payload?: TipDatum[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { status?: string; label?: string; count?: number } | undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{d.label ?? TASK_STATUS_LABELS[d.status ?? ''] ?? d.status}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Tasks</span>
        <span className="font-medium tabular-nums">{d.count ?? 0}</span>
      </div>
    </div>
  )
}

function AttendanceTip({ active, payload, label }: { active?: boolean; payload?: TipDatum[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { present?: number; late?: number; absent?: number; leave?: number } | undefined
  if (!d) return null
  const rows: Array<[string, number]> = [
    ['Present', d.present ?? 0], ['Late', d.late ?? 0], ['Absent', d.absent ?? 0], ['On leave', d.leave ?? 0],
  ]
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{typeof label === 'string' ? ATTENDANCE_DATE(label) : ''}</p>
      <div className="flex flex-col gap-1">
        {rows.map(([name, n]) => (
          <div key={name} className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">{name}</span>
            <span className="font-medium tabular-nums">{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- shared card + legend bits ----------

function ChartCard({ title, sub, action, children }: {
  title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  )
}

function ListCardHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------- loading skeleton ----------

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

// ---------- view ----------

export default function DashboardView() {
  const { data, loading, error, refresh } = useData<DashboardData>('/api/dashboard')
  const { me, org, navigate } = useWorkspace()
  const currency = org?.currency ?? 'BDT'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = me?.user.name.split(' ')[0] ?? ''

  if (!loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`${greeting}${firstName ? `, ${firstName}` : ''} 👋`} description="Operational overview" />
        <EmptyState
          icon={Inbox}
          title="Couldn't load the dashboard"
          description={error ?? 'Something went wrong while loading your workspace data.'}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ''} 👋`}
        description={`${org?.name ?? 'Your workspace'} · operational overview`}
        actions={
          <Button variant="outline" onClick={() => navigate('reports')}>
            <BarChart3 className="size-4" aria-hidden /> View reports
          </Button>
        }
      />

      {loading || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI grid */}
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatCard label="Revenue YTD" value={money(data.kpis.revenue, currency, true)} sub="Invoices collected" tone="success" icon={Wallet} />
            <StatCard label="Expenses" value={money(data.kpis.expenses, currency, true)} sub="Approved or paid" tone="warning" icon={Receipt} />
            <StatCard label="Open Deals" value={money(data.kpis.openDealsValue, currency, true)} sub={`${data.kpis.openDealsCount} open deals`} tone="info" icon={Briefcase} onClick={() => navigate('crm-deals')} />
            <StatCard label="Active Projects" value={data.kpis.activeProjects} sub="In delivery" icon={FolderKanban} onClick={() => navigate('projects')} />
            <StatCard label="Overdue Tasks" value={data.kpis.overdueTasks} sub={data.kpis.overdueTasks > 0 ? 'Needs attention' : 'All on track'} tone={data.kpis.overdueTasks > 0 ? 'danger' : 'default'} icon={AlertTriangle} onClick={() => navigate('tasks')} />
            <StatCard label="Employees" value={data.kpis.employeeCount} sub="Active members" icon={Users} onClick={() => navigate('hr-employees')} />
            <StatCard label="Today's Attendance" value={`${data.kpis.todayPresent} / ${data.kpis.todayTotal}`} sub="Checked in today" tone="success" icon={CalendarCheck} onClick={() => navigate('hr-attendance')} />
            <StatCard label="Pending Approvals" value={data.kpis.pendingApprovals} sub="Leave & expenses" tone="warning" icon={Clock} onClick={() => navigate('hr-leave')} />
          </section>

          {/* charts row */}
          <section aria-label="Financial trends" className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Revenue vs expenses"
              sub="Last 6 months"
              action={
                <div className="flex gap-3">
                  <LegendChip color={CHART[1]} label="Revenue" />
                  <LegendChip color={CHART[3]} label="Expenses" />
                </div>
              }
            >
              <div className="h-64" role="img" aria-label="Area chart of revenue versus expenses over the last six months">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART[1]} stopOpacity={0.32} />
                        <stop offset="95%" stopColor={CHART[1]} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dashExpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART[3]} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={CHART[3]} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                    <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: number) => money(v, currency, true)} />
                    <Tooltip content={<TrendTip currency={currency} />} cursor={{ stroke: 'var(--border)' }} />
                    <Area type="monotone" dataKey="revenue" stroke={CHART[1]} strokeWidth={2} fill="url(#dashRevGrad)" />
                    <Area type="monotone" dataKey="expenses" stroke={CHART[3]} strokeWidth={2} fill="url(#dashExpGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Sales pipeline"
              sub="Open deals by stage"
              action={
                <p className="text-xs font-medium tabular-nums text-muted-foreground">
                  {money(data.pipeline.reduce((s, p) => s + p.value, 0), currency, true)} total
                </p>
              }
            >
              <div className="h-64" role="img" aria-label="Vertical bar chart of open deal value by pipeline stage">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.pipeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} maxBarSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="stage"
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickFormatter={(v: string) => (v.length > 9 ? `${v.slice(0, 8)}…` : v)}
                    />
                    <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: number) => money(v, currency, true)} />
                    <Tooltip content={<PipelineTip currency={currency} />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                    <Bar dataKey="value" fill={CHART[2]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>

          {/* task status + attendance */}
          <section aria-label="Workforce overview" className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Task status"
              sub="Across the organization"
              action={<p className="text-xs text-muted-foreground">{data.taskStatus.reduce((s, t) => s + t.count, 0)} total</p>}
            >
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className="relative h-52 w-full max-w-[240px]" role="img" aria-label="Donut chart of task counts by status">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.taskStatus}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="62%"
                        outerRadius="86%"
                        paddingAngle={2}
                        stroke="var(--background)"
                        strokeWidth={2}
                      >
                        {data.taskStatus.map((t, i) => (
                          <Cell key={t.status} fill={donutColor(i)} />
                        ))}
                      </Pie>
                      <Tooltip content={<DonutTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold tabular-nums">{data.taskStatus.reduce((s, t) => s + t.count, 0)}</span>
                    <span className="text-xs text-muted-foreground">tasks</span>
                  </div>
                </div>
                <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:mt-2 sm:w-auto">
                  {data.taskStatus.map((t, i) => (
                    <li key={t.status} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ backgroundColor: donutColor(i) }} aria-hidden />
                        {t.label ?? TASK_STATUS_LABELS[t.status] ?? t.status}
                      </span>
                      <span className="font-medium tabular-nums">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>

            <ChartCard
              title="Attendance trend"
              sub="Last 10 working days"
              action={
                <div className="hidden gap-3 sm:flex">
                  <LegendChip color={CHART[1]} label="Present" />
                  <LegendChip color={CHART[2]} label="Late" />
                  <LegendChip color={CHART[3]} label="Absent" />
                  <LegendChip color={CHART[4]} label="Leave" />
                </div>
              }
            >
              {data.attendanceTrend.length === 0 ? (
                <EmptyState icon={CalendarCheck} title="No attendance yet" description="Check-ins will show up here." />
              ) : (
                <div className="flex flex-col">
                  <div className="h-60" role="img" aria-label="Stacked bar chart of daily attendance over the last ten working days">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.attendanceTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: string) => {
                          const d = new Date(v)
                          return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })
                        }} />
                        <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <Tooltip content={<AttendanceTip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                        <Bar dataKey="present" stackId="att" fill={CHART[1]} />
                        <Bar dataKey="late" stackId="att" fill={CHART[2]} />
                        <Bar dataKey="absent" stackId="att" fill={CHART[3]} />
                        <Bar dataKey="leave" stackId="att" fill={CHART[4]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 flex justify-center gap-3 sm:hidden">
                    <LegendChip color={CHART[1]} label="Present" />
                    <LegendChip color={CHART[2]} label="Late" />
                    <LegendChip color={CHART[3]} label="Absent" />
                    <LegendChip color={CHART[4]} label="Leave" />
                  </div>
                </div>
              )}
            </ChartCard>
          </section>

          {/* my tasks · deadlines · activity */}
          <section aria-label="Personal and recent activity" className="grid gap-4 lg:grid-cols-3">
            <Card className="overflow-hidden py-0">
              <ListCardHeader
                title="My tasks"
                sub="Open tasks assigned to you"
                action={
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('my-tasks')}>
                    View all <ChevronRight className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              {data.myTasks.length === 0 ? (
                <EmptyState className="m-4" icon={CheckSquare} title="Nothing on your plate" description="No open tasks are assigned to you right now." />
              ) : (
                <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                  {data.myTasks.map((t) => {
                    const due = dueLabel(t.dueDate)
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => navigate('my-tasks')}
                          className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <PriorityDot priority={t.priority} />
                              <span className="truncate text-sm font-medium">{t.title}</span>
                            </span>
                            <StatusBadge label={TASK_STATUS_LABELS[t.status] ?? t.status} tone={TASK_STATUS_TONE[t.status] ?? 'outline'} />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{t.projectName ?? 'No project'}</span>
                            <span className={due.overdue ? 'shrink-0 font-medium text-rose-600 dark:text-rose-400' : 'shrink-0'}>{due.text}</span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden py-0">
              <ListCardHeader title="Upcoming deadlines" sub="Tasks, milestones & invoices" />
              {data.upcomingDeadlines.length === 0 ? (
                <EmptyState className="m-4" icon={CalendarCheck} title="No deadlines ahead" description="Nothing is due in the near future." />
              ) : (
                <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                  {data.upcomingDeadlines.map((d, i) => {
                    const meta = DEADLINE_META[d.type] ?? DEADLINE_META.TASK
                    const due = dueLabel(d.dueDate)
                    const tint = due.overdue ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400' : meta.tint
                    return (
                      <li key={`${d.type}-${i}`}>
                        <button
                          type="button"
                          onClick={() => navigate(meta.target)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5"
                        >
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                            <meta.icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-medium ${due.overdue ? 'text-rose-600 dark:text-rose-400' : ''}`}>{d.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {meta.label}{d.context ? ` · ${d.context}` : ''}
                            </span>
                          </span>
                          <span className={`shrink-0 text-xs ${due.overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>{due.text}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden py-0">
              <ListCardHeader title="Recent activity" sub="Latest across the org" />
              {data.recentActivities.length === 0 ? (
                <EmptyState className="m-4" icon={Inbox} title="No activity yet" description="Actions across your workspace will appear here." />
              ) : (
                <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                  {data.recentActivities.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                      <UserAvatar name={a.actorName ?? '?'} size="xs" className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{a.message}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{a.actorName ?? 'System'} · {relativeTime(a.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* top clients */}
          <Card className="overflow-hidden py-0">
            <ListCardHeader
              title="Top clients"
              sub="Revenue from paid & partially-paid invoices"
              action={
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('crm-contacts')}>
                  Contacts <ChevronRight className="size-3.5" aria-hidden />
                </Button>
              }
            />
            {data.clients.length === 0 ? (
              <EmptyState className="m-4" icon={Target} title="No client revenue yet" description="Paid invoices linked to clients will show up here." />
            ) : (
              <ul className="divide-y divide-border">
                {data.clients.map((c) => (
                  <li key={c.name}>
                    <button
                      type="button"
                      onClick={() => navigate('crm-contacts')}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                        <Building2 className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.projectCount} {c.projectCount === 1 ? 'project' : 'projects'}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(c.revenue, currency, true)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
