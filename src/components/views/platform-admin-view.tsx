'use client'

/**
 * Platform administration — the SaaS owner console (org-less, module 'platform-admin').
 * Tabs: Overview (KPIs, plans, signup trend, recent lists) | Users (suspend/activate,
 * platform-admin grant/revoke, support sign-in) | Organizations | Jobs (moderation) |
 * Announcements (platform broadcast) | Audit. Every fetch is lazy per tab (subcomponents
 * mount only while their tab is active); every mutation is confirmed via AlertDialog and
 * toasts + refreshes. API shapes are frozen in the T4-b/T5-a worklog entries.
 */

import { useEffect, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { toast } from '@/hooks/use-toast'
import { fmtDate, fmtDateTime, relativeTime, type BadgeTone } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ShieldCheck, Users, Building2, Briefcase, FolderKanban, FileText, Video, Search, Trash2,
  ShieldOff, History, Megaphone, LifeBuoy, LogIn,
} from 'lucide-react'

// ---------- local types (T4-b exact response shapes) ----------

interface PlatformUserItem {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  status: string // ACTIVE | SUSPENDED
  platformAdmin: boolean
  createdAt: string
  orgCount: number
  orgNames: string[]
}

interface OrgItem {
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
  memberCount: number
  projectCount: number
  jobCount: number
}

interface JobItem {
  id: string
  title: string
  orgId: string
  orgName: string
  departmentName: string | null
  status: string
  visibility: string
  openings: number
  applicationCount: number
  createdAt: string
  deadline: string | null
}

interface AuditItem {
  id: string
  createdAt: string
  action: string
  entity: string | null
  entityId: string | null
  actorName: string | null
  orgId: string
  orgName: string | null
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}

interface OverviewData {
  kpis: {
    users: number; activeUsers: number; suspendedUsers: number
    orgs: number; activeOrgs: number; suspendedOrgs: number
    openJobs: number; totalJobs: number
    projects: number; tasks: number; documents: number
    storageBytes: number; meetings: number; activeSessions: number
  }
  plans: Array<{ plan: string; count: number }>
  recentUsers: Array<{ id: string; name: string; email: string; avatarUrl: string | null; status: string; platformAdmin: boolean; createdAt: string }>
  recentAudit: Array<{ id: string; createdAt: string; action: string; orgName: string | null; actorName: string | null }>
  signupTrend: Array<{ date: string; count: number }>
}

// ---------- vocab / helpers ----------

const PLANS = ['Free', 'Starter', 'Growth', 'Business', 'Enterprise'] as const

const JOB_STATUS_TONE: Record<string, BadgeTone> = { OPEN: 'info', PAUSED: 'warning', CLOSED: 'muted' }
const VISIBILITY_TONE: Record<string, BadgeTone> = { PUBLIC: 'success', PLATFORM: 'secondary', PRIVATE: 'outline' }

