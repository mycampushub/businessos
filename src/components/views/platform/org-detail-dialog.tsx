'use client'

/**
 * Tenant (organization) drill-down dialog — Organizations tab of the SaaS console.
 * Fetches the frozen T6-a tenant-detail contract (GET /api/platform/orgs/[orgId]) and
 * renders the full connected profile: org header (logo/owner/meta), live subscription
 * with an inline plan-change flow (Select of active plans + AlertDialog confirm →
 * POST /api/platform/subscriptions), workspace usage grid, member directory, recent
 * activity + audit, and suspend/activate moderation (PATCH /api/platform/orgs/[id]).
 * Every mutation is confirmed, toasted, refetched and propagated via onChanged() so
 * the parent list can refresh. api() throws + toasts errors automatically.
 */

import { useEffect, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { toast } from '@/hooks/use-toast'
import { fmtDate, relativeTime, ROLE_LABELS, ROLE_TONE, type BadgeTone } from '@/lib/format'
import { fmtMoney } from './money'
import { EmptyState } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Activity, ArrowRightLeft, Briefcase, Building2, CalendarOff, ChartColumn, Clock, CreditCard, FileText,
  FolderKanban, Globe, History, Landmark, ListChecks, MapPin, Network, ReceiptText, ShieldCheck,
  ShieldOff, UserRoundPlus, Users, UsersRound, Video,
} from 'lucide-react'

// ---------- local types (frozen T6-a tenant-detail contract) ----------

interface TenantOrg {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  industry: string | null
  plan: string
  status: string
  currency: string
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  ownerAvatarUrl: string | null
  description: string | null
  orgType: string | null
  website: string | null
  country: string | null
  timezone: string
  foundedYear: number | null
  ownerId: string
  memberCount: number
  projectCount: number
  jobCount: number
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

interface PlanItem {
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

interface TenantUsage {
  members: number
  departments: number
  teams: number
  projects: number
  tasks: number
  documents: number
  storageBytes: number
  meetings: number
  jobs: number
  applications: number
  invoices: number
  leaveRequests: number
}

interface TenantMember {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
  title: string | null
  status: string
  joinedAt: string
}

interface AuditEntry {
  id: string
  action: string
  entity: string | null
  createdAt: string
}

interface ActivityEntry {
  id: string
  action: string
  message: string | null
  createdAt: string
}

interface TenantDetail {
  org: TenantOrg
  subscription: SubItem | null
  plans: PlanItem[]
  usage: TenantUsage
  members: TenantMember[]
  recentAudit: AuditEntry[]
  recentActivity: ActivityEntry[]
}

// ---------- vocab / helpers ----------

const SUB_STATUS_LABELS: Record<string, string> = { TRIALING: 'Trialing', ACTIVE: 'Active', PAST_DUE: 'Past due' }
const SUB_STATUS_TONE: Record<string, BadgeTone> = { TRIALING: 'warning', ACTIVE: 'success', PAST_DUE: 'warning' }

const MEMBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active', ON_LEAVE: 'On leave', PROBATION: 'Probation', RESIGNED: 'Resigned', TERMINATED: 'Terminated',
}
const MEMBER_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success', ON_LEAVE: 'info', PROBATION: 'warning', RESIGNED: 'muted', TERMINATED: 'destructive',
}

