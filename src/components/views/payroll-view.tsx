'use client'

import { useEffect, useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import {
  money, currencySymbol, fmtDate, relativeTime, ROLE_LABELS, ROLE_TONE, type BadgeTone,
} from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Banknote, CalendarCheck, CalendarX, CheckCircle2, Clock, Eye, Hourglass, MoreHorizontal, Plus,
  RefreshCw, Search, Trash2, Users, Wallet, X, Coins, ReceiptText,
} from 'lucide-react'

// ---------- local types (T3-c exact shapes) ----------

interface RunItem {
  id: string
  period: string // 'YYYY-MM'
  status: string // DRAFT | APPROVED | PAID
  note: string | null
  createdAt: string
  approvedAt: string | null
  paidAt: string | null
  createdByName: string | null
  approvedByName: string | null
  payslipCount: number
  totalGross: number
  totalNet: number
}

interface BreakdownRow {
  label: string
  kind: string // BASE | ALLOWANCE | DEDUCTION
  amount: number
}

interface PayslipItem {
  id: string
  membershipId: string
  userName: string | null
  userAvatar: string | null
  title: string | null
  departmentName: string | null
  role: string | null
  baseSalary: number
  allowances: number
  deductions: number
  unpaidLeaveDays: number
  unpaidLeaveAmount: number
  gross: number
  net: number
  presentDays: number | null
  absentDays: number | null
  lateDays: number | null
  breakdown: BreakdownRow[]
}

interface RunDetail {
  run: RunItem
  payslips: PayslipItem[]
}

interface SalaryComponentItem {
  id: string
  label: string
  kind: string // ALLOWANCE | DEDUCTION
  amount: number
}

interface SalaryItem {
  membershipId: string
  name: string
  avatarUrl: string | null
  title: string | null
  departmentName: string | null
  role: string
  employmentType: string
  baseSalary: number | null
  components: SalaryComponentItem[]
  allowancesTotal: number
  deductionsTotal: number
  monthlyCost: number
}

// ---------- vocab / helpers ----------

const RUN_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', APPROVED: 'Approved', PAID: 'Paid' }
const RUN_STATUS_TONE: Record<string, BadgeTone> = { DRAFT: 'muted', APPROVED: 'warning', PAID: 'success' }

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return period
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ---------- salary editor form ----------

interface ComponentRow {
  label: string
  kind: 'ALLOWANCE' | 'DEDUCTION'
  amount: string
}

interface SalaryForm {
  base: string
  rows: ComponentRow[]
}

function initSalaryForm(s: SalaryItem): SalaryForm {
  return {
    base: s.baseSalary === null ? '' : String(s.baseSalary),
    rows: s.components.map((c) => ({ label: c.label, kind: c.kind as 'ALLOWANCE' | 'DEDUCTION', amount: String(c.amount) })),
  }
}

// =====================================================================

