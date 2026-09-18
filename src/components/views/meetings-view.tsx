'use client'

/**
 * Meetings — schedule, run and follow up (module 'meetings', org-scoped).
 * Tabs Upcoming | Past over one GET /api/meetings?scope=all fetch (client-side
 * split by startsAt); 3 stat cards; create/edit dialog (can('meetings') only)
 * with a participant checkbox list from /api/hr/employees (guarded, non-fatal)
 * and projects from /api/projects; detail dialog with editable notes, follow-up
 * task shortcut, edit + delete (server rule: creator or OWNER/ADMIN/HR).
 * VIEW-level users get read-only cards and a read-only detail dialog.
 */

import { useEffect, useMemo, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { toast } from '@/hooks/use-toast'
import { fmtDate, fmtTime, minutesToHours } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { UserAvatar, AvatarStack } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
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
  Video, CalendarClock, Clock, Plus, Pencil, Trash2, ListTodo, CalendarDays, UserRound, Send, History,
} from 'lucide-react'
import type { EmployeeItem, ProjectOption } from './shared/task-detail'
import { cn } from '@/lib/utils'

// ---------- local types (T4-c exact MEETING_ITEM shape) ----------

interface MeetingParticipant {
  id: string // membership id
  name: string
  avatarUrl: string | null
}

interface MeetingItem {
  id: string
  title: string
  startsAt: string // ISO
  durationMins: number
  agenda: string | null
  notes: string | null
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  createdByName: string | null
  participants: MeetingParticipant[]
  participantCount: number
  createdAt: string
}

const DURATIONS = [15, 30, 45, 60, 90, 120] as const

