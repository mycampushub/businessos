'use client'

/**
 * Subscriptions — lifecycle management for the SaaS platform console tab.
 * KPI chips (active / trialing / MRR from the list endpoint), status + plan +
 * debounced org search filters, and the full action set per row: plan change,
 * billing-cycle switch (re-prices + resets the period), seat resize, renew,
 * cancel and reactivate — each confirmed and toasted, plus the assignment
 * dialog (replaces the org's live subscription). Contracts frozen in T6-a.
 */

import { useEffect, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { toast } from '@/hooks/use-toast'
import { fmtDate, type BadgeTone } from '@/lib/format'
import { fmtMoney } from '@/components/views/platform/money'
import { EmptyState } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  CreditCard, CircleCheck, Hourglass, TrendingUp, Search, Plus, ArrowLeftRight, Repeat, Users,
  CalendarClock, Ban, RotateCcw, CircleAlert, Info,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------- local types (T6-a frozen response shapes) ----------

interface PlanItem {
  id: string
  code: string
  name: string
  priceMonthly: number
  priceYearly: number
  isActive: boolean
  seatLimit: number
}

interface OrgItem {
  id: string
  name: string
  slug: string
  plan: string
  status: string
}

interface SubItem {
  id: string
  orgId: string
  orgName: string
  orgSlug: string
  orgStatus: string
  planId: string
  planCode: string
  planName: string
  billingCycle: 'MONTHLY' | 'YEARLY'
  status: string
  seats: number
  amountMonthly: number
  startedAt: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelledAt: string | null
  createdAt: string
}

interface SubsData {
  items: SubItem[]
  kpis: { active: number; trialing: number; mrr: number }
}

type AssignResponse = SubItem & {
  replaced: { id: string; planName: string; status: string } | null
}

// ---------- vocabulary / helpers ----------

const SUB_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const
const LIVE_SUB_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const

const SUB_STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Trialing', ACTIVE: 'Active', PAST_DUE: 'Past due', CANCELLED: 'Cancelled', EXPIRED: 'Expired',
}
const SUB_STATUS_TONE: Record<string, BadgeTone> = {
  TRIALING: 'warning', ACTIVE: 'success', PAST_DUE: 'warning', CANCELLED: 'muted', EXPIRED: 'muted',
}

/** normalized monthly amount for a plan + cycle (yearly price ÷ 12) */
function monthlyFor(plan: { priceMonthly: number; priceYearly: number }, cycle: string): number {
  return cycle === 'YEARLY' ? Math.round((plan.priceYearly / 12) * 100) / 100 : plan.priceMonthly
}

