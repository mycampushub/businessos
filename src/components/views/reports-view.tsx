'use client'

import { useState } from 'react'
import { useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { rowClick } from '@/components/app/row-click'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { money, TASK_STATUS_LABELS, PRIORITY_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_TONE, EXPENSE_CATEGORY_LABELS, DEPARTMENT_COLORS } from '@/lib/format'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Download, CircleDollarSign, Banknote, Receipt, FolderKanban, Pause, CheckCircle2, Gauge,
  Inbox, Users, CalendarCheck,
} from 'lucide-react'

// ---------- local types (GET /api/finance/summary · /api/dashboard · /api/projects · /api/departments) ----------

interface Bucket { count: number; value: number }

interface FinanceSummary {
  income: { paid: Bucket; outstanding: Bucket; overdue: Bucket }
  expenses: { paid: Bucket; pending: Bucket }
  monthly: Array<{ month: string; income: number; expenses: number }>
  byCategory: Array<{ category: string; amount: number }>
  topClients: Array<{ clientName: string; revenue: number }>
}

interface DashPartial {
  taskStatus: Array<{ status: string; label: string; count: number }>
  attendanceTrend: Array<{ date: string; present: number; late: number; leave: number; absent: number }>
}

interface ProjectItem {
  id: string
  name: string
  code: string | null
  status: string
  priority: string
  progress: number
  budget: number | null
  managerName: string | null
  client: { id: string; name: string } | null
  taskStats: { total: number; done: number }
}

interface DepartmentItem {
  id: string
  name: string
  color: string | null
  memberCount: number
}

// ---------- palette & helpers ----------

const CHART = {
  1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)',
} as const

/** donut cell color — cycles the 5 chart vars by index (any column count works) */
const donutColor = (i: number) => CHART[((i % 5) + 1) as keyof typeof CHART]

const shortMonth = (ym: string) => {
  const d = new Date(`${ym}-01`)
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3)
}

