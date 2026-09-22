'use client'

/**
 * Billing & Plan — the tenant's SaaS subscription view (module 'billing').
 * Current subscription + status, live usage against plan limits (seats,
 * projects, storage), the purchasable plan catalog (request upgrade → manual
 * bKash/Nagad payment confirmed by a platform admin) and the org's own
 * request history. OWNER/ADMIN only — the API enforces the same gate.
 * Data: GET /api/billing (one call); mutations: POST /api/billing/requests,
 * DELETE /api/billing/requests/[id].
 */

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { money, fmtDate, type BadgeTone } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CreditCard, RefreshCw, Users, FolderKanban, HardDrive, Check, TrendingUp, Inbox, Trash2, Info,
} from 'lucide-react'

// ---------- local types (frozen GET /api/billing shapes) ----------

interface PlanCatalogItem {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  currency: string
  seatLimit: number
  projectLimit: number
  storageGb: number
  features: string[] | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  subscriptionCount: number
}

interface RequestItem {
  id: string
  planId: string
  planCode: string
  planName: string
  billingCycle: string
  seats: number
  amount: number
  note: string | null
  status: string // PENDING | APPROVED | REJECTED
  requestedByName: string | null
  decidedAt: string | null
  createdAt: string
}

interface BillingData {
  subscription: {
    planName: string
    planCode: string
    cycle: string
    status: string
    seats: number
    amountMonthly: number
    currentPeriodEnd: string
  } | null
  usage: { members: number; projects: number; storageBytes: number; documents: number; tasks: number }
  limits: { seats: number; projects: number; storageGb: number }
  plans: PlanCatalogItem[]
  requests: RequestItem[]
}

// ---------- vocab / helpers ----------

const SUB_STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Trialing', ACTIVE: 'Active', PAST_DUE: 'Past due', CANCELLED: 'Cancelled', EXPIRED: 'Expired',
}
const SUB_STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  TRIALING: 'info', ACTIVE: 'success', PAST_DUE: 'warning', CANCELLED: 'default', EXPIRED: 'danger',
}
const SUB_STATUS_BADGE_TONE: Record<string, BadgeTone> = {
  TRIALING: 'info', ACTIVE: 'success', PAST_DUE: 'warning', CANCELLED: 'muted', EXPIRED: 'destructive',
}
const LIVE_SUB_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE']

const REQ_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' }
const REQ_STATUS_TONE: Record<string, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'destructive' }

const CYCLE_LABELS: Record<string, string> = { MONTHLY: 'Monthly', YEARLY: 'Yearly' }

const GB = 1024 ** 3