/** advance a date by one billing period (MONTHLY → +1 month, YEARLY → +1 year) */
function addPeriod(from: Date, cycle: string): Date {
  const d = new Date(from)
  if (cycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

/** relative period context for the Period column */
function periodHint(s: SubItem): { text: string; overdue: boolean } {
  if (s.status === 'CANCELLED') {
    return { text: s.cancelledAt ? `cancelled ${fmtDate(s.cancelledAt)}` : 'cancelled', overdue: false }
  }
  if (s.status === 'EXPIRED') return { text: 'expired', overdue: false }
  const days = Math.ceil((new Date(s.currentPeriodEnd).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true }
  if (days === 0) return { text: 'ends today', overdue: false }
  if (days < 62) return { text: `in ${days}d`, overdue: false }
  return { text: `in ~${Math.round(days / 30)} months`, overdue: false }
}

function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function SearchInput({ id, value, onChange, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 pl-9"
        autoComplete="off"
      />
    </div>
  )
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  )
}

const CHIP_TONES: Record<string, string> = {
  teal: 'bg-teal-600/12 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
  emerald: 'bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}

/** compact inline stat chip (lighter than StatCard — tab-scoped KPIs) */
function StatChip({ label, value, sub, icon: Icon, tone }: {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  tone: keyof typeof CHIP_TONES
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 sm:p-4">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${CHIP_TONES[tone]}`}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tracking-tight tabular-nums">{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ---------- tab ----------

type SubDialog =
  | { kind: 'assign' }
  | { kind: 'plan'; sub: SubItem }
  | { kind: 'cycle'; sub: SubItem }
  | { kind: 'seats'; sub: SubItem }
  | { kind: 'renew'; sub: SubItem }
  | { kind: 'cancel'; sub: SubItem }
  | { kind: 'reactivate'; sub: SubItem }

export default function SubscriptionsTab() {
  // filters
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q)
  const [status, setStatus] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const params = new URLSearchParams()
  if (debouncedQ) params.set('q', debouncedQ)
  if (status !== 'all') params.set('status', status)
  if (planFilter !== 'all') params.set('planCode', planFilter)
  const { data, loading, error, refresh } = useData<SubsData>(`/api/platform/subscriptions?${params.toString()}`)

  // catalogs (plan picker + filter options + re-pricing previews)
  const { data: plansData, loading: plansLoading } = useData<{ items: PlanItem[] }>('/api/platform/plans')
  const plans = plansData?.items ?? []

  // org picker — fetched lazily, only once the assign dialog is opened
  const [dlg, setDlg] = useState<SubDialog | null>(null)
  const assignOpen = dlg?.kind === 'assign'
  const { data: orgsData, loading: orgsLoading, error: orgsError, refresh: refreshOrgs } =
    useData<{ items: OrgItem[] }>(assignOpen ? '/api/platform/orgs' : null)
  const orgs = orgsData?.items ?? []

  // assign form
  const [orgId, setOrgId] = useState('')
  const [newPlanCode, setNewPlanCode] = useState('')
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY')
  const [seats, setSeats] = useState('')
  const [seatsAuto, setSeatsAuto] = useState(true)
  const [subStatus, setSubStatus] = useState<'ACTIVE' | 'TRIALING'>('ACTIVE')
  const [trialDays, setTrialDays] = useState('14')

  // row-action forms
  const [planChoice, setPlanChoice] = useState('')
  const [seatsInput, setSeatsInput] = useState('')
  const [busy, setBusy] = useState(false)

  const items = data?.items ?? []
  const kpis = data?.kpis
  const hasFilters = debouncedQ !== '' || status !== 'all' || planFilter !== 'all'

  // dialog-derived previews
  const planDlgSub = dlg?.kind === 'plan' ? dlg.sub : null
  const chosenPlan = planDlgSub ? plans.find((p) => p.code === planChoice) : undefined
  const chosenAmount = chosenPlan && planDlgSub ? monthlyFor(chosenPlan, planDlgSub.billingCycle) : null

  const cycleSub = dlg?.kind === 'cycle' ? dlg.sub : null
  const targetCycle = cycleSub ? (cycleSub.billingCycle === 'MONTHLY' ? 'YEARLY' : 'MONTHLY') : null
  const cyclePlan = cycleSub ? plans.find((p) => p.code === cycleSub.planCode) : undefined
  const cycleNewAmount = cycleSub && cyclePlan && targetCycle ? monthlyFor(cyclePlan, targetCycle) : null

  const renewSub = dlg?.kind === 'renew' ? dlg.sub : null
  const renewNewEnd = renewSub
    ? addPeriod(new Date(renewSub.currentPeriodEnd) > new Date() ? new Date(renewSub.currentPeriodEnd) : new Date(), renewSub.billingCycle)
    : null

  const selectedOrg = assignOpen ? orgs.find((o) => o.id === orgId) : undefined
  const selectedPlan = assignOpen ? plans.find((p) => p.code === newPlanCode) : undefined
  const seatsNum = Number(seats)
  const trialNum = Number(trialDays)
  const assignReady = !!orgId && !!newPlanCode
    && seats !== '' && Number.isFinite(seatsNum) && seatsNum >= 1
    && (subStatus !== 'TRIALING' || (trialDays !== '' && Number.isFinite(trialNum) && trialNum >= 1 && trialNum <= 90))
  const seatsInputNum = Number(seatsInput)
  const seatsReady = seatsInput !== '' && Number.isFinite(seatsInputNum) && seatsInputNum >= 1
  const planChangeReady = !!planDlgSub && !!planChoice && planChoice !== planDlgSub.planCode

  function openAssign() {
    setOrgId('')
    setNewPlanCode('')
    setCycle('MONTHLY')
    setSeats('')
    setSeatsAuto(true)
    setSubStatus('ACTIVE')
    setTrialDays('14')
    setDlg({ kind: 'assign' })
  }

  function openPlanChange(sub: SubItem) {
    setPlanChoice(sub.planCode)
    setDlg({ kind: 'plan', sub })
  }

  function openSeats(sub: SubItem) {
    setSeatsInput(String(sub.seats))
    setDlg({ kind: 'seats', sub })
  }

  function onAssignPlanChange(code: string) {
    setNewPlanCode(code)
    // default the seat count to the plan's seat limit until edited by hand
    if (seatsAuto || seats === '') {
      const p = plans.find((x) => x.code === code)
      if (p) setSeats(String(p.seatLimit))
    }
  }

  /** PATCH one subscription; returns null when api() already toasted the error. */
  async function patchSub(id: string, body: Record<string, unknown>): Promise<SubItem | null> {
    setBusy(true)
    try {
      return await api<SubItem>(`/api/platform/subscriptions/${id}`, { method: 'PATCH', body })
    } catch {
      return null
    } finally {
      setBusy(false)
    }
  }

  async function runAssign() {
    if (!assignReady) return
    setBusy(true)
    try {
      const res = await api<AssignResponse>('/api/platform/subscriptions', {
        method: 'POST',
        body: {
          orgId,
          planCode: newPlanCode,
          billingCycle: cycle,
          seats: Math.round(seatsNum),
          status: subStatus,
          trialDays: subStatus === 'TRIALING' ? Math.round(trialNum) : undefined,
        },
      })
      if (subStatus === 'TRIALING') {
        toast({
          title: 'Trial started',
          description: `${res.orgName} is trialing ${res.planName} until ${fmtDate(res.currentPeriodEnd)} — the owner was notified.`,
        })
      } else {
        toast({
          title: 'Subscription assigned',
          description: `${res.orgName} is now on ${res.planName} (${cycle === 'YEARLY' ? 'yearly' : 'monthly'}, ${res.seats} seats) — the owner was notified.`,
        })
      }
      refresh() // refreshes the KPI row too
      refreshOrgs()
      setDlg(null)
    } catch {
      // api() toasts (422 inactive plan, unknown org, …)
    } finally {
      setBusy(false)
    }
  }

  async function runPlanChange() {
    if (!planDlgSub || !planChangeReady) return
    const updated = await patchSub(planDlgSub.id, { planCode: planChoice })
    if (!updated) return
    toast({
      title: 'Plan changed',
      description: `${updated.orgName} is now on ${updated.planName} at ${fmtMoney(updated.amountMonthly)}/mo — the period restarted today. The owner was notified.`,
    })
    refresh()
    refreshOrgs()
    setDlg(null)
  }

  async function runCycle() {
    if (!cycleSub || !targetCycle) return
    const updated = await patchSub(cycleSub.id, { billingCycle: targetCycle })
    if (!updated) return
    toast({
      title: 'Billing cycle switched',
      description: `${updated.orgName} now bills ${updated.billingCycle === 'YEARLY' ? 'yearly' : 'monthly'} — ${fmtMoney(updated.amountMonthly)}/mo, period restarted today. The owner was notified.`,
    })
    refresh()
    setDlg(null)
  }

  async function runSeats() {
    if (!dlg || dlg.kind !== 'seats' || !seatsReady) return
    const updated = await patchSub(dlg.sub.id, { seats: Math.round(seatsInputNum) })
    if (!updated) return
    toast({
      title: 'Seats updated',
      description: `${updated.orgName} now has ${updated.seats} seat${updated.seats === 1 ? '' : 's'} on ${updated.planName}. The owner was notified.`,
    })
    refresh()
    setDlg(null)
  }

  async function runSubAction(action: 'renew' | 'cancel' | 'reactivate') {
    if (!dlg || dlg.kind !== action) return
    const updated = await patchSub(dlg.sub.id, { action })
    if (!updated) return
    if (action === 'cancel') {
      toast({
        title: 'Subscription cancelled',
        description: `${updated.orgName}'s ${updated.planName} subscription was cancelled — the owner was notified.`,
      })
    } else if (action === 'reactivate') {
      toast({
        title: 'Subscription reactivated',
        description: `${updated.orgName} is back on ${updated.planName} until ${fmtDate(updated.currentPeriodEnd)} — the owner was notified.`,
      })
      refreshOrgs()
    } else {
      toast({
        title: 'Subscription renewed',
        description: `${updated.orgName}'s ${updated.planName} subscription now runs until ${fmtDate(updated.currentPeriodEnd)}.`,
      })
    }
    refresh()
    setDlg(null)
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={CreditCard}
          title="Couldn't load subscriptions"
          description={error}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <section aria-label="Subscription KPIs" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatChip
            label="Active subscriptions"
            value={kpis?.active ?? 0}
            sub="organizations currently billing"
            icon={CircleCheck}
            tone="emerald"
          />
          <StatChip
            label="Trialing"
            value={kpis?.trialing ?? 0}
            sub="active trials running"
            icon={Hourglass}
            tone="amber"
          />
          <StatChip
            label="MRR"
            value={fmtMoney(kpis?.mrr ?? 0)}
            sub="ACTIVE + PAST_DUE, normalized monthly"
            icon={TrendingUp}
            tone="teal"
          />
        </section>
      )}

      {/* filters + assign */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        <SearchInput id="ps-q" value={q} onChange={setQ} placeholder="Search organizations by name or slug…" />
        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor="ps-status" className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="ps-status" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SUB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{SUB_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-44">
          <Label htmlFor="ps-plan" className="text-xs">Plan</Label>
          <Select value={planFilter} onValueChange={setPlanFilter} disabled={plansLoading}>
            <SelectTrigger id="ps-plan" className="h-11">
              <SelectValue placeholder={plansLoading ? 'Loading plans…' : 'All plans'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openAssign} className="min-h-11 sm:ml-auto">
          <Plus className="size-4" aria-hidden /> Assign subscription
        </Button>
      </div>

      {/* catalog */}
      {loading ? (
        <TableSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={hasFilters ? 'No subscriptions match' : 'No subscriptions yet'}
          description={hasFilters
            ? 'Try clearing the search or filters.'
            : 'Assign a plan to an organization to create the first subscription.'}
          action={hasFilters ? (
            <Button variant="outline" onClick={() => { setQ(''); setStatus('all'); setPlanFilter('all') }}>Clear filters</Button>
          ) : (
            <Button onClick={openAssign}><Plus className="size-4" aria-hidden /> Assign subscription</Button>
          )}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Organization</TableHead>
                <TableHead className="min-w-32">Plan</TableHead>
                <TableHead className="min-w-32">Billing</TableHead>
                <TableHead className="min-w-20 text-right">Seats</TableHead>
                <TableHead className="min-w-36">Period</TableHead>
                <TableHead className="min-w-28">Status</TableHead>
                <TableHead className="min-w-56 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const live = (LIVE_SUB_STATUSES as readonly string[]).includes(s.status)
                const orgSuspended = s.orgStatus === 'SUSPENDED'
                const hint = periodHint(s)
                return (
                  <TableRow key={s.id} className={live ? undefined : 'opacity-75'}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs font-semibold">
                          {s.orgName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${orgSuspended ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                            {s.orgName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.orgSlug}{orgSuspended ? ' · organization suspended' : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="max-w-32 truncate font-medium" title={`${s.planName} (${s.planCode})`}>
                        {s.planName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <StatusBadge
                          label={s.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
                          tone={s.billingCycle === 'YEARLY' ? 'info' : 'outline'}
                          dot={false}
                        />
                        <span className="text-sm font-medium tabular-nums">{fmtMoney(s.amountMonthly)}/mo</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{s.seats}</TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(s.currentPeriodEnd)}</p>
                        <p className={`whitespace-nowrap text-xs ${hint.overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                          {hint.text}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={SUB_STATUS_LABEL[s.status] ?? s.status} tone={SUB_STATUS_TONE[s.status] ?? 'outline'} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {live ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9 text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-400 dark:hover:bg-teal-500/15"
                              title="Change plan"
                              onClick={() => openPlanChange(s)}
                              aria-label={`Change plan for ${s.orgName}`}
                            >
                              <ArrowLeftRight className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9 text-sky-600 hover:bg-sky-500/10 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-500/15"
                              title={`Switch to ${s.billingCycle === 'MONTHLY' ? 'yearly' : 'monthly'} billing`}
                              onClick={() => setDlg({ kind: 'cycle', sub: s })}
                              aria-label={`Switch billing cycle for ${s.orgName}`}
                            >
                              <Repeat className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9"
                              title="Edit seats"
                              onClick={() => openSeats(s)}
                              aria-label={`Edit seats for ${s.orgName}`}
                            >
                              <Users className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/15"
                              title="Renew — advance the billing period"
                              onClick={() => setDlg({ kind: 'renew', sub: s })}
                              aria-label={`Renew ${s.orgName}'s subscription`}
                            >
                              <CalendarClock className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/15"
                              title="Cancel subscription"
                              onClick={() => setDlg({ kind: 'cancel', sub: s })}
                              aria-label={`Cancel ${s.orgName}'s subscription`}
                            >
                              <Ban className="size-4" aria-hidden />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-9 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                            onClick={() => setDlg({ kind: 'reactivate', sub: s })}
                            aria-label={`Reactivate ${s.orgName}'s subscription`}
                            title="Reactivate subscription"
                          >
                            <RotateCcw className="size-3.5" aria-hidden /> Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {items.length} subscription{items.length === 1 ? '' : 's'}{hasFilters ? ' matching the current filters' : ' shown'} ·
          yearly amounts are normalized to ৳/mo.
        </p>
      )}

      {/* ---------- assign dialog ---------- */}
      <Dialog open={assignOpen} onOpenChange={(o) => { if (!o && !busy) setDlg(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Assign subscription
            </DialogTitle>
            <DialogDescription>
              Move an organization onto a plan. Assigning replaces any live subscription they currently have.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {orgsError ? (
              <div className="flex flex-col gap-1.5">
                <Label>Organization *</Label>
                <p className="text-xs text-muted-foreground">Couldn&apos;t load organizations — {orgsError}</p>
                <Button variant="outline" size="sm" className="w-fit min-h-9" onClick={refreshOrgs}>Try again</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Organization *</Label>
                <Select value={orgId} onValueChange={setOrgId} disabled={orgsLoading}>
                  <SelectTrigger className="h-11 w-full" aria-label="Organization">
                    <SelectValue placeholder={orgsLoading ? 'Loading organizations…' : 'Choose an organization'} />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} ({o.slug}) — {o.plan}{o.status === 'SUSPENDED' ? ' · suspended' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Plan *</Label>
              <Select value={newPlanCode} onValueChange={onAssignPlanChange} disabled={plansLoading}>
                <SelectTrigger className="h-11 w-full" aria-label="Plan">
                  <SelectValue placeholder={plansLoading ? 'Loading plans…' : 'Choose a plan'} />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name} — {fmtMoney(p.priceMonthly)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Billing cycle *</Label>
                <Select value={cycle} onValueChange={(v) => setCycle(v === 'YEARLY' ? 'YEARLY' : 'MONTHLY')}>
                  <SelectTrigger className="h-11 w-full" aria-label="Billing cycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="YEARLY">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ps-seats">Seats *</Label>
                <Input
                  id="ps-seats"
                  type="number"
                  min={1}
                  step={1}
                  value={seats}
                  onChange={(e) => { setSeatsAuto(false); setSeats(e.target.value) }}
                  placeholder="e.g. 12"
                  aria-invalid={!assignReady && seats !== ''}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status *</Label>
              <Select value={subStatus} onValueChange={(v) => setSubStatus(v === 'TRIALING' ? 'TRIALING' : 'ACTIVE')}>
                <SelectTrigger className="h-11 w-full" aria-label="Subscription status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active — starts billing now</SelectItem>
                  <SelectItem value="TRIALING">Trialing — free evaluation first</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {subStatus === 'TRIALING' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ps-trial-days">Trial length (days) *</Label>
                <Input
                  id="ps-trial-days"
                  type="number"
                  min={1}
                  max={90}
                  step={1}
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">1–90 days; the subscription starts billing when the trial period ends.</p>
              </div>
            )}

            <div aria-live="polite" className="flex flex-col gap-2">
              {selectedPlan && (
                <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    Amount {fmtMoney(monthlyFor(selectedPlan, cycle))}/mo
                    {cycle === 'YEARLY'
                      ? ` — ${fmtMoney(selectedPlan.priceYearly)} billed per year`
                      : ` — ${fmtMoney(selectedPlan.priceYearly)}/yr equivalent`}
                    {seats !== '' && Number.isFinite(seatsNum) && seatsNum >= 1 ? ` · ${Math.round(seatsNum)} seats` : ''}.
                    {subStatus === 'TRIALING' && trialDays !== '' && Number.isFinite(trialNum) ? ` Trial runs ${Math.round(trialNum)} day${Math.round(trialNum) === 1 ? '' : 's'}.` : ''}
                  </span>
                </p>
              )}
              {selectedOrg && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {selectedOrg.name}&apos;s current {selectedOrg.plan} subscription will be cancelled and replaced.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlg(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void runAssign()} disabled={!assignReady || busy}>
              {busy ? 'Assigning…' : 'Assign subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- change plan dialog ---------- */}
      <Dialog open={!!planDlgSub} onOpenChange={(o) => { if (!o && !busy) setDlg(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="size-5 text-teal-600 dark:text-teal-400" aria-hidden />
              Change {planDlgSub?.orgName}&apos;s plan
            </DialogTitle>
            <DialogDescription>
              Currently on {planDlgSub?.planName} at {fmtMoney(planDlgSub?.amountMonthly)}/mo. Changing the plan
              re-prices the subscription and restarts the billing period today.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>New plan *</Label>
              <Select value={planChoice} onValueChange={setPlanChoice} disabled={plansLoading}>
                <SelectTrigger className="h-11 w-full" aria-label="New plan">
                  <SelectValue placeholder={plansLoading ? 'Loading plans…' : 'Choose a plan'} />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.code} value={p.code} disabled={planDlgSub ? p.code === planDlgSub.planCode : false}>
                      {p.name} — {fmtMoney(p.priceMonthly)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {chosenAmount !== null && planDlgSub && (
              <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground" aria-live="polite">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Amount {fmtMoney(planDlgSub.amountMonthly)}/mo → {fmtMoney(chosenAmount)}/mo ({planDlgSub.billingCycle === 'YEARLY' ? 'yearly' : 'monthly'} billing).
                The owner is notified.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlg(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void runPlanChange()} disabled={!planChangeReady || busy}>
              {busy ? 'Changing…' : 'Change plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- edit seats dialog ---------- */}
      <Dialog open={dlg?.kind === 'seats'} onOpenChange={(o) => { if (!o && !busy) setDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Edit seats — {dlg?.kind === 'seats' ? dlg.sub.orgName : ''}
            </DialogTitle>
            <DialogDescription>
              Seats cap how many members the organization can invite. The plan price stays the same.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ps-seat-input">Seats *</Label>
            <Input
              id="ps-seat-input"
              type="number"
              min={1}
              step={1}
              value={seatsInput}
              onChange={(e) => setSeatsInput(e.target.value)}
              aria-invalid={!seatsReady && seatsInput !== ''}
            />
            {dlg?.kind === 'seats' && (
              <p className="text-xs text-muted-foreground">
                Currently {dlg.sub.seats} seat{dlg.sub.seats === 1 ? '' : 's'} on {dlg.sub.planName}.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlg(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void runSeats()} disabled={!seatsReady || busy}>
              {busy ? 'Saving…' : 'Save seats'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- switch billing cycle confirmation ---------- */}
      <AlertDialog open={!!cycleSub} onOpenChange={(o) => { if (!o) setDlg(null) }}>
        <AlertDialogContent>
          {cycleSub && targetCycle && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Switch {cycleSub.orgName} to {targetCycle === 'YEARLY' ? 'yearly' : 'monthly'} billing?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {cycleNewAmount !== null && cyclePlan
                    ? `The amount changes from ${fmtMoney(cycleSub.amountMonthly)}/mo to ${fmtMoney(cycleNewAmount)}/mo${targetCycle === 'YEARLY' ? ` — ${fmtMoney(cyclePlan.priceYearly)} billed per year` : ''}, and the billing period restarts today. `
                    : `The billing period restarts today and the subscription re-prices to the ${targetCycle === 'YEARLY' ? 'yearly' : 'monthly'} plan price. `}
                  The owner is notified.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void runCycle()} disabled={busy}>
                  {busy ? 'Switching…' : 'Switch billing'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- renew confirmation ---------- */}
      <AlertDialog open={!!renewSub} onOpenChange={(o) => { if (!o) setDlg(null) }}>
        <AlertDialogContent>
          {renewSub && renewNewEnd && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Renew {renewSub.orgName}&apos;s subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  The billing period advances from {fmtDate(renewSub.currentPeriodEnd)} to {fmtDate(renewNewEnd.toISOString())}
                  {' '}({renewSub.billingCycle === 'YEARLY' ? 'one year' : 'one month'}) and the status becomes Active.
                  The owner is notified.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void runSubAction('renew')} disabled={busy}>
                  {busy ? 'Renewing…' : 'Renew'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- cancel confirmation ---------- */}
      <AlertDialog open={dlg?.kind === 'cancel'} onOpenChange={(o) => { if (!o) setDlg(null) }}>
        <AlertDialogContent>
          {dlg?.kind === 'cancel' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel {dlg.sub.orgName}&apos;s {dlg.sub.planName} subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  The subscription stops immediately — existing data stays intact and the organization owner is
                  notified. You can reactivate it later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runSubAction('cancel')}
                  disabled={busy}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {busy ? 'Cancelling…' : 'Cancel subscription'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- reactivate confirmation ---------- */}
      <AlertDialog open={dlg?.kind === 'reactivate'} onOpenChange={(o) => { if (!o) setDlg(null) }}>
        <AlertDialogContent>
          {dlg?.kind === 'reactivate' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reactivate {dlg.sub.orgName}&apos;s {dlg.sub.planName} subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  A fresh billing period starts today and the organization&apos;s plan display is restored. The owner
                  is notified.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runSubAction('reactivate')}
                  disabled={busy}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {busy ? 'Reactivating…' : 'Reactivate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