export default function PayrollView() {
  const { org, can } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const canManage = can('finance-payroll')

  const [tab, setTab] = useState<'runs' | 'salaries'>('runs')

  // ---------- runs ----------
  const runsQ = useData<{ items: RunItem[] }>('/api/finance/payroll')
  const runs = useMemo(() => runsQ.data?.items ?? [], [runsQ.data])

  // new-run dialog
  const [formOpen, setFormOpen] = useState(false)
  const [period, setPeriod] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const periodValid = PERIOD_RE.test(period.trim())

  // payslips dialog (lazy detail fetch while open)
  const [viewingRun, setViewingRun] = useState<RunItem | null>(null)
  const detailQ = useData<RunDetail>(viewingRun ? `/api/finance/payroll/${viewingRun.id}` : null)
  const detailRun = detailQ.data?.run ?? viewingRun
  const payslips = detailQ.data?.payslips ?? []

  // payslip breakdown dialog
  const [viewingSlip, setViewingSlip] = useState<PayslipItem | null>(null)

  // run actions
  type RunAction = 'approve' | 'pay' | 'regenerate'
  const [confirming, setConfirming] = useState<{ action: RunAction; run: RunItem } | null>(null)
  const [deleting, setDeleting] = useState<RunItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ---------- salaries ----------
  const salQ = useData<{ items: SalaryItem[] }>(tab === 'salaries' ? '/api/finance/payroll/salaries' : null)
  const salaries = useMemo(() => salQ.data?.items ?? [], [salQ.data])
  const [search, setSearch] = useState('')

  // salary editor dialog
  const [editing, setEditing] = useState<SalaryItem | null>(null)
  const [salaryForm, setSalaryForm] = useState<SalaryForm>({ base: '', rows: [] })
  const [savingSalary, setSavingSalary] = useState(false)

  useEffect(() => {
    if (editing) setSalaryForm(initSalaryForm(editing))
  }, [editing])

  const filteredSalaries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return salaries
    return salaries.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.departmentName ?? '').toLowerCase().includes(q),
    )
  }, [salaries, search])

  // ---------- stats ----------

  const paidRuns = runs.filter((r) => r.status === 'PAID')
  const latestMeaningful = paidRuns[0] ?? runs[0] // runs arrive period-desc
  const pendingRuns = runs.filter((r) => r.status === 'DRAFT' || r.status === 'APPROVED')

  const salLoading = salQ.loading
  const totalMonthlyCost = salaries.reduce((s, x) => s + x.monthlyCost, 0)
  const bases = salaries.filter((s) => s.baseSalary !== null).map((s) => s.baseSalary as number)
  const avgBase = bases.length ? bases.reduce((s, n) => s + n, 0) / bases.length : null

  // ---------- run mutations ----------

  function openNewRun() {
    setPeriod('')
    setNote('')
    setFormOpen(true)
  }

  async function createRun() {
    const p = period.trim()
    if (!PERIOD_RE.test(p)) {
      toast({ title: 'Invalid period', description: 'Use the YYYY-MM format, e.g. 2026-09.', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      await api('/api/finance/payroll', {
        method: 'POST',
        body: { period: p, note: note.trim() || undefined },
      })
      toast({ title: 'Payroll run created', description: `${periodLabel(p)} draft run is ready for review.` })
      setFormOpen(false)
      runsQ.refresh()
    } catch {
      // 409 duplicate / 422 invalid — auto-toasted by api()
    } finally {
      setCreating(false)
    }
  }

  async function runAction() {
    if (!confirming) return
    const { action, run } = confirming
    setConfirming(null)
    setBusyId(run.id)
    try {
      await api(`/api/finance/payroll/${run.id}`, { method: 'PATCH', body: { action } })
      const titles: Record<RunAction, string> = {
        approve: 'Run approved',
        pay: 'Run marked as paid',
        regenerate: 'Payslips regenerated',
      }
      const descs: Record<RunAction, string> = {
        approve: `Payroll for ${run.period} is locked for payment.`,
        pay: `Every employee has been notified of their payslip for ${run.period}.`,
        regenerate: `${periodLabel(run.period)} payslips rebuilt from current salaries and attendance.`,
      }
      toast({ title: titles[action], description: descs[action] })
      runsQ.refresh()
      if (viewingRun?.id === run.id) detailQ.refresh()
    } catch {
      // lifecycle guards (400 "Approve the run before paying" etc.) auto-toast
    } finally {
      setBusyId(null)
    }
  }

  async function deleteRun() {
    if (!deleting) return
    const run = deleting
    setDeleting(null)
    setBusyId(run.id)
    try {
      await api(`/api/finance/payroll/${run.id}`, { method: 'DELETE' })
      toast({ title: 'Run deleted', description: `Draft payroll for ${run.period} was removed.` })
      if (viewingRun?.id === run.id) setViewingRun(null)
      runsQ.refresh()
    } catch {
    } finally {
      setBusyId(null)
    }
  }

  // ---------- salary mutations ----------

  function addRow() {
    setSalaryForm((f) => ({ ...f, rows: [...f.rows, { label: '', kind: 'ALLOWANCE', amount: '' }] }))
  }

  function patchRow(i: number, patch: Partial<ComponentRow>) {
    setSalaryForm((f) => ({ ...f, rows: f.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }))
  }

  async function saveSalary() {
    if (!editing) return

    let baseSalary: number | null
    if (salaryForm.base.trim() === '') {
      baseSalary = null // clears
    } else {
      const n = Number(salaryForm.base)
      if (!Number.isFinite(n) || n < 0) {
        toast({ title: 'Invalid base salary', description: 'Enter a number of at least 0, or leave it empty to clear.', variant: 'destructive' })
        return
      }
      baseSalary = n
    }

    const components: Array<{ label: string; kind: string; amount: number }> = []
    for (const [i, r] of salaryForm.rows.entries()) {
      const label = r.label.trim()
      if (!label) {
        toast({ title: 'Missing component label', description: `Component #${i + 1} needs a label.`, variant: 'destructive' })
        return
      }
      const amount = Number(r.amount)
      if (r.amount.trim() === '' || !Number.isFinite(amount) || amount < 0) {
        toast({ title: 'Invalid component amount', description: `"${label}" needs an amount of at least 0.`, variant: 'destructive' })
        return
      }
      components.push({ label, kind: r.kind, amount })
    }

    setSavingSalary(true)
    try {
      await api(`/api/finance/payroll/salaries/${editing.membershipId}`, {
        method: 'PATCH',
        body: { baseSalary, components },
      })
      toast({
        title: 'Salary updated',
        description: `${editing.name}'s salary structure was saved (${components.length} component${components.length === 1 ? '' : 's'}).`,
      })
      setEditing(null)
      salQ.refresh()
    } catch {
    } finally {
      setSavingSalary(false)
    }
  }

  // =====================================================================

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Banknote}
        title="Payroll"
        description="Monthly payroll runs, payslips and salary structures."
        actions={
          canManage && tab === 'runs' ? (
            <Button className="h-11" onClick={openNewRun}>
              <Plus className="size-4" aria-hidden /> New run
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v === 'salaries' ? 'salaries' : 'runs')}>
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="salaries">Salaries</TabsTrigger>
        </TabsList>

        {/* ================= RUNS ================= */}
        <TabsContent value="runs" className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Payroll runs"
              value={runsQ.loading ? 0 : runs.length}
              sub={runs.length === 1 ? 'One period processed' : 'Across all periods'}
              icon={Banknote}
              loading={runsQ.loading}
            />
            <StatCard
              label="Last run net"
              value={latestMeaningful ? money(latestMeaningful.totalNet, cur, true) : '—'}
              sub={latestMeaningful ? periodLabel(latestMeaningful.period) : 'No runs yet'}
              icon={Wallet}
              tone="success"
              loading={runsQ.loading}
            />
            <StatCard
              label="Pending runs"
              value={runsQ.loading ? 0 : pendingRuns.length}
              sub={pendingRuns.length ? 'Draft or approved, unpaid' : 'Nothing awaiting payment'}
              icon={Hourglass}
              tone="warning"
              loading={runsQ.loading}
            />
          </div>

          {runsQ.loading ? (
            <Card className="py-0">
              <CardContent className="flex flex-col gap-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="ml-auto h-5 w-24" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : runsQ.error ? (
            <EmptyState icon={Banknote} title="Couldn't load payroll runs" description={runsQ.error} />
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No payroll runs yet"
              description={canManage ? 'Create the first run for this month to generate payslips for every active member.' : 'Payroll runs created by your finance team will appear here.'}
              action={
                canManage ? (
                  <Button className="h-11" onClick={openNewRun}>
                    <Plus className="size-4" aria-hidden /> New run
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Card className="py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-40">Period</TableHead>
                      <TableHead className="min-w-28">Status</TableHead>
                      <TableHead className="min-w-24 text-right">Payslips</TableHead>
                      <TableHead className="min-w-32 text-right">Gross</TableHead>
                      <TableHead className="min-w-32 text-right">Net</TableHead>
                      <TableHead className="min-w-40">Created by</TableHead>
                      <TableHead className="min-w-36">Approved by</TableHead>
                      <TableHead className="min-w-28">Paid</TableHead>
                      {canManage && <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow
                        key={r.id}
                        className={`cursor-pointer${busyId === r.id ? ' opacity-50' : ''}`}
                        onClick={() => setViewingRun(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setViewingRun(r)
                          }
                        }}
                        aria-label={`Payroll run ${periodLabel(r.period)}, ${RUN_STATUS_LABELS[r.status] ?? r.status}`}
                      >
                        <TableCell>
                          <p className="font-semibold">{periodLabel(r.period)}</p>
                          <p className="font-mono text-xs text-muted-foreground">{r.period}</p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={RUN_STATUS_LABELS[r.status] ?? r.status} tone={RUN_STATUS_TONE[r.status]} />
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.payslipCount}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{money(r.totalGross, cur)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{money(r.totalNet, cur)}</TableCell>
                        <TableCell>
                          <p className="truncate text-sm">{r.createdByName ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{relativeTime(r.createdAt)}</p>
                        </TableCell>
                        <TableCell>
                          {r.approvedByName ? (
                            <p className="truncate text-sm">{r.approvedByName}</p>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(r.paidAt)}</TableCell>
                        {canManage && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${periodLabel(r.period)} run`}>
                                  <MoreHorizontal className="size-4" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewingRun(r)}>
                                  <Eye className="size-4" aria-hidden /> View payslips
                                </DropdownMenuItem>
                                {r.status === 'DRAFT' && (
                                  <DropdownMenuItem onClick={() => setConfirming({ action: 'approve', run: r })}>
                                    <CheckCircle2 className="size-4" aria-hidden /> Approve
                                  </DropdownMenuItem>
                                )}
                                {r.status === 'APPROVED' && (
                                  <DropdownMenuItem onClick={() => setConfirming({ action: 'pay', run: r })}>
                                    <Banknote className="size-4" aria-hidden /> Mark as paid
                                  </DropdownMenuItem>
                                )}
                                {r.status === 'DRAFT' && (
                                  <DropdownMenuItem onClick={() => setConfirming({ action: 'regenerate', run: r })}>
                                    <RefreshCw className="size-4" aria-hidden /> Regenerate
                                  </DropdownMenuItem>
                                )}
                                {r.status === 'DRAFT' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(r)}>
                                      <Trash2 className="size-4" aria-hidden /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                {runs.length} run{runs.length === 1 ? '' : 's'}
                {runs.length > 1 && ` · ${periodLabel(runs[runs.length - 1].period)} → ${periodLabel(runs[0].period)}`}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ================= SALARIES ================= */}
        <TabsContent value="salaries" className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Employees on payroll"
              value={salLoading ? 0 : salaries.length}
              sub="Active members"
              icon={Users}
              loading={salLoading}
            />
            <StatCard
              label="Total monthly cost"
              value={salLoading ? '—' : money(totalMonthlyCost, cur, true)}
              sub="Base + allowances"
              icon={Wallet}
              tone="info"
              loading={salLoading}
            />
            <StatCard
              label="Avg base salary"
              value={salLoading || avgBase === null ? '—' : money(avgBase, cur, true)}
              sub={bases.length ? `Across ${bases.length} set base salaries` : 'No base salaries set'}
              icon={Coins}
              tone="success"
              loading={salLoading}
            />
          </div>

          {salLoading ? (
            <Card className="py-0">
              <CardContent className="flex flex-col gap-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="size-9 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : salQ.error ? (
            <EmptyState icon={Users} title="Couldn't load salaries" description={salQ.error} />
          ) : salaries.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees on payroll yet"
              description="Active members with their base salary and components will appear here."
            />
          ) : (
            <>
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, title, department…"
                  className="pl-9"
                  aria-label="Search salaries"
                />
              </div>

              <Card className="py-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-48">Employee</TableHead>
                        <TableHead className="min-w-32">Department</TableHead>
                        <TableHead className="min-w-28">Role</TableHead>
                        <TableHead className="min-w-32 text-right">Base salary</TableHead>
                        <TableHead className="min-w-36 text-right">Allowances</TableHead>
                        <TableHead className="min-w-28 text-right">Deductions</TableHead>
                        <TableHead className="min-w-32 text-right">Monthly cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSalaries.map((s) => (
                        <TableRow
                          key={s.membershipId}
                          className="cursor-pointer"
                          onClick={() => setEditing(s)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setEditing(s)
                            }
                          }}
                          aria-label={`Salary for ${s.name}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar name={s.name} avatarUrl={s.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{s.name}</p>
                                {s.title && <p className="truncate text-xs text-muted-foreground">{s.title}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {s.departmentName ? (
                              <span className="truncate text-sm">{s.departmentName}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge label={ROLE_LABELS[s.role] ?? s.role} tone={ROLE_TONE[s.role]} />
                          </TableCell>
                          <TableCell className="text-right">
                            {s.baseSalary === null ? (
                              <span className="text-sm text-muted-foreground">Not set</span>
                            ) : (
                              <span className="text-sm tabular-nums">{money(s.baseSalary, cur)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-sm tabular-nums text-emerald-700 dark:text-emerald-400">{s.allowancesTotal ? money(s.allowancesTotal, cur) : '—'}</span>
                              {s.components.filter((c) => c.kind === 'ALLOWANCE').length > 0 && (
                                <Badge variant="outline" className="font-normal text-emerald-700 dark:text-emerald-400">
                                  {s.components.filter((c) => c.kind === 'ALLOWANCE').length}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm tabular-nums text-rose-600 dark:text-rose-400">
                              {s.deductionsTotal ? money(s.deductionsTotal, cur) : '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{money(s.monthlyCost, cur)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                  {filteredSalaries.length} of {salaries.length} employees · total monthly cost {money(totalMonthlyCost, cur)}
                </div>
              </Card>

              {filteredSalaries.length === 0 && (
                <EmptyState
                  icon={Users}
                  title="No matches"
                  description="Try a different name, title or department."
                  action={<Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>}
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- new run dialog ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New payroll run</DialogTitle>
            <DialogDescription>
              Generates payslips for every active member from their base salary, components, unpaid leave and attendance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="run-period">Period *</Label>
              <Input
                id="run-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="YYYY-MM"
                className="font-mono"
                inputMode="numeric"
                aria-invalid={period.length > 0 && !periodValid}
                aria-describedby="run-period-hint"
              />
              <p id="run-period-hint" className="text-xs text-muted-foreground">
                e.g. {currentPeriod()} — payroll month
              </p>
              {period.length > 0 && !periodValid && (
                <p className="text-xs text-rose-600 dark:text-rose-400">Use the YYYY-MM format.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="run-note">Note</Label>
              <Textarea
                id="run-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Includes annual bonus adjustments"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button className="h-11" onClick={() => void createRun()} disabled={creating || !periodValid}>
              {creating ? 'Creating…' : 'Create run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- payslips dialog ---------- */}
      <Dialog open={!!viewingRun} onOpenChange={(o) => { if (!o) { setViewingRun(null); setViewingSlip(null) } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {viewingRun && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2.5">
                  <span>Payslips — {periodLabel(viewingRun.period)}</span>
                  <StatusBadge label={RUN_STATUS_LABELS[detailRun?.status ?? viewingRun.status] ?? viewingRun.status} tone={RUN_STATUS_TONE[detailRun?.status ?? viewingRun.status]} />
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-mono">{viewingRun.period}</span>
                    <span>{detailRun?.payslipCount ?? viewingRun.payslipCount} payslips</span>
                    <span>Gross <span className="font-semibold tabular-nums text-foreground">{money(detailRun?.totalGross ?? viewingRun.totalGross, cur)}</span></span>
                    <span>Net <span className="font-semibold tabular-nums text-foreground">{money(detailRun?.totalNet ?? viewingRun.totalNet, cur)}</span></span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {detailQ.loading ? (
                <div className="flex flex-col gap-3 p-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="size-8 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : detailQ.error ? (
                <EmptyState icon={ReceiptText} title="Couldn't load payslips" description={detailQ.error} />
              ) : payslips.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="No payslips in this run"
                  description={detailRun?.status === 'DRAFT' && canManage ? 'No active members were on payroll when the run was generated. Use Regenerate after adding members.' : 'Payslips will appear here for active members.'}
                />
              ) : (
                <>
                  {viewingRun.note && (
                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Note:</span> {viewingRun.note}
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-44">Employee</TableHead>
                          <TableHead className="min-w-28 text-right">Base</TableHead>
                          <TableHead className="min-w-28 text-right">Allowances</TableHead>
                          <TableHead className="min-w-28 text-right">Deductions</TableHead>
                          <TableHead className="min-w-28 text-right">Net</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payslips.map((p) => (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer"
                            onClick={() => setViewingSlip(p)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setViewingSlip(p)
                              }
                            }}
                            aria-label={`Payslip for ${p.userName ?? 'unknown'}, net ${money(p.net, cur)}`}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <UserAvatar name={p.userName} avatarUrl={p.userAvatar} size="xs" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{p.userName ?? 'Unknown'}</p>
                                  {p.title && <p className="truncate text-xs text-muted-foreground">{p.title}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{money(p.baseSalary, cur)}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                              {p.allowances ? money(p.allowances, cur) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-rose-600 dark:text-rose-400">
                              {p.deductions || p.unpaidLeaveAmount ? `−${money(p.deductions + p.unpaidLeaveAmount, cur)}` : '—'}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold tabular-nums">{money(p.net, cur)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">Click a row to see the full payslip breakdown.</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <span>Created by <span className="text-foreground">{detailRun?.createdByName ?? '—'}</span> · {relativeTime(detailRun?.createdAt ?? viewingRun.createdAt)}</span>
                    {detailRun?.approvedByName && <span>Approved by <span className="text-foreground">{detailRun.approvedByName}</span></span>}
                    {detailRun?.paidAt && <span>Paid <span className="text-foreground">{fmtDate(detailRun.paidAt)}</span></span>}
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- payslip breakdown dialog ---------- */}
      <Dialog open={!!viewingSlip} onOpenChange={(o) => { if (!o) setViewingSlip(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {viewingSlip && (
            <>
              <DialogHeader>
                <DialogTitle>Payslip{viewingRun ? ` — ${periodLabel(viewingRun.period)}` : ''}</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex items-center gap-2.5 pt-1">
                    <UserAvatar name={viewingSlip.userName} avatarUrl={viewingSlip.userAvatar} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{viewingSlip.userName ?? 'Unknown'}</p>
                      <p className="truncate text-xs">
                        {viewingSlip.title ?? '—'}
                        {viewingSlip.departmentName ? ` · ${viewingSlip.departmentName}` : ''}
                      </p>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {/* attendance stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-3 text-center">
                    <CalendarCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <p className="text-lg font-semibold leading-none tabular-nums">{viewingSlip.presentDays ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">Present days</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-3 text-center">
                    <CalendarX className="size-4 text-rose-600 dark:text-rose-400" aria-hidden />
                    <p className="text-lg font-semibold leading-none tabular-nums">{viewingSlip.absentDays ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">Absent days</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-3 text-center">
                    <Clock className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
                    <p className="text-lg font-semibold leading-none tabular-nums">{viewingSlip.lateDays ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">Late days</p>
                  </div>
                </div>

                {/* components */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Components</p>
                  <div className="flex flex-col overflow-hidden rounded-lg border">
                    {viewingSlip.breakdown.length === 0 && (
                      <p className="px-3 py-2.5 text-sm text-muted-foreground">No breakdown recorded.</p>
                    )}
                    {viewingSlip.breakdown.map((c, i) => (
                      <div
                        key={`${c.label}-${i}`}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i > 0 ? 'border-t' : ''} ${
                          c.kind === 'BASE'
                            ? 'bg-muted/50 font-medium'
                            : c.kind === 'ALLOWANCE'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <span className="truncate">{c.label}</span>
                        <span className="shrink-0 tabular-nums">
                          {c.kind === 'DEDUCTION' ? '−' : c.kind === 'ALLOWANCE' ? '+' : ''}
                          {money(c.amount, cur)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* totals */}
                <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Gross</span>
                    <span className="font-medium tabular-nums">{money(viewingSlip.gross, cur)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Deductions</span>
                    <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                      −{money(viewingSlip.deductions + viewingSlip.unpaidLeaveAmount, cur)}
                    </span>
                  </div>
                  {viewingSlip.unpaidLeaveDays > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {viewingSlip.unpaidLeaveDays} unpaid day{viewingSlip.unpaidLeaveDays === 1 ? '' : 's'} deducted ({money(viewingSlip.unpaidLeaveAmount, cur)})
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-between border-t pt-2">
                    <span className="font-semibold">Net pay</span>
                    <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{money(viewingSlip.net, cur)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- salary editor / read-only dialog ---------- */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Salary structure</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <UserAvatar name={editing.name} avatarUrl={editing.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {editing.name}
                        {canManage ? '' : ' (read-only)'}
                      </p>
                      <p className="truncate text-xs">
                        {editing.title ?? '—'}
                        {editing.departmentName ? ` · ${editing.departmentName}` : ''}
                      </p>
                    </div>
                    <StatusBadge label={ROLE_LABELS[editing.role] ?? editing.role} tone={ROLE_TONE[editing.role]} />
                  </div>
                </DialogDescription>
              </DialogHeader>

              {canManage ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="sal-base">Base salary ({currencySymbol(cur)}, monthly)</Label>
                    <Input
                      id="sal-base"
                      type="number"
                      min="0"
                      value={salaryForm.base}
                      onChange={(e) => setSalaryForm((f) => ({ ...f, base: e.target.value }))}
                      placeholder="Not set"
                    />
                    <p className="text-xs text-muted-foreground">Leave empty to clear the base salary.</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Components</Label>
                    {salaryForm.rows.length === 0 && (
                      <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                        No components yet — add allowances or deductions.
                      </p>
                    )}
                    {salaryForm.rows.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border p-2.5 sm:grid-cols-[1fr_140px_120px_auto]">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`comp-label-${i}`} className="text-xs text-muted-foreground sr-only">Label</Label>
                          <Input
                            id={`comp-label-${i}`}
                            value={r.label}
                            onChange={(e) => patchRow(i, { label: e.target.value })}
                            placeholder="e.g. Transport allowance"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`comp-kind-${i}`} className="sr-only">Kind</Label>
                          <Select value={r.kind} onValueChange={(v) => patchRow(i, { kind: v as 'ALLOWANCE' | 'DEDUCTION' })}>
                            <SelectTrigger id={`comp-kind-${i}`} className="w-full sm:w-[140px]" aria-label="Component kind">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALLOWANCE">Allowance</SelectItem>
                              <SelectItem value="DEDUCTION">Deduction</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`comp-amount-${i}`} className="sr-only">Amount</Label>
                          <Input
                            id={`comp-amount-${i}`}
                            type="number"
                            min="0"
                            value={r.amount}
                            onChange={(e) => patchRow(i, { amount: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground hover:text-destructive"
                          onClick={() => setSalaryForm((f) => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }))}
                          aria-label={`Remove component ${r.label || `#${i + 1}`}`}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addRow}>
                      <Plus className="size-4" aria-hidden /> Add component
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Saving replaces the whole component set.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">Base salary</span>
                    <span className="font-semibold tabular-nums">
                      {editing.baseSalary === null ? 'Not set' : money(editing.baseSalary, cur)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Components</p>
                    {editing.components.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">No components set.</p>
                    ) : (
                      <div className="flex flex-col overflow-hidden rounded-lg border">
                        {editing.components.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm first:border-t-0">
                            <span className="flex items-center gap-2 truncate">
                              <Badge
                                variant="outline"
                                className={`font-normal ${
                                  c.kind === 'ALLOWANCE'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {c.kind === 'ALLOWANCE' ? 'Allowance' : 'Deduction'}
                              </Badge>
                              <span className="truncate">{c.label}</span>
                            </span>
                            <span className={`shrink-0 tabular-nums ${c.kind === 'ALLOWANCE' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {c.kind === 'ALLOWANCE' ? '+' : '−'}{money(c.amount, cur)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Allowances</span>
                      <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">+{money(editing.allowancesTotal, cur)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Deductions</span>
                      <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">−{money(editing.deductionsTotal, cur)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-1.5">
                      <span className="font-semibold">Monthly cost</span>
                      <span className="font-semibold tabular-nums">{money(editing.monthlyCost, cur)}</span>
                    </div>
                  </div>
                </div>
              )}

              {canManage && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSalaryForm(initSalaryForm(editing))}>Reset</Button>
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button className="h-11" onClick={() => void saveSalary()} disabled={savingSalary}>
                    {savingSalary ? 'Saving…' : 'Save salary'}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- approve / pay / regenerate confirmations ---------- */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirming.action === 'approve'
                    ? `Approve payroll for ${confirming.run.period}?`
                    : confirming.action === 'pay'
                      ? `Mark payroll for ${confirming.run.period} as paid?`
                      : `Regenerate payslips for ${confirming.run.period}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirming.action === 'approve'
                    ? 'This locks the draft. Salaries and components can no longer be regenerated into this run without deleting it.'
                    : confirming.action === 'pay'
                      ? 'This records the payout and notifies every employee that their payslip is available. This cannot be undone.'
                      : 'Payslips are rebuilt from current base salaries, components, unpaid leave and attendance. The existing draft payslips will be replaced.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runAction()}
                  className={
                    confirming.action === 'approve'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : confirming.action === 'pay'
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }
                >
                  {confirming.action === 'approve' ? 'Approve' : confirming.action === 'pay' ? 'Mark as paid' : 'Regenerate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- delete run confirmation ---------- */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payroll run?</AlertDialogTitle>
            <AlertDialogDescription>
              Draft payroll for {deleting?.period} ({deleting?.payslipCount ?? 0} payslips) will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteRun()} className="bg-destructive text-white hover:bg-destructive/90">
              Delete run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