/** bytes → 'MB' (1 decimal) or 'GB' when ≥ 1 GB */
function fmtBytes(n: number): string {
  if (!n || n <= 0) return '0 MB'
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`
  return `${(n / (1024 ** 2)).toFixed(1)} MB`
}

/** 'in 12d' / '3d overdue' hint for the period end */
function periodHint(endIso: string): string {
  const days = Math.ceil((new Date(endIso).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'ends today'
  if (days < 62) return `in ${days}d`
  return `in ~${Math.round(days / 30)} months`
}

// ---------- usage meter ----------

function UsageMeter({ label, used, limit, valueText, icon: Icon }: {
  label: string
  used: number
  limit: number
  valueText: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 100
  const over = used > limit
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {label}
        </p>
        <p className={`text-sm tabular-nums ${over ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
          {valueText}
        </p>
      </div>
      <Progress
        value={Math.min(pct, 100)}
        aria-label={`${label} usage: ${pct}%`}
        className={over ? 'bg-rose-500/20 [&_[data-slot=progress-indicator]]:bg-rose-500' : undefined}
      />
      <p className={`text-xs ${over ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
        {pct}% of the plan limit{over ? ' — over limit' : ''}
      </p>
    </div>
  )
}

// =====================================================================

export default function BillingView() {
  const { org } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const { data, loading, error, refresh } = useData<BillingData>('/api/billing')

  const [refreshing, setRefreshing] = useState(false)

  // ---- request dialog ----
  const [reqOpen, setReqOpen] = useState(false)
  const [planId, setPlanId] = useState('')
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY')
  const [seats, setSeats] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // after a successful submit the dialog becomes the payment-instructions panel
  const [submitted, setSubmitted] = useState<RequestItem | null>(null)

  // ---- cancel confirmation ----
  const [cancelling, setCancelling] = useState<RequestItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const plans = data?.plans ?? []
  const requests = data?.requests ?? []
  const sub = data?.subscription ?? null
  const usage = data?.usage
  const limits = data?.limits

  const subLive = !!sub && LIVE_SUB_STATUSES.includes(sub.status)
  const currentPlanCode = subLive ? sub!.planCode : null

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId])
  const seatsNum = Number(seats)
  const seatsValid = seats !== '' && Number.isFinite(seatsNum) && seatsNum >= 1
  const requestAmount = selectedPlan ? (cycle === 'YEARLY' ? selectedPlan.priceYearly : selectedPlan.priceMonthly) : 0
  const requestReady = !!selectedPlan && seatsValid

  function openRequest(plan?: PlanCatalogItem) {
    const target = plan ?? plans[0]
    setPlanId(target?.id ?? '')
    setCycle('MONTHLY')
    setSeats(target ? String(target.seatLimit) : '')
    setNote('')
    setSubmitted(null)
    setReqOpen(true)
  }

  async function submitRequest() {
    if (!requestReady || !selectedPlan) return
    setSubmitting(true)
    try {
      const created = await api<RequestItem>('/api/billing/requests', {
        method: 'POST',
        body: {
          planId: selectedPlan.id,
          billingCycle: cycle,
          seats: Math.round(seatsNum),
          note: note.trim() || undefined,
        },
      })
      setSubmitted(created)
      toast({
        title: 'Plan request submitted',
        description: `The ${selectedPlan.name} plan request is pending platform review — complete the payment to activate it.`,
      })
      refresh()
    } catch {
      // 422/404 auto-toasted by api()
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelRequest() {
    if (!cancelling) return
    const target = cancelling
    setCancelling(null)
    setBusyId(target.id)
    try {
      await api(`/api/billing/requests/${target.id}`, { method: 'DELETE' })
      toast({ title: 'Request cancelled', description: `The ${target.planName} plan request was withdrawn.` })
      refresh()
    } catch {
      // 409 decided requests auto-toast
    } finally {
      setBusyId(null)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    refresh()
    // give the fetch a beat before spinning down the icon
    setTimeout(() => setRefreshing(false), 600)
  }

  // =====================================================================

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CreditCard}
        title="Billing & Plan"
        description={`Subscription, usage and plan changes for ${org?.name ?? 'your organization'}.`}
        actions={
          <Button variant="outline" className="h-11" onClick={() => void onRefresh()} disabled={refreshing}>
            <RefreshCw className={`size-4${refreshing ? ' animate-spin' : ''}`} aria-hidden /> Refresh
          </Button>
        }
      />

      {loading ? (
        <BillingSkeleton />
      ) : error ? (
        <EmptyState icon={CreditCard} title="Couldn't load billing" description={error} action={
          <Button variant="outline" className="h-11" onClick={refresh}>Try again</Button>
        } />
      ) : !data ? null : (
        <>
          {/* ---------- subscription stats ---------- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Current plan"
              value={sub ? sub.planName : 'Free'}
              sub={sub ? `${CYCLE_LABELS[sub.cycle] ?? sub.cycle} billing · ${sub.seats} seats` : 'No subscription yet'}
              icon={CreditCard}
              tone="info"
            />
            <StatCard
              label="Status"
              value={sub ? SUB_STATUS_LABELS[sub.status] ?? sub.status : 'No plan'}
              sub={
                sub?.status === 'PAST_DUE' ? 'Renew within the grace period'
                  : sub?.status === 'EXPIRED' ? 'Workspace is read-only — renew to restore'
                    : sub?.status === 'TRIALING' ? 'Free trial in progress'
                      : sub?.status === 'ACTIVE' ? 'Fully active'
                        : 'Request a plan below'
              }
              icon={sub ? undefined : Info}
              tone={sub ? SUB_STATUS_TONE[sub.status] ?? 'default' : 'default'}
            />
            <StatCard
              label={sub?.status === 'TRIALING' ? 'Trial ends' : sub?.status === 'PAST_DUE' ? 'Ended' : 'Renews / ends'}
              value={sub ? fmtDate(sub.currentPeriodEnd) : '—'}
              sub={sub ? periodHint(sub.currentPeriodEnd) : 'No active period'}
              icon={RefreshCw}
              tone={sub && ['PAST_DUE', 'EXPIRED'].includes(sub.status) ? 'danger' : 'default'}
            />
            <StatCard
              label="Monthly amount"
              value={sub ? money(sub.amountMonthly, cur) : '—'}
              sub={sub?.status === 'TRIALING' ? 'Free during the trial'
                : sub ? `Normalized per month · billed ${CYCLE_LABELS[sub.cycle] ?? sub.cycle?.toLowerCase()}`
                  : 'Set when a plan is assigned'}
              icon={TrendingUp}
              tone="success"
            />
          </div>

          {/* ---------- usage meters ---------- */}
          {usage && limits && (
            <Card className="py-0">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Usage this billing period</CardTitle>
                <CardDescription>
                  Live counts against your plan limits ({limits.seats} seats · {limits.projects} projects · {limits.storageGb} GB storage).
                  {usage.documents > 0 && ` ${usage.documents} document${usage.documents === 1 ? '' : 's'} · ${usage.tasks} task${usage.tasks === 1 ? '' : 's'} in total.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 pb-6 md:grid-cols-3">
                <UsageMeter
                  label="Seats"
                  icon={Users}
                  used={usage.members}
                  limit={limits.seats}
                  valueText={`${usage.members} / ${limits.seats}`}
                />
                <UsageMeter
                  label="Projects"
                  icon={FolderKanban}
                  used={usage.projects}
                  limit={limits.projects}
                  valueText={`${usage.projects} / ${limits.projects}`}
                />
                <UsageMeter
                  label="Storage"
                  icon={HardDrive}
                  used={usage.storageBytes}
                  limit={limits.storageGb * GB}
                  valueText={`${fmtBytes(usage.storageBytes)} / ${limits.storageGb} GB`}
                />
              </CardContent>
            </Card>
          )}

          {/* ---------- plan catalog ---------- */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Available plans</h2>
              <p className="text-xs text-muted-foreground">
                Requests are reviewed by the platform team after payment — usually within a few hours.
              </p>
            </div>
            {plans.length === 0 ? (
              <EmptyState icon={CreditCard} title="No plans available" description="The platform has not published any purchasable plans yet." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((p) => {
                  const isCurrent = currentPlanCode === p.code
                  const free = p.priceMonthly <= 0 && p.priceYearly <= 0
                  return (
                    <Card key={p.id} className={`flex flex-col py-0${isCurrent ? ' border-primary/40 ring-1 ring-primary/25' : ''}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                              {p.name}
                              {isCurrent && <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Current</Badge>}
                            </CardTitle>
                            {p.description && <CardDescription className="mt-1 line-clamp-2">{p.description}</CardDescription>}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">
                            {free ? 'Free' : money(p.priceMonthly, cur)}
                          </span>
                          {!free && <span className="text-xs text-muted-foreground">/ month · {money(p.priceYearly, cur)}/year</span>}
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col gap-4">
                        <ul className="flex flex-col gap-1.5 text-sm">
                          {(p.features ?? []).map((f, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                              <span className="text-muted-foreground">{f}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-auto flex flex-col gap-3">
                          <p className="text-xs text-muted-foreground">
                            {p.seatLimit} seats · {p.projectLimit} projects · {p.storageGb} GB storage
                          </p>
                          <Button
                            variant={isCurrent ? 'outline' : 'default'}
                            className="h-11 w-full"
                            disabled={isCurrent}
                            aria-label={`Request the ${p.name} plan`}
                            onClick={() => openRequest(p)}
                          >
                            {isCurrent ? 'Your current plan' : <><TrendingUp className="size-4" aria-hidden /> Request upgrade</>}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* ---------- my requests ---------- */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">My plan requests</h2>
              <Button variant="outline" className="h-11" onClick={() => openRequest()} disabled={plans.length === 0}>
                <TrendingUp className="size-4" aria-hidden /> New request
              </Button>
            </div>
            {requests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No plan requests yet"
                description="Pick a plan from the catalog above — after payment the platform team activates it."
              />
            ) : (
              <Card className="py-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-32">Plan</TableHead>
                        <TableHead className="min-w-24">Cycle</TableHead>
                        <TableHead className="min-w-16 text-right">Seats</TableHead>
                        <TableHead className="min-w-28 text-right">Amount</TableHead>
                        <TableHead className="min-w-24">Status</TableHead>
                        <TableHead className="min-w-28">Requested</TableHead>
                        <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={r.id} className={busyId === r.id ? 'opacity-50' : undefined}>
                          <TableCell>
                            <p className="font-medium">{r.planName}</p>
                            {r.note && <p className="max-w-64 truncate text-xs text-muted-foreground" title={r.note}>{r.note}</p>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{CYCLE_LABELS[r.billingCycle] ?? r.billingCycle}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.seats}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{money(r.amount, cur)}</TableCell>
                          <TableCell>
                            <StatusBadge label={REQ_STATUS_LABELS[r.status] ?? r.status} tone={REQ_STATUS_TONE[r.status]} />
                            {r.status === 'REJECTED' && r.decidedAt && (
                              <p className="mt-0.5 text-xs text-muted-foreground">decided {fmtDate(r.decidedAt)}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{fmtDate(r.createdAt)}</p>
                            {r.requestedByName && <p className="text-xs text-muted-foreground">by {r.requestedByName}</p>}
                          </TableCell>
                          <TableCell>
                            {r.status === 'PENDING' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                                aria-label={`Cancel the ${r.planName} plan request`}
                                onClick={() => setCancelling(r)}
                              >
                                <Trash2 className="size-4" aria-hidden /> Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      {/* ---------- request dialog (form → payment instructions) ---------- */}
      <Dialog open={reqOpen} onOpenChange={(o) => { if (!o) setReqOpen(false) }}>
        <DialogContent className="sm:max-w-lg">
          {submitted ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2.5">
                  <span>Request submitted</span>
                  <StatusBadge label="Pending" tone="warning" />
                </DialogTitle>
                <DialogDescription>
                  The {submitted.planName} plan ({CYCLE_LABELS[submitted.billingCycle]?.toLowerCase() ?? submitted.billingCycle.toLowerCase()},{' '}
                  {submitted.seats} seats) is awaiting payment confirmation.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/50 p-4 text-sm">
                <p className="font-medium">Payment instructions</p>
                <p>
                  Send <span className="font-semibold tabular-nums">{money(submitted.amount, cur)}</span> via bKash/Nagad to{' '}
                  <span className="font-mono font-medium">01700-000000</span> with reference{' '}
                  <span className="font-mono font-medium">REQ-{submitted.id.slice(0, 8).toUpperCase()}</span> — the platform
                  admin confirms activation.
                </p>
                <p className="text-xs text-muted-foreground">
                  Include the reference in the transfer note so your payment can be matched to this request.
                </p>
              </div>
              <DialogFooter>
                <Button className="h-11" onClick={() => setReqOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Request a plan change</DialogTitle>
                <DialogDescription>
                  Pick the plan, billing cycle and seats. After submitting you&apos;ll get the payment reference — a
                  platform admin activates the plan once the transfer is confirmed.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="billing-plan">Plan</Label>
                  <Select value={planId} onValueChange={(v) => {
                    setPlanId(v)
                    const p = plans.find((x) => x.id === v)
                    if (p) setSeats(String(p.seatLimit))
                  }}>
                    <SelectTrigger id="billing-plan" className="h-11"><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {p.priceMonthly <= 0 && p.priceYearly <= 0 ? 'Free' : `${money(p.priceMonthly, cur)}/mo`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="billing-cycle">Billing cycle</Label>
                    <Select value={cycle} onValueChange={(v) => setCycle(v === 'YEARLY' ? 'YEARLY' : 'MONTHLY')}>
                      <SelectTrigger id="billing-cycle" className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="YEARLY">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="billing-seats">Seats</Label>
                    <Input
                      id="billing-seats"
                      value={seats}
                      onChange={(e) => setSeats(e.target.value)}
                      inputMode="numeric"
                      placeholder="e.g. 15"
                      aria-invalid={!seatsValid}
                    />
                    {seats !== '' && !seatsValid && (
                      <p className="text-xs text-rose-600 dark:text-rose-400">Enter a number of at least 1.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="billing-note">Note</Label>
                  <Textarea
                    id="billing-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. bKash transaction id or anything the platform team should know"
                  />
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Amount due for the period</span>
                  <span className="font-semibold tabular-nums">{money(requestAmount, cur)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReqOpen(false)}>Cancel</Button>
                <Button className="h-11" onClick={() => void submitRequest()} disabled={submitting || !requestReady}>
                  {submitting ? 'Submitting…' : 'Submit request'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- cancel request confirmation ---------- */}
      <AlertDialog open={!!cancelling} onOpenChange={(o) => { if (!o) setCancelling(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this plan request?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling && `The pending ${cancelling.planName} plan request (${CYCLE_LABELS[cancelling.billingCycle]?.toLowerCase() ?? cancelling.billingCycle.toLowerCase()}, ${cancelling.seats} seats, ${money(cancelling.amount, cur)}) will be withdrawn. You can submit a new one any time.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep request</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => void cancelRequest()}
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- skeletons ----------

function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="py-0">
            <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="flex w-full flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="size-10 rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <CardContent className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="py-0">
            <CardContent className="flex flex-col gap-3 p-6">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-11 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