/** bytes → 'MB' with 1 decimal (console convention). */
function fmtMB(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/** Short relative hint for the subscription period end ('in 30d' / rose when past). */
function periodHint(endIso: string): { text: string; past: boolean } {
  const ms = new Date(endIso).getTime() - Date.now()
  if (Number.isNaN(ms)) return { text: '—', past: false }
  const days = Math.round(ms / 86_400_000)
  if (days < 0) return { text: `ended ${Math.abs(days)}d ago`, past: true }
  if (days === 0) return { text: 'ends today', past: false }
  return { text: `in ${days}d`, past: false }
}

/** Website chip label — bare hostname when the URL parses. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function UsageTile({ label, value, sub, icon: Icon }: {
  label: string
  value: number
  sub?: string
  icon: typeof Users
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden /> {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value.toLocaleString('en-US')}</p>
      {sub && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ---------- dialog ----------

export default function OrgDetailDialog({ orgId, open, onOpenChange, onChanged }: {
  orgId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged?: () => void
}) {
  // Lazy: only fetch while the dialog is open (applicants-dialog pattern).
  const { data, loading, error, refresh } = useData<TenantDetail>(orgId && open ? `/api/platform/orgs/${orgId}` : null)

  const [planPanelOpen, setPlanPanelOpen] = useState(false)
  const [planCode, setPlanCode] = useState<string | null>(null)
  const [confirmPlan, setConfirmPlan] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const [busy, setBusy] = useState<'plan' | 'status' | null>(null)

  // Collapse the inline form + confirmations whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setPlanPanelOpen(false)
      setPlanCode(null)
      setConfirmPlan(false)
      setConfirmStatus(false)
      setBusy(null)
    }
  }, [open])

  if (!open || !orgId) return null

  const org = data?.org ?? null
  const sub = data?.subscription ?? null
  const suspended = org?.status === 'SUSPENDED'
  const activePlans = data?.plans.filter((p) => p.isActive) ?? []
  const selectedPlan = data?.plans.find((p) => p.code === planCode) ?? null
  const samePlan = !!sub && !!selectedPlan && sub.planCode === selectedPlan.code
  // The billing cycle of the current subscription is preserved on plan changes.
  const cycle: 'MONTHLY' | 'YEARLY' = sub?.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY'

  function togglePlanPanel() {
    if (!planPanelOpen) setPlanCode(sub?.planCode ?? activePlans[0]?.code ?? null)
    setPlanPanelOpen(!planPanelOpen)
  }

  async function movePlan() {
    if (!org || !selectedPlan) return
    setBusy('plan')
    try {
      await api<SubItem & { replaced: { id: string; planName: string; status: string } | null }>(
        '/api/platform/subscriptions',
        { method: 'POST', body: { orgId: org.id, planCode: selectedPlan.code, billingCycle: cycle } },
      )
      toast({
        title: 'Plan changed',
        description: `${org.name} is now on the ${selectedPlan.name} plan. The owner was notified.`,
      })
      setConfirmPlan(false)
      setPlanPanelOpen(false)
      refresh()
      onChanged?.()
    } catch {
      // api() toasts the error
    } finally {
      setBusy(null)
    }
  }

  async function toggleStatus() {
    if (!org) return
    setBusy('status')
    try {
      const action = suspended ? 'activate' : 'suspend'
      await api(`/api/platform/orgs/${org.id}`, { method: 'PATCH', body: { action } })
      if (action === 'suspend') {
        toast({ title: 'Organization suspended', description: `${org.name}'s members lose workspace access; the owner was notified.` })
      } else {
        toast({ title: 'Organization reactivated', description: `${org.name} is live again.` })
      }
      setConfirmStatus(false)
      refresh()
      onChanged?.()
    } catch {
      // api() toasts
    } finally {
      setBusy(null)
    }
  }

  const planVerb = sub ? 'Move to' : 'Assign'
  const moreMembers = org && data ? org.memberCount - data.members.length : 0
  const period = sub ? periodHint(sub.currentPeriodEnd) : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-4xl">
          {/* ---------- 1. header ---------- */}
          <DialogHeader className="gap-3 border-b p-4 pb-4 sm:p-6 sm:pb-5">
            {org ? (
              <>
                <div className="flex items-start gap-3 pr-8">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-sm font-semibold">
                    {org.logoUrl ? (
                      <img src={org.logoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      org.name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-left text-lg font-semibold leading-snug">
                      <span className="truncate">{org.name}</span>
                      <StatusBadge
                        label={suspended ? 'Suspended' : 'Active'}
                        tone={suspended ? 'destructive' : 'success'}
                        className="shrink-0"
                      />
                    </DialogTitle>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[
                        org.slug,
                        org.industry,
                        org.orgType,
                        org.foundedYear != null ? `Founded ${org.foundedYear}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <DialogDescription asChild>
                  <div className="flex flex-col gap-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <UserAvatar name={org.ownerName} avatarUrl={org.ownerAvatarUrl} size="xs" className="shrink-0" />
                      <span className="min-w-0 truncate">
                        Owner: <span className="font-medium">{org.ownerName ?? '—'}</span>
                        {org.ownerEmail && <span> · {org.ownerEmail}</span>}
                      </span>
                    </span>
                    {org.description && (
                      <p className="text-sm leading-relaxed">{org.description}</p>
                    )}
                    <span className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span>Created {fmtDate(org.createdAt)}</span>
                      {org.country && (
                        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                          <MapPin className="size-3" aria-hidden /> {org.country}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                        <Clock className="size-3" aria-hidden /> {org.timezone}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                        <Landmark className="size-3" aria-hidden /> {org.currency}
                      </span>
                      {org.website && (
                        <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                          <Globe className="size-3 shrink-0" aria-hidden /> {hostOf(org.website)}
                        </span>
                      )}
                    </span>
                  </div>
                </DialogDescription>
              </>
            ) : error ? (
              <>
                <DialogTitle>Organization details</DialogTitle>
                <DialogDescription>The full tenant profile could not be loaded.</DialogDescription>
              </>
            ) : (
              <>
                <DialogTitle className="sr-only">Loading organization details</DialogTitle>
                <DialogDescription className="sr-only">The full tenant profile is loading.</DialogDescription>
                <div className="flex items-start gap-3 pr-8">
                  <Skeleton className="size-12 shrink-0 rounded-lg" />
                  <div className="w-full space-y-2">
                    <Skeleton className="h-6 w-44 max-w-full" />
                    <Skeleton className="h-3.5 w-64 max-w-full" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-72 max-w-full" />
                  <Skeleton className="h-4 w-56 max-w-full" />
                </div>
              </>
            )}
          </DialogHeader>

          {/* ---------- body ---------- */}
          {error ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={Building2}
                title="Couldn't load the organization profile"
                description={error}
                action={<Button variant="outline" onClick={refresh}>Try again</Button>}
              />
            </div>
          ) : loading || !data || !org ? (
            <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6">
              <Skeleton className="h-32 rounded-xl" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
              <Skeleton className="h-64 rounded-xl" />
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-48 rounded-xl" />
                <Skeleton className="h-48 rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6">
              {/* ---------- 2. subscription ---------- */}
              <Card className="overflow-hidden py-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Subscription
                  </h3>
                  {activePlans.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={togglePlanPanel}
                      aria-expanded={planPanelOpen}
                      aria-controls={planPanelOpen ? 'od-plan-panel' : undefined}
                      disabled={busy === 'plan'}
                    >
                      <ArrowRightLeft className="size-3.5" aria-hidden />
                      {sub ? 'Change plan' : 'Assign plan'}
                    </Button>
                  )}
                </div>
                {sub ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-3 sm:px-6">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan</dt>
                      <dd className="mt-1">
                        <Badge
                          variant="outline"
                          className="border-emerald-600/25 bg-emerald-600/12 font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400"
                        >
                          {sub.planName}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billing cycle</dt>
                      <dd className="mt-1">
                        <Badge variant="secondary" className="font-medium">
                          {sub.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">
                        {fmtMoney(sub.amountMonthly)}<span className="font-normal text-muted-foreground">/mo</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seats</dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">{sub.seats}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current period</dt>
                      <dd className="mt-1 text-sm tabular-nums">
                        {fmtDate(sub.currentPeriodEnd)}{' '}
                        <span className={period?.past ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}>
                          · {period?.text}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt>
                      <dd className="mt-1">
                        <StatusBadge
                          label={SUB_STATUS_LABELS[sub.status] ?? sub.status}
                          tone={SUB_STATUS_TONE[sub.status] ?? 'outline'}
                        />
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="px-4 py-5 text-sm text-muted-foreground sm:px-6">No active subscription.</p>
                )}

                {/* inline plan-change form (expands in place — no nested dialog) */}
                {planPanelOpen && (
                  <div id="od-plan-panel" className="border-t bg-muted/30 px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="od-plan-select" className="text-xs">New plan</Label>
                        <Select value={planCode ?? ''} onValueChange={setPlanCode}>
                          <SelectTrigger id="od-plan-select" className="h-10 w-full sm:w-80">
                            <SelectValue placeholder="Choose a plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {activePlans.map((p) => (
                              <SelectItem key={p.id} value={p.code}>
                                {p.name} — {fmtMoney(p.priceMonthly)}/mo
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedPlan && (
                        <p className="text-xs text-muted-foreground">
                          {selectedPlan.seatLimit.toLocaleString('en-US')} seat limit · {selectedPlan.projectLimit.toLocaleString('en-US')} project limit · {selectedPlan.storageGb.toLocaleString('en-US')} GB storage
                          {cycle === 'YEARLY' && ` · billed yearly (${fmtMoney(selectedPlan.priceYearly)}/yr)`}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          className="min-h-9"
                          disabled={!selectedPlan || samePlan || busy === 'plan'}
                          onClick={() => setConfirmPlan(true)}
                        >
                          <ArrowRightLeft className="size-3.5" aria-hidden />
                          {selectedPlan ? `${planVerb} ${selectedPlan.name}` : 'Choose a plan'}
                        </Button>
                        <Button variant="ghost" size="sm" className="min-h-9" onClick={() => setPlanPanelOpen(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* ---------- 3. workspace usage ---------- */}
              <section aria-label="Workspace usage" className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ChartColumn className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Workspace usage
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  <UsageTile label="Members" value={data.usage.members} icon={Users} />
                  <UsageTile label="Departments" value={data.usage.departments} icon={Network} />
                  <UsageTile label="Teams" value={data.usage.teams} icon={UsersRound} />
                  <UsageTile label="Projects" value={data.usage.projects} icon={FolderKanban} />
                  <UsageTile label="Tasks" value={data.usage.tasks} icon={ListChecks} />
                  <UsageTile label="Documents" value={data.usage.documents} sub={fmtMB(data.usage.storageBytes)} icon={FileText} />
                  <UsageTile label="Meetings" value={data.usage.meetings} icon={Video} />
                  <UsageTile label="Jobs" value={data.usage.jobs} icon={Briefcase} />
                  <UsageTile label="Applications" value={data.usage.applications} icon={UserRoundPlus} />
                  <UsageTile label="Invoices" value={data.usage.invoices} icon={ReceiptText} />
                  <UsageTile label="Leave requests" value={data.usage.leaveRequests} icon={CalendarOff} />
                </div>
              </section>

              {/* ---------- 4. member directory ---------- */}
              <Card className="overflow-hidden py-0">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
                    Member directory — {org.memberCount}
                  </h3>
                  {moreMembers > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">{data.members.length} shown</span>
                  )}
                </div>
                {data.members.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  <ul role="list" className="max-h-72 divide-y overflow-y-auto overscroll-contain">
                    {data.members.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                        <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size="sm" className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                            <span className="truncate">{m.name}</span>
                            <StatusBadge
                              label={ROLE_LABELS[m.role] ?? m.role}
                              tone={ROLE_TONE[m.role] ?? 'outline'}
                              dot={false}
                              className="px-1.5 py-0 text-[10px]"
                            />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.title ? `${m.title} · ` : ''}{m.email}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {m.status !== 'ACTIVE' && (
                            <StatusBadge
                              label={MEMBER_STATUS_LABELS[m.status] ?? m.status}
                              tone={MEMBER_STATUS_TONE[m.status] ?? 'warning'}
                              dot={false}
                              className="px-1.5 py-0 text-[10px]"
                            />
                          )}
                          <span className="whitespace-nowrap text-xs text-muted-foreground">Joined {fmtDate(m.joinedAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {moreMembers > 0 && (
                  <p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
                    +{moreMembers} more member{moreMembers === 1 ? '' : 's'} not shown
                  </p>
                )}
              </Card>

              {/* ---------- 5. recent activity + audit ---------- */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="overflow-hidden py-0">
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Activity className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Recent activity
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">Latest workspace events</span>
                  </div>
                  {data.recentActivity.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">No entries yet.</p>
                  ) : (
                    <ul role="list" className="max-h-64 divide-y overflow-y-auto overscroll-contain">
                      {data.recentActivity.map((a) => (
                        <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                          <p className="min-w-0 flex-1 text-sm">{a.message ?? a.action}</p>
                          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="overflow-hidden py-0">
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <History className="size-4 text-amber-600 dark:text-amber-400" aria-hidden /> Recent audit
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">Latest mutations</span>
                  </div>
                  {data.recentAudit.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">No entries yet.</p>
                  ) : (
                    <ul role="list" className="max-h-64 divide-y overflow-y-auto overscroll-contain">
                      {data.recentAudit.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{a.action}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{a.entity ?? '—'}</span>
                          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ---------- 6. footer actions ---------- */}
          <DialogFooter className="sticky bottom-0 z-10 gap-2 border-t bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
            {org && (
              suspended ? (
                <Button
                  variant="outline"
                  onClick={() => setConfirmStatus(true)}
                  aria-label={`Reactivate ${org.name}`}
                  className="min-h-9 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                >
                  <ShieldCheck className="size-4" aria-hidden /> Activate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setConfirmStatus(true)}
                  aria-label={`Suspend ${org.name}`}
                  className="min-h-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/15"
                >
                  <ShieldOff className="size-4" aria-hidden /> Suspend
                </Button>
              )
            )}
            <Button variant="outline" className="min-h-9" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* suspend / activate confirmation (OrgsTab copy) */}
      <AlertDialog open={confirmStatus} onOpenChange={(o) => { if (!o) setConfirmStatus(false) }}>
        <AlertDialogContent>
          {org && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {suspended ? `Reactivate ${org.name}?` : `Suspend ${org.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {suspended
                    ? 'Members of this organization regain workspace access immediately.'
                    : 'Members lose workspace access immediately; the owner is notified.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void toggleStatus()}
                  disabled={busy !== null}
                  className={
                    suspended
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-destructive text-white hover:bg-destructive/90'
                  }
                >
                  {suspended ? 'Reactivate' : 'Suspend'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* plan change confirmation */}
      <AlertDialog open={confirmPlan} onOpenChange={(o) => { if (!o) setConfirmPlan(false) }}>
        <AlertDialogContent>
          {org && selectedPlan && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {sub ? `Move ${org.name} to ${selectedPlan.name}?` : `Assign ${selectedPlan.name} to ${org.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The current subscription is cancelled and replaced. The new subscription is billed{' '}
                  {cycle === 'YEARLY' ? `yearly at ${fmtMoney(selectedPlan.priceYearly)}` : `monthly at ${fmtMoney(selectedPlan.priceMonthly)}`}{' '}
                  ({fmtMoney(selectedPlan.priceMonthly)}/mo equivalent), the organization owner is notified and the change is audit-logged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void movePlan()} disabled={busy !== null}>
                  {busy === 'plan' ? 'Moving…' : `${planVerb} ${selectedPlan.name}`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
