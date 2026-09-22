'use client'

import { Fragment, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { rowClick } from '@/components/app/row-click'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { fmtDate, fmtTime, minutesToHours, todayStr, ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE, ATTENDANCE_STATUSES } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ArrowRight, CalendarDays, CalendarX2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  Info, LogIn, LogOut, MoonStar, Pencil, Sun, Timer, TrendingUp, UsersRound,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// ---------- local types (GET /api/hr/attendance — T1-c item + T3-b sessions) ----------

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

interface AttendanceRow {
  id: string
  membershipId: string
  userName: string
  userAvatar: string | null
  date: string
  checkIn: string | null
  checkOut: string | null
  status: string
  workedMinutes: number | null
  note: string | null
  sessions: Session[]
}

interface AttendanceData {
  items: AttendanceRow[]
  date: string | null
  myToday: AttendanceRow | null
}

interface TrendPoint {
  date: string
  present: number
  late: number
  leave: number
  absent: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function OpenSessionBadge() {
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

export default function HrAttendanceView() {
  const { can, canView, navigate } = useWorkspace()
  // module access gating: FULL → adjustments; VIEW → read-only (HIDDEN users never reach this view)
  const canManage = can('hr-attendance')
  const showTrend = canView('dashboard')

  const [dateStr, setDateStr] = useState(todayStr())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [manualRow, setManualRow] = useState<AttendanceRow | null>(null)

  const attData = useData<AttendanceData>(`/api/hr/attendance?date=${dateStr}`, [dateStr])
  // trend only exists for users with dashboard access (MANAGER/HR default) — hidden otherwise, failures silent
  const dashData = useData<{ attendanceTrend: TrendPoint[] }>(showTrend ? '/api/dashboard' : null, [showTrend])
  // T5-c: month-to-date rows for the late-this-month summary — same attendance API,
  // counted client-side (the policy endpoint is admin-only and stays untouched).
  const monthStart = `${todayStr().slice(0, 7)}-01`
  const monthData = useData<{ items: AttendanceRow[] }>(
    `/api/hr/attendance?from=${monthStart}&to=${todayStr()}`
  )
  const monthPrefix = todayStr().slice(0, 7)
  const lateThisMonth = (monthData.data?.items ?? []).filter(
    (r) => r.status === 'LATE' && r.date.startsWith(monthPrefix)
  ).length

  const items = attData.data?.items ?? []
  const isToday = dateStr === todayStr()
  const loading = attData.loading

  // ---------- day stats + total hours ----------
  const present = items.filter((r) => r.status === 'PRESENT').length
  const late = items.filter((r) => r.status === 'LATE').length
  const onLeave = items.filter((r) => r.status === 'LEAVE').length
  const absent = items.filter((r) => r.status === 'ABSENT').length
  const totalWorked = items.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0)

  // ---------- trend ----------
  const trend = (dashData.data?.attendanceTrend ?? []).map((t) => ({
    ...t,
    label: new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    onSite: t.present + t.late,
  }))
  const trendTotals = trend.reduce(
    (acc, t) => ({ onSite: acc.onSite + t.onSite, late: acc.late + t.late, total: acc.total + t.onSite + t.leave + t.absent }),
    { onSite: 0, late: 0, total: 0 },
  )
  const avgPresence = trendTotals.total ? Math.round((trendTotals.onSite / trendTotals.total) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarDays}
        title="Attendance"
        description="Daily check-ins, working hours and presence across the organization."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDateStr((d) => shiftDate(d, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">{fmtDate(dateStr + 'T12:00:00')}</span>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDateStr((d) => shiftDate(d, 1))}>
              <ChevronRight className="size-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" onClick={() => setDateStr(todayStr())}>
                <Sun className="mr-1.5 size-4" aria-hidden /> Today
              </Button>
            )}
          </div>
        }
      />

      {/* Self-service notice — employees clock in/out from My Workspace (this module is management/read-only) */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <Info className="size-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Employees check in from My Workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {canManage
                  ? 'Management view — click a row to review sessions and adjust records; your own check-ins live in My Workspace.'
                  : 'You have view access here. Check in and out, log task hours and track your stats in My Workspace.'}
              </p>
            </div>
          </div>
          {!canManage && (
            <Button variant="outline" onClick={() => navigate('my-day')} className="shrink-0">
              <Sun className="mr-1.5 size-4" aria-hidden /> Go to My Workspace
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Day stats */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Present" value={loading ? 0 : present} sub={`of ${items.length} records`} icon={UsersRound} tone="success" loading={loading} />
          <StatCard label="Late" value={loading ? 0 : late} sub="Late arrivals" icon={Timer} tone="warning" loading={loading} />
          <StatCard label="On leave" value={loading ? 0 : onLeave} sub="Approved leave" icon={MoonStar} tone="info" loading={loading} />
          <StatCard label="Absent" value={loading ? 0 : absent} sub="No show" icon={CalendarX2} tone="danger" loading={loading} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Timer className="size-3.5" aria-hidden />
          Total hours on {fmtDate(dateStr + 'T12:00:00')}:
          <strong className="font-semibold text-foreground">{minutesToHours(loading ? null : totalWorked)}</strong>
          {items.length > 0 && <> across {items.length} record{items.length === 1 ? '' : 's'}</>}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <CalendarDays className="size-3.5" aria-hidden />
          Late arrivals this month:
          <strong className="font-semibold text-foreground">
            {monthData.loading && !monthData.data ? '…' : lateThisMonth}
          </strong>
          <span aria-hidden>·</span>
          <span>penalties apply in payroll per organization rules</span>
        </p>
      </div>

      {/* Day table — expandable rows (sessions + task entries per member) */}
      {loading ? (
        <Card className="py-0">
          <CardContent className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : attData.error ? (
        <EmptyState
          icon={CalendarDays}
          title="Could not load attendance"
          description={attData.error}
          action={<Button variant="outline" onClick={attData.refresh}>Try again</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No attendance records"
          description={`Nobody has a record for ${fmtDate(dateStr + 'T12:00:00')} yet. Employees can check in from their My Workspace.`}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Worked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
                      aria-expanded={expandedId === r.id}
                      aria-label={`Sessions for ${r.userName}`}
                      {...rowClick(() => setExpandedId((cur) => (cur === r.id ? null : r.id)))}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <ChevronDown
                            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandedId === r.id && 'rotate-180')}
                            aria-hidden
                          />
                          <UserAvatar name={r.userName} avatarUrl={r.userAvatar} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{r.userName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.sessions.length > 0
                                ? `${r.sessions.length} session${r.sessions.length === 1 ? '' : 's'}`
                                : 'Manual record'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtTime(r.checkIn)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtTime(r.checkOut)}</TableCell>
                      <TableCell className="text-sm">{minutesToHours(r.workedMinutes)}</TableCell>
                      <TableCell>
                        <StatusBadge label={ATTENDANCE_STATUS_LABELS[r.status] ?? r.status} tone={ATTENDANCE_STATUS_TONE[r.status] ?? 'outline'} />
                      </TableCell>
                      <TableCell className="hidden max-w-52 truncate text-xs text-muted-foreground md:table-cell">
                        {r.note ? r.note.trim() : '—'}
                      </TableCell>
                    </TableRow>
                    {expandedId === r.id && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30" aria-label={`Session details for ${r.userName}`}>
                        <TableCell colSpan={6} className="p-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {r.userName}&apos;s sessions
                                {r.sessions.length > 0 && (
                                  <> · {minutesToHours(r.workedMinutes ?? 0)} total</>
                                )}
                              </p>
                              {canManage && (
                                <Button variant="outline" size="sm" onClick={() => setManualRow(r)}>
                                  <Pencil className="mr-1.5 size-3.5" aria-hidden /> Adjust day record
                                </Button>
                              )}
                            </div>
                            {r.sessions.length === 0 ? (
                              <p className="rounded-lg border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                                No sessions recorded — this day was set manually or via an approved leave.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {r.sessions.map((s, i) => (
                                  <div key={s.id} className="rounded-lg border bg-card p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                                      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                                        <span className="text-xs font-normal text-muted-foreground">#{i + 1}</span>
                                        <LogIn className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                        <span className="tabular-nums">{fmtTime(s.checkIn)}</span>
                                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                                        {s.checkOut ? (
                                          <>
                                            <LogOut className="size-3.5 shrink-0 text-rose-500" aria-hidden />
                                            <span className="tabular-nums">{fmtTime(s.checkOut)}</span>
                                          </>
                                        ) : (
                                          <OpenSessionBadge />
                                        )}
                                      </p>
                                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                        {s.checkOut && s.minutes != null ? minutesToHours(s.minutes) : 'Running'}
                                      </span>
                                    </div>
                                    {s.entries.length > 0 && (
                                      <div className="mt-2 flex flex-col gap-1.5">
                                        {s.entries.map((e) => (
                                          <p key={e.id} className="flex items-center justify-between gap-4 text-xs">
                                            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                              <CheckSquare className="size-3 shrink-0" aria-hidden />
                                              <span className="truncate">{e.taskTitle ?? 'Untracked time'}</span>
                                            </span>
                                            <span className="shrink-0 font-medium tabular-nums">{minutesToHours(e.minutes)}</span>
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                    {s.note && <p className="mt-2 text-xs text-muted-foreground">{s.note.trim()}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {items.length} record{items.length === 1 ? '' : 's'} for this day
            {canManage ? ' — click a row to review sessions; “Adjust day record” sets or corrects the status manually.' : ' — click a row to review sessions.'}
          </p>
        </Card>
      )}

      {/* Trend chart — only for users with dashboard access */}
      {showTrend && (
        <Card className="py-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Recent attendance trend
            </CardTitle>
            <CardDescription>Daily presence breakdown — present, late, on leave and absent.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {dashData.loading ? (
              <Skeleton className="h-64 w-full" />
            ) : trend.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No trend data yet" description="Attendance history will appear here once people start checking in." />
            ) : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[var(--chart-1)]" aria-hidden />Avg presence <strong className="font-semibold">{avgPresence}%</strong></span>
                  <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[var(--chart-2)]" aria-hidden />Late days <strong className="font-semibold">{trendTotals.late}</strong></span>
                  <span className="text-xs text-muted-foreground">across the last {trend.length} recorded days</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--popover-foreground)' }}
                        formatter={(value: number | string, name: string) => [value, name]}
                      />
                      <Bar dataKey="present" name="Present" stackId="a" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="late" name="Late" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="leave" name="On leave" stackId="a" fill="var(--chart-4)" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="absent" name="Absent" stackId="a" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual status dialog (management only — module FULL) */}
      <ManualAttendanceDialog
        row={manualRow}
        date={dateStr}
        onClose={() => setManualRow(null)}
        onSaved={() => attData.refresh()}
      />
    </div>
  )
}

function ManualAttendanceDialog({
  row, date, onClose, onSaved,
}: {
  row: AttendanceRow | null
  date: string
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  // reset local form state whenever a different row is opened
  const wantedKey = row?.id ?? ''
  if (wantedKey !== key) {
    setKey(wantedKey)
    setStatus(row?.status ?? 'PRESENT')
    setNote(row?.note ?? '')
  }

  async function save() {
    if (!row) return
    setSaving(true)
    try {
      await api('/api/hr/attendance', {
        method: 'POST',
        body: { membershipId: row.membershipId, date, status, note: note || undefined },
      })
      toast({ title: 'Attendance saved', description: `${row.userName} — ${ATTENDANCE_STATUS_LABELS[status] ?? status} on ${fmtDate(date + 'T12:00:00')}.` })
      onSaved()
      onClose()
    } catch {
      // api() toasts the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        {row && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <UserAvatar name={row.userName} avatarUrl={row.userAvatar} size="md" />
                <div>
                  <DialogTitle>{row.userName}</DialogTitle>
                  <DialogDescription>
                    Set attendance manually for {fmtDate(date + 'T12:00:00')} — this upserts the day record.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full" aria-label="Attendance status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="att-note">Note (optional)</Label>
                <Input id="att-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client visit, half-day leave…" />
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {ATTENDANCE_STATUS_LABELS[row.status] ?? row.status}
                {row.checkIn ? ` · checked in ${fmtTime(row.checkIn)}` : ' · no check-in'}
                {row.workedMinutes != null ? ` · worked ${minutesToHours(row.workedMinutes)}` : ''}
                {` · ${row.sessions.length} session${row.sessions.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving || !status}>{saving ? 'Saving…' : 'Save record'}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