const attendanceDay = (d: string) => {
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ---------- CSV export (client-side, current tab) ----------

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const text = rows.map((r) => r.map(csvCell).join(',')).join('\n')
  const blob = new Blob([`\ufeff${text}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- chart tooltips ----------

interface TipDatum {
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

function MoneyBarTip({ active, payload, label, currency }: {
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
              {p.name === 'income' ? 'Income' : 'Expenses'}
            </span>
            <span className="font-medium tabular-nums">{money(Number(p.value ?? 0), currency, true)}</span>
          </div>
        ))}
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
      <p className="mb-1.5 font-medium">{typeof label === 'string' ? attendanceDay(label) : ''}</p>
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

function CategoryTip({ active, payload, currency }: { active?: boolean; payload?: TipDatum[]; currency?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { category?: string; label?: string; amount?: number } | undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{d.label ?? d.category}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Expenses</span>
        <span className="font-medium tabular-nums">{money(d.amount ?? 0, currency)}</span>
      </div>
    </div>
  )
}

function DeptTip({ active, payload }: { active?: boolean; payload?: TipDatum[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { name?: string; memberCount?: number } | undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{d.name}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Members</span>
        <span className="font-medium tabular-nums">{d.memberCount ?? 0}</span>
      </div>
    </div>
  )
}

// ---------- shared layout bits ----------

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
          {action && <div className="shrink-0 text-right">{action}</div>}
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

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}

// ---------- view ----------

type TabId = 'business' | 'projects' | 'people'

export default function ReportsView() {
  const { org, navigate } = useWorkspace()
  const currency = org?.currency ?? 'BDT'
  const [tab, setTab] = useState<TabId>('business')

  const { data: summary, loading: loadingSummary } = useData<FinanceSummary>('/api/finance/summary')
  const { data: dash, loading: loadingDash } = useData<DashPartial>('/api/dashboard')
  const { data: projectsData, loading: loadingProjects } = useData<{ items: ProjectItem[] }>('/api/projects')
  const { data: depsData, loading: loadingDeps } = useData<{ items: DepartmentItem[] }>('/api/departments')

  const projects = projectsData?.items ?? []
  const deps = depsData?.items ?? []

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10)
    let rows: (string | number)[][] = []
    if (tab === 'business' && summary) {
      rows = [
        [`OrgOS Business Report — ${org?.name ?? 'Workspace'} — ${stamp}`],
        [],
        ['Metric', 'Count', 'Value'],
        ['Paid income', summary.income.paid.count, summary.income.paid.value],
        ['Outstanding income', summary.income.outstanding.count, summary.income.outstanding.value],
        ['Overdue income', summary.income.overdue.count, summary.income.overdue.value],
        ['Expenses paid', summary.expenses.paid.count, summary.expenses.paid.value],
        ['Expenses pending', summary.expenses.pending.count, summary.expenses.pending.value],
        [],
        ['Month', 'Income', 'Expenses'],
        ...summary.monthly.map((m) => [m.month, m.income, m.expenses]),
        [],
        ['Expense category', 'Amount'],
        ...summary.byCategory.map((c) => [EXPENSE_CATEGORY_LABELS[c.category] ?? c.category, c.amount]),
        [],
        ['Client', 'Revenue'],
        ...summary.topClients.map((c) => [c.clientName, c.revenue]),
      ]
    } else if (tab === 'projects' && projects.length > 0) {
      rows = [
        [`OrgOS Projects Report — ${org?.name ?? 'Workspace'} — ${stamp}`],
        [],
        ['Project', 'Code', 'Status', 'Priority', 'Progress %', 'Tasks done', 'Tasks total', 'Budget', 'Manager', 'Client'],
        ...projects.map((p) => [
          p.name, p.code ?? '', PROJECT_STATUS_LABELS[p.status] ?? p.status, PRIORITY_LABELS[p.priority] ?? p.priority,
          p.progress, p.taskStats.done, p.taskStats.total, p.budget ?? 0, p.managerName ?? '', p.client?.name ?? '',
        ]),
      ]
    } else if (tab === 'people' && dash) {
      rows = [
        [`OrgOS People Report — ${org?.name ?? 'Workspace'} — ${stamp}`],
        [],
        ['Task status', 'Count'],
        ...dash.taskStatus.map((t) => [t.label ?? TASK_STATUS_LABELS[t.status] ?? t.status, t.count]),
        [],
        ['Date', 'Present', 'Late', 'Absent', 'On leave'],
        ...dash.attendanceTrend.map((a) => [a.date, a.present, a.late, a.absent, a.leave]),
      ]
      if (deps.length > 0) {
        rows.push([], ['Department', 'Members'], ...deps.map((d) => [d.name, d.memberCount]))
      }
    }
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'There is no data in this report yet.' })
      return
    }
    downloadCsv(`orgos-${tab}-report-${stamp}.csv`, rows)
    toast({ title: 'Report exported', description: `orgos-${tab}-report-${stamp}.csv has been downloaded.` })
  }

  // people-tab derived numbers
  const att = dash?.attendanceTrend ?? []
  const attTotals = att.reduce(
    (acc, d) => ({ present: acc.present + d.present, late: acc.late + d.late, absent: acc.absent + d.absent, leave: acc.leave + d.leave }),
    { present: 0, late: 0, absent: 0, leave: 0 },
  )
  const attDays = attTotals.present + attTotals.late + attTotals.absent + attTotals.leave
  const presentRate = attDays > 0 ? Math.round((attTotals.present / attDays) * 100) : 0
  const taskTotal = dash?.taskStatus.reduce((s, t) => s + t.count, 0) ?? 0
  const taskDone = dash?.taskStatus.find((t) => t.status === 'DONE')?.count ?? 0
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length
  const holdCount = projects.filter((p) => p.status === 'ON_HOLD').length
  const doneCount = projects.filter((p) => p.status === 'COMPLETED').length
  const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description={`${org?.name ?? 'Your workspace'} · cross-module analytics`}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="business" className="flex-1 sm:flex-none">Business</TabsTrigger>
          <TabsTrigger value="projects" className="flex-1 sm:flex-none">Projects</TabsTrigger>
          <TabsTrigger value="people" className="flex-1 sm:flex-none">People</TabsTrigger>
        </TabsList>

        {/* ---------------- Business ---------------- */}
        <TabsContent value="business" className="mt-4 flex flex-col gap-4">
          {loadingSummary || !summary ? (
            loadingSummary ? <TabSkeleton /> : (
              <EmptyState icon={Inbox} title="Couldn't load finance data" description="Try refreshing the page." />
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Income, expenses & client performance</p>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="size-3.5" aria-hidden /> Export CSV
                </Button>
              </div>
              <section aria-label="Income overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <StatCard label="Paid Income" value={money(summary.income.paid.value, currency, true)} sub={`${summary.income.paid.count} invoices`} tone="success" icon={CircleDollarSign} onClick={() => navigate('finance-invoices')} />
                <StatCard label="Outstanding" value={money(summary.income.outstanding.value, currency, true)} sub={`${summary.income.outstanding.count} invoices`} tone="warning" icon={Banknote} onClick={() => navigate('finance-invoices')} />
                <StatCard label="Overdue" value={money(summary.income.overdue.value, currency, true)} sub={`${summary.income.overdue.count} invoices`} tone="danger" icon={Receipt} onClick={() => navigate('finance-invoices')} />
              </section>

              <section aria-label="Monthly performance" className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Income vs expenses"
                  sub="Last 6 months"
                  action={
                    <div className="flex gap-3">
                      <LegendChip color={CHART[1]} label="Income" />
                      <LegendChip color={CHART[3]} label="Expenses" />
                    </div>
                  }
                >
                  <div className="h-64" role="img" aria-label="Bar chart of income versus expenses by month">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.monthly.map((m) => ({ ...m, label: shortMonth(m.month) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: number) => money(v, currency, true)} />
                        <Tooltip content={<MoneyBarTip currency={currency} />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                        <Bar dataKey="income" fill={CHART[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="expenses" fill={CHART[3]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard
                  title="Expenses by category"
                  sub={`Paid ${money(summary.expenses.paid.value, currency, true)} · Pending ${money(summary.expenses.pending.value, currency, true)}`}
                >
                  {summary.byCategory.length === 0 ? (
                    <EmptyState icon={Receipt} title="No expenses yet" description="Approved expense categories will appear here." />
                  ) : (
                    <div className="h-64" role="img" aria-label="Horizontal bar chart of expenses by category">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={summary.byCategory.map((c) => ({ ...c, label: EXPENSE_CATEGORY_LABELS[c.category] ?? c.category }))}
                          layout="vertical"
                          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                          barSize={14}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: number) => money(v, currency, true)} />
                          <YAxis type="category" dataKey="label" width={92} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                          <Tooltip content={<CategoryTip currency={currency} />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
                          <Bar dataKey="amount" fill={CHART[2]} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              </section>

              <Card className="overflow-hidden py-0">
                <div className="border-b px-4 py-3 sm:px-6">
                  <h3 className="text-sm font-semibold">Top clients</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Revenue from issued invoices</p>
                </div>
                {summary.topClients.length === 0 ? (
                  <EmptyState className="m-4" icon={Inbox} title="No client revenue yet" description="Issued invoices linked to clients will show up here." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="w-40">Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.topClients.map((c) => {
                          const total = summary.topClients.reduce((s, x) => s + x.revenue, 0) || 1
                          const pct = Math.round((c.revenue / total) * 100)
                          return (
                            <TableRow
                              key={c.clientName}
                              className="cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                              aria-label={`Open client ${c.clientName}`}
                              {...rowClick(() => navigate('crm-contacts'))}
                            >
                              <TableCell className="font-medium">{c.clientName}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">{money(c.revenue, currency, true)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:w-28" role="presentation">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART[4] }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </>
          )}
        </TabsContent>

        {/* ---------------- Projects ---------------- */}
        <TabsContent value="projects" className="mt-4 flex flex-col gap-4">
          {loadingProjects || !projectsData ? (
            loadingProjects ? <TabSkeleton /> : (
              <EmptyState icon={Inbox} title="Couldn't load projects" description="Try refreshing the page." />
            )
          ) : projects.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects yet" description="Create your first project to see analytics here." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Portfolio status, progress & budget</p>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="size-3.5" aria-hidden /> Export CSV
                </Button>
              </div>
              <section aria-label="Project portfolio summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard label="Active" value={activeCount} sub="In delivery" tone="info" icon={FolderKanban} />
                <StatCard label="On Hold" value={holdCount} sub="Paused" tone="warning" icon={Pause} />
                <StatCard label="Completed" value={doneCount} sub="Delivered" tone="success" icon={CheckCircle2} />
                <StatCard label="Avg Progress" value={`${avgProgress}%`} sub="Across all projects" icon={Gauge} />
              </section>

              <Card className="overflow-hidden py-0">
                <div className="border-b px-4 py-3 sm:px-6">
                  <h3 className="text-sm font-semibold">All projects</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{projects.length} projects · delivery status, progress and budget</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[180px]">Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="min-w-[140px]">Progress</TableHead>
                        <TableHead className="text-right">Tasks</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((p) => (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                          aria-label={`Open project ${p.name}`}
                          {...rowClick(() => navigate('projects', { projectId: p.id }))}
                        >
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium leading-tight">{p.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {p.code ?? '—'}{p.client ? ` · ${p.client.name}` : ''}{p.managerName ? ` · ${p.managerName}` : ''}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge label={PROJECT_STATUS_LABELS[p.status] ?? p.status} tone={PROJECT_STATUS_TONE[p.status] ?? 'outline'} />
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-sm">
                              <PriorityDot priority={p.priority} />
                              {PRIORITY_LABELS[p.priority] ?? p.priority}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={p.progress} className="h-2 w-16 sm:w-24" aria-label={`${p.progress}% complete`} />
                              <span className="text-xs text-muted-foreground tabular-nums">{p.progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {p.taskStats.done}<span className="text-muted-foreground"> / {p.taskStats.total}</span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{money(p.budget, currency, true)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ---------------- People ---------------- */}
        <TabsContent value="people" className="mt-4 flex flex-col gap-4">
          {loadingDash || !dash ? (
            loadingDash ? <TabSkeleton /> : (
              <EmptyState icon={Inbox} title="Couldn't load people data" description="Try refreshing the page." />
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Attendance, tasks & organization</p>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="size-3.5" aria-hidden /> Export CSV
                </Button>
              </div>
              <section aria-label="Workforce summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard label="Attendance Rate" value={`${presentRate}%`} sub="Present, last 10 days" tone="success" icon={Users} />
                <StatCard label="Late Arrivals" value={attTotals.late} sub="Last 10 working days" tone={attTotals.late > 0 ? 'warning' : 'default'} icon={Pause} />
                <StatCard label="Task Completion" value={taskTotal ? `${Math.round((taskDone / taskTotal) * 100)}%` : '—'} sub={`${taskDone} of ${taskTotal} tasks done`} icon={Gauge} />
                <StatCard label="Departments" value={deps.length} sub="In this organization" icon={FolderKanban} />
              </section>

              <section aria-label="People analytics" className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Task status" sub="Across the organization" action={<p className="text-xs text-muted-foreground">{taskTotal} total</p>}>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <div className="relative h-52 w-full max-w-[240px]" role="img" aria-label="Donut chart of task counts by status">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={dash.taskStatus} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="86%" paddingAngle={2} stroke="var(--background)" strokeWidth={2}>
                            {dash.taskStatus.map((t, i) => (
                              <Cell key={t.status} fill={donutColor(i)} />
                            ))}
                          </Pie>
                          <Tooltip content={<DonutTip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-semibold tabular-nums">{taskTotal}</span>
                        <span className="text-xs text-muted-foreground">tasks</span>
                      </div>
                    </div>
                    <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:mt-2 sm:w-auto">
                      {dash.taskStatus.map((t, i) => (
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

                <ChartCard title="Department distribution" sub="Members per department">
                  {loadingDeps ? (
                    <Skeleton className="h-64 w-full" />
                  ) : deps.length === 0 ? (
                    <EmptyState icon={FolderKanban} title="No departments" description="Departments created in your org will appear here." />
                  ) : (
                    <div className="h-64" role="img" aria-label="Horizontal bar chart of members per department">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={deps} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={14}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                          <YAxis type="category" dataKey="name" width={108} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
                          <Tooltip content={<DeptTip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
                          <Bar dataKey="memberCount" radius={[0, 4, 4, 0]}>
                            {deps.map((d, i) => (
                              <Cell key={d.id} fill={d.color ?? DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              </section>

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
                {att.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="No attendance yet" description="Check-ins will show up here." />
                ) : (
                  <div className="flex flex-col">
                    <div className="h-60" role="img" aria-label="Stacked bar chart of daily attendance over the last ten working days">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={att} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
