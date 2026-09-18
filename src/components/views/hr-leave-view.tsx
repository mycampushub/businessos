'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { fmtDate, LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, LEAVE_STATUSES } from '@/lib/format'
import { CalendarDays, CalendarOff, CalendarPlus, CalendarRange, CheckCircle2, CircleAlert, Hourglass, Leaf, Sparkles, XCircle } from 'lucide-react'

// ---------- local types ----------

interface LeaveRequest {
  id: string
  membershipId: string
  userName: string
  userAvatar: string | null
  leaveTypeId: string
  leaveTypeName: string
  leaveTypeColor: string | null
  startDate: string
  endDate: string
  days: number
  reason: string | null
  status: string
  approverName: string | null
  decidedAt: string | null
  createdAt: string
}

interface LeaveType { id: string; name: string; daysPerYear: number; color: string | null }

interface Balance { leaveTypeId: string; name: string; usedDays: number; entitledDays: number }

/** GET /api/hr/holidays item slice (T5-a — readable by every member). */
interface HolidayInfo {
  id: string
  name: string
  type: string
  startDate: string
  endDate: string
  days: number
}

interface LeaveData {
  items: LeaveRequest[]
  leaveTypes: LeaveType[]
  balances: Balance[]
}

/** local YYYY-MM-DD key of a Date parsed at local noon (timezone-safe day math) */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** weekday number 1=Mon..7=Sun */
function weekdayNum(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/** every local date key covered by the holiday's inclusive range */
function holidayKeys(items: HolidayInfo[]): Set<string> {
  const keys = new Set<string>()
  for (const h of items) {
    const start = new Date(h.startDate.slice(0, 10) + 'T12:00:00')
    const end = new Date(h.endDate.slice(0, 10) + 'T12:00:00')
    let cursor = start
    let guard = 0
    while (cursor <= end && guard < 400) {
      keys.add(dateKey(cursor))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12)
      guard++
    }
  }
  return keys
}

/** work days in [start..end] minus weekly + public/company holidays (server-side day math mirrored) */
function chargeableDays(start: string, end: string, workDays: number[], holidays: Set<string>): number {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (s > e) return 0
  let count = 0
  let cursor = new Date(s)
  let guard = 0
  while (cursor <= e && guard < 800) {
    if (workDays.includes(weekdayNum(cursor)) && !holidays.has(dateKey(cursor))) count++
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12)
    guard++
  }
  return count
}