/** bytes → 'MB' with 1 decimal (the only byte format this view needs) */
function fmtMB(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SHORT_DATE = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** debounced search value shared by the directory tabs */
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

// ---------- Overview tab ----------

interface TipDatum {
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

function SignupTip({ active, payload, label }: { active?: boolean; payload?: TipDatum[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { fullDate?: string; count?: number } | undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{d.fullDate ?? String(label ?? '')}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">New signups</span>
        <span className="font-medium tabular-nums">{d.count ?? 0}</span>
      </div>
    </div>
  )
}

function OverviewTab() {
  const { data, loading, error, refresh } = useData<OverviewData>('/api/platform/overview')

  if (error) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Couldn't load the platform overview"
        description={error}
        action={<Button variant="outline" onClick={refresh}>Try again</Button>}
      />
    )
  }
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    )
  }

  const k = data.kpis
  const chart = data.signupTrend.map((t) => ({
    label: SHORT_DATE(t.date),
    fullDate: new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    count: t.count,
  }))

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* KPI row — 7 cards reflow as 4+3 from md up */}
      <section aria-label="Platform KPIs" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <StatCard label="Users" value={k.users} sub={`${k.activeUsers} active · ${k.suspendedUsers} suspended`} tone="info" icon={Users} />
        <StatCard label="Organizations" value={k.orgs} sub={`${k.activeOrgs} active`} tone="success" icon={Building2} />
        <StatCard label="Open jobs" value={k.openJobs} sub={`${k.totalJobs} total`} icon={Briefcase} />
        <StatCard label="Projects" value={k.projects} icon={FolderKanban} />
        <StatCard label="Documents" value={k.documents} sub={`${fmtMB(k.storageBytes)} stored`} icon={FileText} />
        <StatCard label="Meetings" value={k.meetings} icon={Video} />
        <StatCard label="Active sessions" value={k.activeSessions} sub="live sign-ins" tone="warning" icon={LogIn} />
      </section>

      {/* plans + signup trend */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        <Card className="py-0 lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Plan distribution</CardTitle>
            <CardDescription>Organizations per subscription plan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 pb-5">
            {data.plans.map((p) => (
              <div key={p.plan} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                <span className="text-sm font-medium">{p.plan}</span>
                <Badge
                  variant="outline"
                  className={
                    p.count > 0
                      ? 'border-emerald-600/25 bg-emerald-600/12 font-medium tabular-nums text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-muted font-medium tabular-nums text-muted-foreground'
                  }
                >
                  {p.count}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="py-0 lg:col-span-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Signups — last 14 days</CardTitle>
            <CardDescription>New user accounts created per day.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                  <Tooltip content={<SignupTip />} cursor={{ fill: 'var(--muted)' }} />
                  <Bar dataKey="count" name="Signups" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* recent users + recent audit */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden py-0">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Recent users
            </h3>
            <span className="text-xs text-muted-foreground">Newest accounts</span>
          </div>
          <CardContent className="p-0">
            {data.recentUsers.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <div className="divide-y">
                {data.recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {u.name}
                        {u.platformAdmin && (
                          <Badge variant="outline" className="gap-1 border-emerald-600/25 bg-emerald-600/12 px-1.5 text-[10px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
                            <ShieldCheck className="size-3" aria-hidden /> Admin
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="shrink-0">
                      {u.status === 'SUSPENDED' ? (
                        <StatusBadge label="Suspended" tone="destructive" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{relativeTime(u.createdAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden py-0">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-amber-600 dark:text-amber-400" aria-hidden /> Recent audit
            </h3>
            <span className="text-xs text-muted-foreground">Latest platform actions</span>
          </div>
          <CardContent className="p-0">
            {data.recentAudit.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No audit entries yet.</p>
            ) : (
              <div className="divide-y">
                {data.recentAudit.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{a.action}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.orgName ?? 'Platform'}</p>
                      {a.actorName && <p className="truncate text-xs text-muted-foreground">by {a.actorName}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------- Users tab ----------

/** The four confirmed row actions (each opens its own AlertDialog). */
type UserAction =
  | { kind: 'toggle-status'; user: PlatformUserItem }
  | { kind: 'grant-admin'; user: PlatformUserItem }
  | { kind: 'revoke-admin'; user: PlatformUserItem }
  | { kind: 'impersonate'; user: PlatformUserItem }

interface ImpersonateResponse {
  signedInAs: { id: string; name: string; email: string }
  impersonatedBy: { id: string; name: string }
}

function UsersTab() {
  const { me, refreshMe, navigate } = useWorkspace()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q)
  const path = debouncedQ ? `/api/platform/users?q=${encodeURIComponent(debouncedQ)}` : '/api/platform/users'
  const { data, loading, error, refresh } = useData<{ items: PlatformUserItem[] }>(path)
  const [dialog, setDialog] = useState<UserAction | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const items = data?.items ?? []
  const selfId = me?.user.id

  async function runAction() {
    if (!dialog) return
    setBusy(true)
    try {
      if (dialog.kind === 'toggle-status') {
        const action = dialog.user.status === 'SUSPENDED' ? 'activate' : 'suspend'
        const updated = await api<PlatformUserItem>(`/api/platform/users/${dialog.user.id}`, {
          method: 'PATCH', body: { action },
        })
        if (action === 'suspend') {
          toast({ title: 'User suspended', description: `${updated.name} is signed out everywhere and cannot log in.` })
        } else {
          toast({ title: 'User reactivated', description: `${updated.name} can log in again.` })
        }
        refresh()
        setDialog(null)
      } else if (dialog.kind === 'grant-admin') {
        const updated = await api<PlatformUserItem>(`/api/platform/users/${dialog.user.id}`, {
          method: 'PATCH', body: { action: 'grant-admin' },
        })
        toast({ title: `${updated.name} is now a platform administrator`, description: 'They have full access to this console.' })
        refresh()
        setDialog(null)
      } else if (dialog.kind === 'revoke-admin') {
        const updated = await api<PlatformUserItem>(`/api/platform/users/${dialog.user.id}`, {
          method: 'PATCH', body: { action: 'revoke-admin' },
        })
        toast({ title: `${updated.name} is no longer a platform administrator`, description: 'They were signed out immediately and lose console access.' })
        refresh()
        setDialog(null)
      } else {
        // support sign-in — the session cookie switches to the target member.
        // Landing: a SELF module is stale-closure-safe; the shell then refines the
        // destination to Dashboard using the fresh identity (see WorkspaceShell).
        const res = await api<ImpersonateResponse>(`/api/platform/users/${dialog.user.id}/impersonate`, {
          method: 'POST', body: { reason: reason.trim() || undefined },
        })
        await refreshMe()
        navigate('my-day')
        toast({ title: `Support session opened as ${res.signedInAs.name}`, description: 'Everything you do is audit-logged — sign out when done.' })
        setDialog(null)
        setReason('')
      }
    } catch {
      // api() toasts the error
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchInput id="pa-users-q" value={q} onChange={setQ} placeholder="Search users by name or email…" />

      {error ? (
        <EmptyState
          icon={Users}
          title="Couldn't load users"
          description={error}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      ) : loading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users match"
          description={debouncedQ ? `Nothing found for “${debouncedQ}”.` : 'No user accounts exist yet.'}
          action={debouncedQ ? <Button variant="outline" onClick={() => setQ('')}>Clear search</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">User</TableHead>
                <TableHead className="min-w-28">Joined</TableHead>
                <TableHead className="min-w-44">Organizations</TableHead>
                <TableHead className="min-w-32">Role</TableHead>
                <TableHead className="min-w-28">Status</TableHead>
                <TableHead className="min-w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => {
                const suspended = u.status === 'SUSPENDED'
                // Server rule: suspending ANY platform admin (self or another) is rejected.
                const blocked = u.platformAdmin
                return (
                  <TableRow key={u.id} className={suspended ? 'opacity-75' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{u.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                    <TableCell>
                      {u.orgCount === 0 ? (
                        <span className="text-xs text-muted-foreground">No organization</span>
                      ) : (
                        <div className="min-w-0">
                          <p className="text-sm font-medium tabular-nums">{u.orgCount}</p>
                          <p className="max-w-40 truncate text-xs text-muted-foreground" title={u.orgNames.join(', ')}>
                            {u.orgNames.join(' · ')}
                          </p>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.platformAdmin ? (
                        <Badge variant="outline" className="gap-1 border-emerald-600/25 bg-emerald-600/12 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <ShieldCheck className="size-3" aria-hidden /> Platform admin
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Member</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={suspended ? 'Suspended' : 'Active'}
                        tone={suspended ? 'destructive' : 'success'}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Platform-admin role management — never on your own row (the server rejects self-changes). */}
                        {u.platformAdmin
                          ? u.id !== selfId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/15"
                              title="Revoke platform admin"
                              onClick={() => setDialog({ kind: 'revoke-admin', user: u })}
                              aria-label={`Remove ${u.name}'s platform admin access`}
                            >
                              <ShieldOff className="size-4" aria-hidden />
                            </Button>
                          )
                          : u.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 min-h-9 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                              title="Grant platform admin"
                              onClick={() => setDialog({ kind: 'grant-admin', user: u })}
                              aria-label={`Make ${u.name} a platform administrator`}
                            >
                              <ShieldCheck className="size-4" aria-hidden />
                            </Button>
                          )}
                        {/* Support sign-in — ACTIVE MEMBER accounts only: admins can't be
                            impersonated and org-less accounts (applicants) have no workspace
                            to debug — they'd land on onboarding with no exit banner. */}
                        {!u.platformAdmin && u.status === 'ACTIVE' && u.orgCount > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 min-h-9 text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-400 dark:hover:bg-teal-500/15"
                            title="Support sign-in"
                            onClick={() => { setReason(''); setDialog({ kind: 'impersonate', user: u }) }}
                            aria-label={`Open a support session as ${u.name}`}
                          >
                            <LifeBuoy className="size-4" aria-hidden />
                          </Button>
                        )}
                        {suspended ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-9"
                            onClick={() => setDialog({ kind: 'toggle-status', user: u })}
                            aria-label={`Reactivate ${u.name}`}
                          >
                            <ShieldCheck className="size-3.5" aria-hidden /> Activate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/15"
                            disabled={blocked}
                            title={blocked ? 'Platform administrators cannot be suspended' : undefined}
                            onClick={() => setDialog({ kind: 'toggle-status', user: u })}
                            aria-label={`Suspend ${u.name}`}
                          >
                            <ShieldOff className="size-3.5" aria-hidden /> Suspend
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
      <p className="text-xs text-muted-foreground">
        {items.length} user{items.length === 1 ? '' : 's'} · signed in as {me?.user.name}
      </p>

      {/* row-action confirmations (suspend/activate, grant/revoke admin, support sign-in) */}
      <AlertDialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null) }}>
        <AlertDialogContent>
          {dialog && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {dialog.kind === 'toggle-status' && (dialog.user.status === 'SUSPENDED'
                    ? `Reactivate ${dialog.user.name}?`
                    : `Suspend ${dialog.user.name}?`)}
                  {dialog.kind === 'grant-admin' && `Make ${dialog.user.name} a platform administrator?`}
                  {dialog.kind === 'revoke-admin' && `Remove ${dialog.user.name}'s platform admin access?`}
                  {dialog.kind === 'impersonate' && `Open a support session as ${dialog.user.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {dialog.kind === 'toggle-status' && (dialog.user.status === 'SUSPENDED'
                    ? 'Their account is restored and they can log in again immediately.'
                    : 'They are signed out everywhere immediately and cannot log in until reactivated.')}
                  {dialog.kind === 'grant-admin' && 'They gain full access to this console — every organization, moderation and audit.'}
                  {dialog.kind === 'revoke-admin' && 'They are signed out immediately and lose console access.'}
                  {dialog.kind === 'impersonate' && `You'll be signed in as ${dialog.user.name} to reproduce their issue. Everything you do is audit-logged; sign out when done.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {dialog.kind === 'impersonate' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pa-support-reason" className="text-xs">Reason (optional)</Label>
                  <Input
                    id="pa-support-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={200}
                    placeholder="What are you investigating? (logged to audit)"
                  />
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runAction()}
                  disabled={busy}
                  className={
                    dialog.kind === 'toggle-status' && dialog.user.status === 'SUSPENDED'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : dialog.kind === 'toggle-status'
                        ? 'bg-destructive text-white hover:bg-destructive/90'
                        : dialog.kind === 'revoke-admin'
                          ? 'bg-destructive text-white hover:bg-destructive/90'
                          : undefined
                  }
                >
                  {dialog.kind === 'toggle-status' && (dialog.user.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend')}
                  {dialog.kind === 'grant-admin' && 'Grant admin'}
                  {dialog.kind === 'revoke-admin' && 'Revoke admin'}
                  {dialog.kind === 'impersonate' && (busy ? 'Opening…' : 'Open session')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Organizations tab ----------

function OrgsTab() {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q)
  const path = debouncedQ ? `/api/platform/orgs?q=${encodeURIComponent(debouncedQ)}` : '/api/platform/orgs'
  const { data, loading, error, refresh } = useData<{ items: OrgItem[] }>(path)
  const [confirming, setConfirming] = useState<OrgItem | null>(null)
  const [planChange, setPlanChange] = useState<{ org: OrgItem; plan: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const items = data?.items ?? []

  async function toggleStatus() {
    if (!confirming) return
    setBusyId(confirming.id)
    try {
      const action = confirming.status === 'SUSPENDED' ? 'activate' : 'suspend'
      const updated = await api<OrgItem>(`/api/platform/orgs/${confirming.id}`, {
        method: 'PATCH', body: { action },
      })
      if (action === 'suspend') {
        toast({ title: 'Organization suspended', description: `${updated.name}'s members lose workspace access; the owner was notified.` })
      } else {
        toast({ title: 'Organization reactivated', description: `${updated.name} is live again.` })
      }
      refresh()
      setConfirming(null)
    } catch {
      // api() toasts
    } finally {
      setBusyId(null)
    }
  }

  async function applyPlan() {
    if (!planChange) return
    setBusyId(planChange.org.id)
    try {
      const updated = await api<OrgItem>(`/api/platform/orgs/${planChange.org.id}`, {
        method: 'PATCH', body: { plan: planChange.plan },
      })
      toast({ title: 'Plan changed', description: `${updated.name} is now on the ${updated.plan} plan. The owner was notified.` })
      refresh()
      setPlanChange(null)
    } catch {
      // api() toasts
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchInput id="pa-orgs-q" value={q} onChange={setQ} placeholder="Search organizations by name, slug or industry…" />

      {error ? (
        <EmptyState
          icon={Building2}
          title="Couldn't load organizations"
          description={error}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      ) : loading ? (
        <TableSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations match"
          description={debouncedQ ? `Nothing found for “${debouncedQ}”.` : 'No organizations have signed up yet.'}
          action={debouncedQ ? <Button variant="outline" onClick={() => setQ('')}>Clear search</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Organization</TableHead>
                <TableHead className="min-w-36">Plan</TableHead>
                <TableHead className="min-w-24 text-right">Members</TableHead>
                <TableHead className="min-w-36">Owner</TableHead>
                <TableHead className="min-w-24 text-right">Projects</TableHead>
                <TableHead className="min-w-20 text-right">Jobs</TableHead>
                <TableHead className="min-w-28">Status</TableHead>
                <TableHead className="min-w-28">Created</TableHead>
                <TableHead className="min-w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((org) => {
                const suspended = org.status === 'SUSPENDED'
                const busy = busyId === org.id
                return (
                  <TableRow key={org.id} className={suspended ? 'opacity-75' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-xs font-semibold">
                          {org.logoUrl ? (
                            <img src={org.logoUrl} alt="" className="size-full object-cover" />
                          ) : (
                            org.name.slice(0, 2).toUpperCase()
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{org.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {org.slug}{org.industry ? ` · ${org.industry}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {busy ? (
                        <span className="text-sm text-muted-foreground">{org.plan}</span>
                      ) : (
                        <Select
                          value={org.plan}
                          onValueChange={(plan) => plan !== org.plan && setPlanChange({ org, plan })}
                        >
                          <SelectTrigger
                            aria-label={`Plan for ${org.name}`}
                            className="h-9 w-32"
                            disabled={suspended}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLANS.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{org.memberCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{org.ownerName ?? '—'}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{org.projectCount}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{org.jobCount}</TableCell>
                    <TableCell>
                      <StatusBadge label={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'destructive' : 'success'} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(org.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {suspended ? (
                        <Button variant="outline" size="sm" className="min-h-9" onClick={() => setConfirming(org)} aria-label={`Reactivate ${org.name}`}>
                          <ShieldCheck className="size-3.5" aria-hidden /> Activate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/15"
                          onClick={() => setConfirming(org)}
                          aria-label={`Suspend ${org.name}`}
                        >
                          <ShieldOff className="size-3.5" aria-hidden /> Suspend
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* suspend / activate confirmation */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirming.status === 'SUSPENDED' ? `Reactivate ${confirming.name}?` : `Suspend ${confirming.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirming.status === 'SUSPENDED'
                    ? 'Members of this organization regain workspace access immediately.'
                    : 'Members lose workspace access immediately; the owner is notified.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void toggleStatus()}
                  disabled={busyId !== null}
                  className={
                    confirming.status === 'SUSPENDED'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-destructive text-white hover:bg-destructive/90'
                  }
                >
                  {confirming.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* plan change confirmation */}
      <AlertDialog open={!!planChange} onOpenChange={(o) => { if (!o) setPlanChange(null) }}>
        <AlertDialogContent>
          {planChange && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Change {planChange.org.name} to {planChange.plan}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The subscription plan switches from {planChange.org.plan} to {planChange.plan} and the
                  organization owner is notified.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void applyPlan()} disabled={busyId !== null}>
                  Change plan
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Jobs tab (moderation) ----------

function JobsTab() {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q)
  const [status, setStatus] = useState('all')
  const params = new URLSearchParams()
  if (debouncedQ) params.set('q', debouncedQ)
  if (status !== 'all') params.set('status', status)
  const path = `/api/platform/jobs?${params.toString()}`
  const { data, loading, error, refresh } = useData<{ items: JobItem[] }>(path)
  const [removing, setRemoving] = useState<JobItem | null>(null)
  const [busy, setBusy] = useState(false)

  const items = data?.items ?? []

  async function removeJob() {
    if (!removing) return
    setBusy(true)
    try {
      await api(`/api/platform/jobs/${removing.id}`, { method: 'DELETE' })
      toast({ title: 'Job removed', description: `“${removing.title}” and its applications were deleted; ${removing.orgName}'s owner was notified.` })
      refresh()
      setRemoving(null)
    } catch {
      // api() toasts
    } finally {
      setBusy(false)
    }
  }

  const hasFilters = debouncedQ !== '' || status !== 'all'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchInput id="pa-jobs-q" value={q} onChange={setQ} placeholder="Search jobs by title or organization…" />
        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor="pa-jobs-status" className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="pa-jobs-status" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={Briefcase}
          title="Couldn't load jobs"
          description={error}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      ) : loading ? (
        <TableSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs match"
          description={hasFilters ? 'Try clearing the search or status filter.' : 'No job postings exist across organizations yet.'}
          action={hasFilters ? (
            <Button variant="outline" onClick={() => { setQ(''); setStatus('all') }}>Clear filters</Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-60">Job</TableHead>
                <TableHead className="min-w-36">Department</TableHead>
                <TableHead className="min-w-28">Visibility</TableHead>
                <TableHead className="min-w-20 text-right">Openings</TableHead>
                <TableHead className="min-w-24 text-right">Applicants</TableHead>
                <TableHead className="min-w-28">Posted</TableHead>
                <TableHead className="min-w-28">Deadline</TableHead>
                <TableHead className="min-w-28">Status</TableHead>
                <TableHead className="min-w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{j.title}</p>
                    <p className="text-xs text-muted-foreground">{j.orgName}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{j.departmentName ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge label={j.visibility} tone={VISIBILITY_TONE[j.visibility] ?? 'outline'} dot={false} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{j.openings}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{j.applicationCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(j.createdAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{j.deadline ? fmtDate(j.deadline) : '—'}</TableCell>
                  <TableCell>
                    <StatusBadge label={j.status} tone={JOB_STATUS_TONE[j.status] ?? 'outline'} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/15"
                      onClick={() => setRemoving(j)}
                      aria-label={`Remove ${j.title}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* remove job confirmation */}
      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null) }}>
        <AlertDialogContent>
          {removing && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {removing.title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The posting and all its applications are permanently deleted. {removing.orgName}&apos;s owner is notified.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void removeJob()} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
                  Remove job
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Announcements tab (platform broadcast) ----------

interface BroadcastResponse {
  sentTo: number
  title: string
}

function AnnouncementsTab() {
  // Cheap reach estimate — the overview endpoint already aggregates activeOrgs.
  const { data: overview } = useData<{ kpis: { activeOrgs: number } }>('/api/platform/overview')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const activeOrgs = overview?.kpis.activeOrgs ?? null
  const ready = title.trim().length > 0 && message.trim().length > 0

  async function send() {
    setBusy(true)
    try {
      const res = await api<BroadcastResponse>('/api/platform/broadcast', {
        method: 'POST', body: { title: title.trim(), body: message.trim() },
      })
      toast({
        title: `Broadcast sent to ${res.sentTo} organization${res.sentTo === 1 ? '' : 's'}`,
        description: `“${res.title}” is pinned in each workspace.`,
      })
      setTitle('')
      setMessage('')
      setConfirming(false)
    } catch {
      // api() toasts the error
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="py-0">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4.5 text-amber-600 dark:text-amber-400" aria-hidden /> Platform announcement
          </CardTitle>
          <CardDescription>
            Pinned in every active organization&apos;s workspace and notified to all their members.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pa-broadcast-title">Title</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{title.length}/160</span>
            </div>
            <Input
              id="pa-broadcast-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="e.g. Scheduled maintenance this Sunday"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pa-broadcast-body">Message</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{message.length}/2000</span>
            </div>
            <Textarea
              id="pa-broadcast-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder="Share the update with every organization…"
              className="min-h-32"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Announcements appear in each workspace&apos;s Announcements module and in members&apos; notifications.
            </p>
            <Button className="shrink-0 sm:min-w-36" disabled={!ready || busy} onClick={() => setConfirming(true)}>
              <Megaphone className="size-4" aria-hidden /> {busy ? 'Sending…' : 'Send announcement'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* send confirmation */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to all active organizations?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeOrgs === null
                ? 'This posts a pinned announcement to every active organization and notifies their members.'
                : `This posts a pinned announcement to ${activeOrgs} organization${activeOrgs === 1 ? '' : 's'} and notifies their members.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void send()} disabled={busy}>
              {busy ? 'Sending…' : 'Send announcement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Audit tab ----------

function AuditTab() {
  const [limit, setLimit] = useState(50)
  const { data, loading, error, refresh } = useData<{ items: AuditItem[] }>(`/api/platform/audit?limit=${limit}`)
  const items = data?.items ?? []
  const fullPage = items.length === limit

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <EmptyState
          icon={History}
          title="Couldn't load the audit trail"
          description={error}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      ) : loading && limit === 50 ? (
        <TableSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={History} title="No audit entries yet" description="Platform and organization mutations will appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">When</TableHead>
                  <TableHead className="min-w-36">Actor</TableHead>
                  <TableHead className="min-w-36">Organization</TableHead>
                  <TableHead className="min-w-40">Action</TableHead>
                  <TableHead className="min-w-32">Entity</TableHead>
                  <TableHead className="min-w-56">Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => {
                  const newJson = a.newValues ? JSON.stringify(a.newValues).slice(0, 80) : null
                  const oldJson = a.oldValues ? JSON.stringify(a.oldValues).slice(0, 80) : null
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDateTime(a.createdAt)}</TableCell>
                      <TableCell className="text-sm">{a.actorName ?? 'Platform'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.orgName ?? '—'}</TableCell>
                      <TableCell>
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{a.action}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.entity ?? '—'}</TableCell>
                      <TableCell className="max-w-72">
                        <span className="block truncate text-xs text-muted-foreground" title={a.newValues ? JSON.stringify(a.newValues) : undefined}>
                          {newJson ? `→ ${newJson}` : oldJson ? `− ${oldJson}` : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {loading && <p className="text-center text-xs text-muted-foreground">Loading more entries…</p>}
          {fullPage && (
            <div className="flex justify-center">
              <Button variant="outline" className="min-h-11" onClick={() => setLimit((l) => l + 50)} disabled={loading}>
                Load more
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Showing the {items.length} most recent entr{items.length === 1 ? 'y' : 'ies'}.
          </p>
        </>
      )}
    </div>
  )
}

// ---------- view ----------

export default function PlatformAdminView() {
  const { me } = useWorkspace()

  // SaaS console gate — platform administrators only (org-less by design).
  if (!me?.user.platformAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={ShieldCheck} title="Platform administration" description="SaaS owner console — users, organizations, moderation and audit." />
        <EmptyState
          icon={ShieldCheck}
          title="You do not have access to the platform console"
          description="This area is reserved for OrgOS platform administrators."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ShieldCheck}
        title="Platform administration"
        description="SaaS owner console — users, organizations, moderation and audit."
      />

      <Tabs defaultValue="overview">
        <TabsList className="h-12 w-full justify-start overflow-x-auto p-1 sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5 px-4">Overview</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 px-4">Users</TabsTrigger>
          <TabsTrigger value="orgs" className="gap-1.5 px-4">Organizations</TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5 px-4">Jobs</TabsTrigger>
          <TabsTrigger value="announcements" className="gap-1.5 px-4">Announcements</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 px-4">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="orgs" className="mt-4"><OrgsTab /></TabsContent>
        <TabsContent value="jobs" className="mt-4"><JobsTab /></TabsContent>
        <TabsContent value="announcements" className="mt-4"><AnnouncementsTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  )
}