// ---------- date helpers (local-timezone safe) ----------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 'Today' | 'Tomorrow' | 'Yesterday' | 'Mon, 16 Sept' */
function dayLabel(d: Date): string {
  const today = new Date()
  if (sameDay(d, today)) return 'Today'
  const t1 = new Date(today)
  t1.setDate(today.getDate() + 1)
  if (sameDay(d, t1)) return 'Tomorrow'
  const t2 = new Date(today)
  t2.setDate(today.getDate() - 1)
  if (sameDay(d, t2)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** '09:30 AM – 10:15 AM' derived from startsAt + durationMins */
function timeRange(m: MeetingItem): string {
  const start = new Date(m.startsAt)
  const end = new Date(start.getTime() + m.durationMins * 60000)
  return `${fmtTime(start)} – ${fmtTime(end)}`
}

/** Date → value accepted by <Input type="datetime-local"> */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** next full hour (sensible default for a new meeting) */
function nextHour(): Date {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d
}

interface DayGroup {
  key: string
  date: Date
  label: string
  items: MeetingItem[]
}

function groupByDay(items: MeetingItem[]): DayGroup[] {
  const groups: DayGroup[] = []
  const byKey = new Map<string, DayGroup>()
  for (const m of items) {
    const date = new Date(m.startsAt)
    const key = dayKey(date)
    let g = byKey.get(key)
    if (!g) {
      g = { key, date, label: dayLabel(date), items: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.items.push(m)
  }
  return groups
}

// ---------- create / edit dialog ----------

function MeetingsFormDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: MeetingItem | null
  onSaved: (m: MeetingItem, created: boolean) => void
}) {
  const { me } = useWorkspace()
  // picker data — guarded, non-fatal (a failed employee list just narrows the picker)
  const employees = useData<{ items: EmployeeItem[] }>(open ? '/api/hr/employees' : null)
  const projects = useData<{ items: ProjectOption[] }>(open ? '/api/projects' : null)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [duration, setDuration] = useState('30')
  const [projectId, setProjectId] = useState('none')
  const [participants, setParticipants] = useState<string[]>([])
  const [agenda, setAgenda] = useState('')
  const [saving, setSaving] = useState(false)

  // (re)initialise the form each time the dialog opens
  useEffect(() => {
    if (!open) return
    if (editing) {
      setTitle(editing.title)
      setStartsAt(toLocalInput(new Date(editing.startsAt)))
      setDuration(String(editing.durationMins))
      setProjectId(editing.projectId ?? 'none')
      setParticipants(editing.participants.map((p) => p.id))
      setAgenda(editing.agenda ?? '')
    } else {
      setTitle('')
      setStartsAt(toLocalInput(nextHour()))
      setDuration('30')
      setProjectId('none')
      setParticipants([])
      setAgenda('')
    }
  }, [open, editing])

  const valid = title.trim().length > 0 && startsAt !== ''
  const employeeItems = employees.data?.items ?? []
  const projectItems = projects.data?.items ?? []

  function toggleParticipant(id: string, checked: boolean) {
    setParticipants((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  async function submit() {
    if (!valid) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        durationMins: Number(duration) || 30,
      }
      if (projectId !== 'none') body.projectId = projectId
      body.agenda = agenda.trim() || null
      if (participants.length) body.participants = participants
      let saved: MeetingItem
      if (editing) {
        // PATCH replaces the participant set — always send the full selection
        saved = await api<MeetingItem>(`/api/meetings/${editing.id}`, { method: 'PATCH', body })
        toast({ title: 'Meeting updated', description: `“${saved.title}” — ${fmtDate(saved.startsAt)} at ${fmtTime(saved.startsAt)}.` })
        onSaved(saved, false)
      } else {
        saved = await api<MeetingItem>('/api/meetings', { method: 'POST', body })
        toast({ title: 'Meeting scheduled', description: `“${saved.title}” — ${fmtDate(saved.startsAt)} at ${fmtTime(saved.startsAt)}. Participants are notified.` })
        onSaved(saved, true)
      }
      onOpenChange(false)
    } catch {
      // api() toasts the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit meeting' : 'Schedule a meeting'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the details — newly added participants are notified.'
              : 'Invite participants and they get a notification right away.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mt-title">Title</Label>
            <Input
              id="mt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. GreenGrocer weekly sync"
              maxLength={200}
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mt-start">Starts at</Label>
              <Input
                id="mt-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mt-duration">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="mt-duration" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{minutesToHours(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mt-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="mt-project" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projectItems.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color ?? '#10b981' }} aria-hidden />
                      <span className="max-w-56 truncate">{p.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mt-participants" className="flex items-center gap-1.5">
              Participants
              {participants.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {participants.length} selected
                </span>
              )}
            </Label>
            <div id="mt-participants" className="max-h-48 overflow-y-auto rounded-lg border p-1.5">
              {employees.loading ? (
                <div className="flex flex-col gap-2 p-1">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : employees.error ? (
                <p className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
                  <UserRound className="size-3.5" aria-hidden /> Couldn&apos;t load the member list — you can still save without participants.
                </p>
              ) : employeeItems.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No members to invite.</p>
              ) : (
                employeeItems.map((e) => (
                  <label
                    key={e.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={participants.includes(e.id)}
                      onCheckedChange={(c) => toggleParticipant(e.id, c === true)}
                      aria-label={`Invite ${e.name}`}
                    />
                    <UserAvatar name={e.name} avatarUrl={e.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {e.name}
                        {me?.memberships.some((m) => m.id === e.id) && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(you)</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{e.title ?? e.role}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mt-agenda">Agenda</Label>
            <Textarea
              id="mt-agenda"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Topics to cover, decisions needed…"
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!valid || saving}>
            <Send className="mr-1.5 size-4" aria-hidden />
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Schedule meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- meeting card ----------

function MeetingCard({ m, onOpen }: { m: MeetingItem; onOpen: () => void }) {
  const { navigate } = useWorkspace()
  return (
    <Card
      className="cursor-pointer py-0 transition-shadow hover:shadow-md"
      role="button"
      tabIndex={0}
      aria-label={`${m.title}, ${fmtDate(m.startsAt)} ${fmtTime(m.startsAt)}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
    >
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
        <p className="w-36 shrink-0 text-sm font-semibold tabular-nums sm:pt-0.5">{timeRange(m)}</p>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{m.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {m.projectName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate('projects', m.projectId ? { projectId: m.projectId } : undefined)
                }}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
                aria-label={`Open project ${m.projectName}`}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: m.projectColor ?? '#10b981' }} aria-hidden />
                <span className="max-w-40 truncate">{m.projectName}</span>
              </button>
            )}
            <span className="text-[11px] text-muted-foreground">{minutesToHours(m.durationMins)}</span>
            {m.createdByName && (
              <span className="text-[11px] text-muted-foreground">Organized by {m.createdByName}</span>
            )}
          </div>
          {m.agenda && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{m.agenda}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <AvatarStack users={m.participants} size="xs" max={4} />
          {m.participantCount > 4 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{m.participantCount} invited</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- detail dialog ----------

function MeetingDetailDialog({
  meeting, open, onOpenChange, onUpdated, onDeleted, onEdit,
}: {
  meeting: MeetingItem | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onUpdated: (m: MeetingItem) => void
  onDeleted: (id: string) => void
  onEdit: (m: MeetingItem) => void
}) {
  const { can, role, navigate, me } = useWorkspace()
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setNotes(meeting?.notes ?? '')
    setConfirmDelete(false)
  }, [meeting?.id, meeting?.notes, open])

  if (!meeting) return null

  const canManage = can('meetings')
  // server rule: creator or OWNER/ADMIN/HR may delete
  const isCreator = !!meeting.createdByName && meeting.createdByName === me?.user.name
  const canDelete = canManage && (isCreator || ['OWNER', 'ADMIN', 'HR'].includes(role))

  async function saveNotes() {
    if (!meeting) return
    setSavingNotes(true)
    try {
      const updated = await api<MeetingItem>(`/api/meetings/${meeting.id}`, {
        method: 'PATCH', body: { notes: notes.trim() || null },
      })
      toast({ title: 'Notes saved', description: `Meeting notes for “${updated.title}” were updated.` })
      onUpdated(updated)
    } catch {
      // api() toasts
    } finally {
      setSavingNotes(false)
    }
  }

  async function remove() {
    if (!meeting) return
    try {
      await api(`/api/meetings/${meeting.id}`, { method: 'DELETE' })
      toast({ title: 'Meeting deleted', description: `“${meeting.title}” was removed.` })
      onDeleted(meeting.id)
      onOpenChange(false)
    } catch {
      // api() toasts
    }
  }

  const start = new Date(meeting.startsAt)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{meeting.title}</DialogTitle>
          <DialogDescription>
            {dayLabel(start)}, {fmtDate(start)} · {timeRange(meeting)} · {minutesToHours(meeting.durationMins)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {meeting.projectName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: meeting.projectColor ?? '#10b981' }} aria-hidden />
                {meeting.projectName}
              </span>
            )}
            {meeting.createdByName && <span>Organized by {meeting.createdByName}</span>}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</h4>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">
              {meeting.agenda || 'No agenda was provided.'}
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes {canManage && <span className="font-normal normal-case">— decisions and follow-ups</span>}
            </h4>
            {canManage ? (
              <div className="mt-1.5 flex flex-col gap-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Write what was decided and who does what…"
                  rows={4}
                  maxLength={8000}
                  aria-label="Meeting notes"
                />
                <Button className="self-start" onClick={() => void saveNotes()} disabled={savingNotes}>
                  <Pencil className="mr-1.5 size-4" aria-hidden />
                  {savingNotes ? 'Saving…' : 'Save notes'}
                </Button>
              </div>
            ) : (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {meeting.notes || 'No notes yet.'}
              </p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Participants ({meeting.participantCount})
            </h4>
            {meeting.participants.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">No participants were invited.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {meeting.participants.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-2 rounded-full border bg-muted/40 py-1 pl-1 pr-3">
                    <UserAvatar name={p.name} avatarUrl={p.avatarUrl} size="xs" />
                    <span className="max-w-40 truncate text-xs font-medium">{p.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              navigate('my-tasks')
              toast({
                title: 'Create the follow-up task from My Tasks',
                description: `Suggested title: “Follow-up: ${meeting.title}”.`,
              })
            }}
          >
            <ListTodo className="mr-1.5 size-4" aria-hidden /> Create follow-up task
          </Button>
          <div className="flex gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => { onEdit(meeting); onOpenChange(false) }}>
                <Pencil className="mr-1.5 size-4" aria-hidden /> Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1.5 size-4" aria-hidden /> Delete
              </Button>
            )}
          </div>
        </DialogFooter>

        {/* delete confirmation */}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{meeting.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The meeting and its notes are permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remove()} className="bg-destructive text-white hover:bg-destructive/90">
                Delete meeting
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

// ---------- skeleton ----------

function MeetingsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-12 rounded-lg" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
    </div>
  )
}

// ---------- view ----------

export default function MeetingsView() {
  const { can } = useWorkspace()
  const meetings = useData<{ items: MeetingItem[] }>('/api/meetings?scope=all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MeetingItem | null>(null)
  const [detail, setDetail] = useState<MeetingItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const all = meetings.data?.items ?? []
  const now = useMemo(() => Date.now(), [all])

  const upcoming = useMemo(
    () => all.filter((m) => new Date(m.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [all, now],
  )
  const past = useMemo(
    () => all.filter((m) => new Date(m.startsAt).getTime() < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    [all, now],
  )

  const next7 = upcoming.filter((m) => new Date(m.startsAt).getTime() <= now + 7 * 86400000).length
  const hoursScheduled = upcoming.reduce((sum, m) => sum + m.durationMins, 0) / 60
  const loading = meetings.loading && !meetings.data

  function openDetail(m: MeetingItem) {
    setDetail(m)
    setDetailOpen(true)
  }

  function applyUpdated(updated: MeetingItem) {
    meetings.setData((prev) =>
      prev ? { items: prev.items.map((m) => (m.id === updated.id ? updated : m)) } : prev)
    setDetail((d) => (d && d.id === updated.id ? updated : d))
  }

  function handleSaved(m: MeetingItem, created: boolean) {
    if (created) meetings.refresh()
    else applyUpdated(m)
  }

  function handleDeleted(id: string) {
    meetings.setData((prev) => (prev ? { items: prev.items.filter((m) => m.id !== id) } : prev))
    setDetail((d) => (d && d.id === id ? null : d))
  }

  const upcomingGroups = groupByDay(upcoming)
  const pastGroups = groupByDay(past)

  function renderGroups(groups: DayGroup[], isUpcoming: boolean, emptyTitle: string, emptyDescription: string) {
    if (groups.length === 0) {
      return (
        <EmptyState
          icon={Video}
          title={emptyTitle}
          description={emptyDescription}
          action={isUpcoming && can('meetings') ? (
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="mr-1.5 size-4" aria-hidden /> Schedule meeting
            </Button>
          ) : undefined}
        />
      )
    }
    return (
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <h3 className={cn(
                'text-sm font-semibold',
                g.label === 'Today' && 'text-emerald-700 dark:text-emerald-400',
              )}>
                {g.label}
              </h3>
              <span className="text-xs text-muted-foreground">
                {g.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <div className="flex flex-col gap-2.5">
              {g.items.map((m) => <MeetingCard key={m.id} m={m} onOpen={() => openDetail(m)} />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Video}
        title="Meetings"
        description="Schedule, run and follow up on meetings."
        actions={can('meetings') && (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }} aria-label="Schedule a meeting">
            <Plus className="mr-1.5 size-4" aria-hidden /> Schedule meeting
          </Button>
        )}
      />

      {meetings.error && !meetings.data ? (
        <EmptyState
          icon={Video}
          title="Couldn't load meetings"
          description={meetings.error}
          action={<Button variant="outline" onClick={meetings.refresh}>Try again</Button>}
        />
      ) : loading ? (
        <MeetingsSkeleton />
      ) : (
        <>
          {/* stats */}
          <section aria-label="Meeting stats" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Next 7 days"
              value={next7}
              sub={`${upcoming.length} upcoming in total`}
              icon={CalendarClock}
              tone={next7 > 0 ? 'info' : 'default'}
            />
            <StatCard
              label="Hours scheduled"
              value={`${hoursScheduled.toFixed(1)}h`}
              sub="Total duration of upcoming meetings"
              icon={Clock}
            />
            <StatCard
              label="Total meetings"
              value={all.length}
              sub={`${past.length} held so far`}
              icon={Video}
            />
          </section>

          <Tabs defaultValue="upcoming">
            <TabsList className="h-12 w-full justify-start overflow-x-auto p-1 sm:w-auto">
              <TabsTrigger value="upcoming" className="gap-1.5 px-4">
                <CalendarDays className="size-4" aria-hidden /> Upcoming
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{upcoming.length}</span>
              </TabsTrigger>
              <TabsTrigger value="past" className="gap-1.5 px-4">
                <History className="size-4" aria-hidden /> Past
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{past.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4">
              {renderGroups(upcomingGroups, true, 'No upcoming meetings', 'Schedule your first one — invite participants and share the agenda.')}
            </TabsContent>
            <TabsContent value="past" className="mt-4">
              {renderGroups(pastGroups, false, 'No past meetings', 'Meetings you held will appear here with their notes.')}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* create / edit */}
      <MeetingsFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={handleSaved}
      />

      {/* detail */}
      <MeetingDetailDialog
        meeting={detail}
        open={detailOpen && !!detail}
        onOpenChange={setDetailOpen}
        onUpdated={applyUpdated}
        onDeleted={handleDeleted}
        onEdit={(m) => { setEditing(m); setFormOpen(true) }}
      />
    </div>
  )
}