export default function HrLeaveView() {
  const { role, membership } = useWorkspace()
  const canApprove = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'HR'

  const allData = useData<LeaveData>('/api/hr/leave')
  const myData = useData<LeaveData>('/api/hr/leave?mine=true')

  const [requestOpen, setRequestOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [mineOnly, setMineOnly] = useState(false)

  const allItems = allData.data?.items ?? []
  const myItems = myData.data?.items ?? []
  const balances = myData.data?.balances ?? []
  const leaveTypes = (myData.data?.leaveTypes ?? allData.data?.leaveTypes ?? [])
  const typeColor = useMemo(() => {
    const m = new Map<string, string>()
    leaveTypes.forEach((lt) => m.set(lt.id, lt.color ?? ''))
    return m
  }, [leaveTypes])

  // ---------- requests tab stats ----------
  const pending = allItems.filter((r) => r.status === 'PENDING').length
  const approved = allItems.filter((r) => r.status === 'APPROVED').length
  const rejected = allItems.filter((r) => r.status === 'REJECTED').length

  const filtered = useMemo(() => {
    return allItems.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (mineOnly && membership && r.membershipId !== membership.id) return false
      return true
    })
  }, [allItems, statusFilter, mineOnly, membership])

  async function act(id: string, action: 'approve' | 'reject' | 'cancel') {
    try {
      await api(`/api/hr/leave/${id}`, { method: 'PATCH', body: { action } })
      toast({
        title: action === 'approve' ? 'Leave approved' : action === 'reject' ? 'Leave rejected' : 'Request cancelled',
        description: action === 'cancel' ? 'Your pending request was withdrawn.' : 'The requester has been notified.',
      })
      allData.refresh()
      myData.refresh()
    } catch {
      // api() toasts the error
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Leaf}
        title="Leave"
        description="Time-off requests, approvals and balances for the whole team."
        actions={
          <Button onClick={() => setRequestOpen(true)} className="min-h-11">
            <CalendarPlus className="mr-1.5 size-4" aria-hidden /> Request leave
          </Button>
        }
      />

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="mine">My leave</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        {/* ---------------- Requests ---------------- */}
        <TabsContent value="requests" className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Pending" value={allData.loading ? 0 : pending} sub="Awaiting decision" icon={Hourglass} tone="warning" loading={allData.loading} />
            <StatCard label="Approved" value={allData.loading ? 0 : approved} sub="This year" icon={CheckCircle2} tone="success" loading={allData.loading} />
            <StatCard label="Rejected" value={allData.loading ? 0 : rejected} sub="This year" icon={XCircle} tone="danger" loading={allData.loading} />
          </div>

          <Card className="py-0">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]" aria-label="Filter by status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {LEAVE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{LEAVE_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted-foreground">
                <Switch checked={mineOnly} onCheckedChange={setMineOnly} aria-label="Show only my requests" />
                Only my requests
              </label>
            </CardContent>
          </Card>

          <LeaveTable
            items={filtered}
            loading={allData.loading}
            error={allData.error}
            canApprove={canApprove}
            myMembershipId={membership?.id ?? null}
            onAction={act}
          />
        </TabsContent>

        {/* ---------------- My leave ---------------- */}
        <TabsContent value="mine" className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {myData.loading && !myData.data ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : balances.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">No leave types configured for this organization.</p>
            ) : (
              balances.map((b) => <BalanceCard key={b.leaveTypeId} balance={b} color={typeColor.get(b.leaveTypeId)} compact />)
            )}
          </div>
          <LeaveTable
            items={myItems}
            loading={myData.loading}
            error={myData.error}
            canApprove={canApprove}
            myMembershipId={membership?.id ?? null}
            onAction={act}
            myView
          />
        </TabsContent>

        {/* ---------------- Balances ---------------- */}
        <TabsContent value="balances" className="flex flex-col gap-6">
          {myData.loading && !myData.data ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
            </div>
          ) : balances.length === 0 ? (
            <EmptyState icon={CalendarRange} title="No leave types" description="This organization has no leave types configured yet." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {balances.map((b) => <BalanceCard key={b.leaveTypeId} balance={b} color={typeColor.get(b.leaveTypeId)} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Request leave dialog */}
      {requestOpen && (
        <RequestLeaveDialog
          leaveTypes={leaveTypes}
          onClose={() => setRequestOpen(false)}
          onCreated={() => { allData.refresh(); myData.refresh() }}
        />
      )}
    </div>
  )
}

// ---------- shared table ----------

function LeaveTable({
  items, loading, error, canApprove, myMembershipId, onAction, myView = false,
}: {
  items: LeaveRequest[]
  loading: boolean
  error: string | null
  canApprove: boolean
  myMembershipId: string | null
  onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void
  myView?: boolean
}) {
  if (loading) {
    return (
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    )
  }
  if (error) {
    return <EmptyState icon={CircleAlert} title="Could not load leave requests" description={error} />
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarOff}
        title={myView ? 'You have no leave requests' : 'No leave requests'}
        description={myView ? 'Requests you file will appear here with their approval status.' : 'Once team members request time off, requests show up here.'}
      />
    )
  }
  return (
    <Card className="py-0 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {!myView && <TableHead>Employee</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="hidden md:table-cell">Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Approver</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => {
              const isMine = myMembershipId === r.membershipId
              const pending = r.status === 'PENDING'
              return (
                <TableRow key={r.id}>
                  {!myView && (
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={r.userName} avatarUrl={r.userAvatar} size="sm" />
                        <p className="truncate text-sm font-medium">{r.userName}</p>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.leaveTypeColor ?? '#10b981' }} aria-hidden />
                      {r.leaveTypeName}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    <p>{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</p>
                    <p className="text-xs">{r.days} day{r.days === 1 ? '' : 's'}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground md:table-cell">{r.reason ?? '—'}</TableCell>
                  <TableCell><StatusBadge label={LEAVE_STATUS_LABELS[r.status] ?? r.status} tone={LEAVE_STATUS_TONE[r.status] ?? 'outline'} /></TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {r.approverName ? (
                      <div className="flex flex-col">
                        <span>{r.approverName}</span>
                        <span className="text-xs">{fmtDate(r.decidedAt)}</span>
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {pending && (canApprove || isMine) ? (
                      <div className="flex flex-wrap gap-2">
                        {canApprove && (
                          <>
                            <Button size="sm" className="h-9 bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={() => onAction(r.id, 'approve')}>
                              <CheckCircle2 className="mr-1 size-3.5" aria-hidden /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => onAction(r.id, 'reject')}>
                              <XCircle className="mr-1 size-3.5" aria-hidden /> Reject
                            </Button>
                          </>
                        )}
                        {isMine && (
                          <Button size="sm" variant="ghost" className="h-9" onClick={() => onAction(r.id, 'cancel')}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

// ---------- balance card ----------

function BalanceCard({ balance, color, compact = false }: { balance: Balance; color?: string; compact?: boolean }) {
  const pct = balance.entitledDays > 0 ? Math.min(100, Math.round((balance.usedDays / balance.entitledDays) * 100)) : 0
  const dotColor = color || balanceColor(balance.leaveTypeId, balance.name)
  if (compact) {
    return (
      <Card className="py-0">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
              {balance.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{balance.usedDays} of {balance.entitledDays} days used</p>
          </div>
          <p className="text-lg font-semibold tabular-nums">{balance.entitledDays - balance.usedDays}</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="py-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="size-3 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
          {balance.name}
        </CardTitle>
        <CardDescription>{balance.usedDays} of {balance.entitledDays} days used</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Progress value={pct} aria-label={`${balance.name} usage`} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pct}% utilized</span>
          <span className="flex items-center gap-1 font-medium text-foreground"><Sparkles className="size-3" aria-hidden /> {Math.max(0, balance.entitledDays - balance.usedDays)} days left</span>
        </div>
      </CardContent>
    </Card>
  )
}

/** deterministic pleasant color per leave type when server color missing */
const BALANCE_PALETTE = ['#10b981', '#f59e0b', '#14b8a6', '#ec4899', '#8b5cf6', '#84cc16']
function balanceColor(id: string, name: string): string {
  let h = 0
  const s = id + name
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return BALANCE_PALETTE[Math.abs(h) % BALANCE_PALETTE.length]
}

// ---------- request dialog ----------

function RequestLeaveDialog({
  leaveTypes, onClose, onCreated,
}: {
  leaveTypes: LeaveType[]
  onClose: () => void
  onCreated: () => void
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // T5: holidays + work days power the chargeable-days preview (all members can read)
  const holidaysQ = useData<{ items: HolidayInfo[]; workDays: number[] }>('/api/hr/holidays')
  const workDays = holidaysQ.data?.workDays?.length ? holidaysQ.data.workDays : [1, 2, 3, 4, 5]
  const holidays = useMemo(() => holidayKeys(holidaysQ.data?.items ?? []), [holidaysQ.data])
  const chargeable = startDate && endDate && endDate >= startDate
    ? chargeableDays(startDate, endDate, workDays, holidays)
    : null

  async function submit() {
    if (!leaveTypeId || !startDate || !endDate) {
      toast({ title: 'Missing details', description: 'Please pick a leave type and both dates.', variant: 'destructive' })
      return
    }
    if (new Date(endDate + 'T12:00:00') < new Date(startDate + 'T12:00:00')) {
      toast({ title: 'Invalid date range', description: 'The end date cannot be before the start date.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      // days are SERVER-computed (frozen T5 contract) — only these 4 fields are sent
      const created = await api<{ days: number }>('/api/hr/leave', {
        method: 'POST',
        body: { leaveTypeId, startDate, endDate, reason: reason.trim() || undefined },
      })
      toast({
        title: 'Leave requested',
        description: `${created.days} chargeable day${created.days === 1 ? '' : 's'} — your manager has been notified for approval.`,
      })
      onCreated()
      onClose()
    } catch {
      // api() toasts the error (e.g. all-holiday range 422)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> Request leave</DialogTitle>
          <DialogDescription>File a time-off request for approval by your manager.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Leave type *</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger className="w-full" aria-label="Leave type"><SelectValue placeholder="Choose a type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    {lt.name} · {lt.daysPerYear}d/year
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lv-start">Start date *</Label>
            <Input id="lv-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lv-end">End date *</Label>
            <Input id="lv-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2" aria-live="polite">
            {chargeable === null ? (
              <p className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                Pick both dates to preview the chargeable days — weekly and public holidays are excluded.
              </p>
            ) : chargeable === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                No chargeable days in this range — it falls on your weekly or public holidays.
              </p>
            ) : (
              <p className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                ≈ {chargeable} chargeable {chargeable === 1 ? 'day' : 'days'} — weekly and public holidays excluded.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="lv-reason">Reason (optional)</Label>
            <Textarea id="lv-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="A short note for your approver…" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !leaveTypeId || !startDate || !endDate}>
            {saving ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
