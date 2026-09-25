'use client'

/**
 * Shared task artifacts for the task views (my-tasks / tasks / project detail).
 * - TaskItem / EmployeeItem / MilestoneLite / ProjectOption types (API shapes from worklog T1-d + T3-d)
 * - TaskKanbanCard: compact kanban card used by every board (dimmed in done columns)
 * - TaskDependencyPicker: multi-select dependency editor (T3-h)
 * - TaskDetailDialog: full task editor (props, dates, dependencies, subtasks, comments, delete)
 */

import { useEffect, useMemo, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { toast } from '@/hooks/use-toast'
import {
  TASK_STATUS_LABELS, TASK_STATUS_TONE, TASK_STATUSES, PRIORITY_LABELS, PRIORITIES,
  dueLabel, relativeTime, csv,
} from '@/lib/format'
import type { BadgeTone } from '@/lib/format'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Pencil, Trash2, Save, X, MessageSquare, Link2, ListChecks, Send, CalendarDays, Tags, Clock,
  Circle, CheckCircle2, User as UserIcon, ChevronsUpDown, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- shared types (worklog T1-d exact shapes + T3-d additions) ----------

export interface TaskItem {
  id: string
  orgId?: string
  projectId: string | null
  milestoneId: string | null
  title: string
  description: string | null
  assigneeMembershipId: string | null
  creatorMembershipId: string | null
  priority: string
  status: string
  startDate: string | null
  dueDate: string | null
  estimatedHours: number | null
  tags: string | null
  parentTaskId: string | null
  completedAt: string | null
  createdAt: string
  project: { id: string; name: string; color: string | null; status: string } | null
  milestone: { id: string; title: string } | null
  assignee: { id: string; user: { id: string; name: string; avatarUrl: string | null } } | null
  assigneeName: string | null
  creatorName: string | null
  /** optional: tasks from GET /api/projects/[id] omit this relation (only _count) */
  subtasks?: Array<{ id: string; title: string; status: string; assigneeName: string | null }>
  subtaskCount: number
  _count: { dependencies: number; comments: number }
  /** T3-d: dependency id+title(+status) lists (present on every task item) */
  dependsOn?: Array<{ id: string; title: string; status?: string; type?: string }>
  dependents?: Array<{ id: string; title: string; status?: string; type?: string }>
}

export interface EmployeeItem {
  id: string // membership id
  name: string
  avatarUrl: string | null
  title: string | null
  role: string
  departmentName: string | null
}

export interface MilestoneLite {
  id: string
  title: string
}

export interface ProjectOption {
  id: string
  name: string
  color: string | null
}

/** dynamic board column option (from GET /api/columns?surface=TASK) */
export interface TaskColumnOption {
  key: string
  label: string
  isDone?: boolean
  isRejected?: boolean
  color?: string | null
}

interface CommentItem {
  id: string
  body: string
  createdAt: string
  authorName: string | null
  author: { id: string; user: { name: string; avatarUrl: string | null } } | null
}

// ---------- helpers ----------

export function isMgr(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER'
}

export function subtaskDoneCount(t: TaskItem): number {
  return (t.subtasks ?? []).filter((s) => s.status === 'DONE').length
}

/** label for a task status — dynamic column label wins, falls back to the static vocabulary */
export function taskStatusLabel(status: string, columns?: TaskColumnOption[]): string {
  return columns?.find((c) => c.key === status)?.label ?? TASK_STATUS_LABELS[status] ?? status
}

/** tone for a task status — known keys keep their tone, custom keys outline, isDone → success */
export function taskStatusTone(status: string, columns?: TaskColumnOption[]): BadgeTone {
  const col = columns?.find((c) => c.key === status)
  if (col?.isDone) return 'success'
  return TASK_STATUS_TONE[status] ?? 'outline'
}

/** whether a status counts as done — dynamic column flag wins, legacy DONE fallback */
export function isDoneColumn(status: string, columns?: TaskColumnOption[]): boolean {
  const col = columns?.find((c) => c.key === status)
  return col ? !!col.isDone : status === 'DONE'
}

function toDateInput(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : ''
}

// ---------- dependency link types ----------

export const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const
export const DEP_TYPE_LABELS: Record<string, string> = {
  FS: 'finish-to-start',
  SS: 'start-to-start',
  FF: 'finish-to-finish',
  SF: 'start-to-finish',
}

/** small mono badge showing a dependency link type (title = full label) */
function DepTypeBadge({ type }: { type: string }) {
  return (
    <span
      className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] font-semibold uppercase text-muted-foreground"
      title={`${type} — ${DEP_TYPE_LABELS[type] ?? type}`}
    >
      {type}
    </span>
  )
}

// ---------- compact kanban card (shared by all boards) ----------

export function TaskKanbanCard({ task, dimmed }: { task: TaskItem; dimmed?: boolean }) {
  const due = dueLabel(task.dueDate)
  const doneSubs = subtaskDoneCount(task)
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md',
        dimmed && 'border-border/60 opacity-60'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 shrink-0"><PriorityDot priority={task.priority} /></span>
        <p className={cn('min-w-0 flex-1 text-sm font-medium leading-snug', dimmed && 'text-muted-foreground line-through')}>{task.title}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        {task.project && (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.project.color ?? '#10b981' }} aria-hidden />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
        {task.milestone && !task.project && (
          <span className="truncate">{task.milestone.title}</span>
        )}
        {task.dueDate && (
          <span className={'inline-flex shrink-0 items-center gap-1' + (due.overdue && !dimmed ? ' font-medium text-rose-600 dark:text-rose-400' : '')}>
            <CalendarDays className="size-3" aria-hidden />
            {due.text}
          </span>
        )}
        {task.subtaskCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <ListChecks className="size-3" aria-hidden />
            {doneSubs}/{task.subtaskCount}
          </span>
        )}
        {task._count.comments > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <MessageSquare className="size-3" aria-hidden />
            {task._count.comments}
          </span>
        )}
        {task._count.dependencies > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <Link2 className="size-3" aria-hidden />
            {task._count.dependencies}
          </span>
        )}
        {task.assigneeName ? (
          <span className={cn('ml-auto shrink-0', dimmed && 'opacity-80')}><UserAvatar name={task.assigneeName} avatarUrl={task.assignee?.user.avatarUrl} size="xs" /></span>
        ) : (
          <span className="ml-auto shrink-0 text-muted-foreground/60"><UserIcon className="size-3.5" aria-hidden /></span>
        )}
      </div>
    </div>
  )
}

// ---------- dependency multi-select (create + edit dialogs) ----------

/**
 * Picks `dependsOn` tasks: combobox listing candidate tasks (project tasks when a
 * projectId is chosen, else all org tasks, limit 200), selected tasks as removable
 * chips with a small "→" prefix. Used by TaskDetailDialog + the create dialogs.
 * When `onTypeChange` is provided, each chip also carries a link-type Select
 * (FS finish-to-start / SS start-to-start / FF finish-to-finish / SF start-to-finish).
 */
export function TaskDependencyPicker({
  projectId, excludeIds, value, onChange, disabled, titleOf, typeOf, onTypeChange,
}: {
  /** when set, candidates come from that project only; otherwise all org tasks */
  projectId?: string | null
  /** ids never offered (the task being edited) */
  excludeIds?: string[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  /** resolves a selected id to a title when the task isn't in the candidate list */
  titleOf?: (id: string) => string | undefined
  /** current link type of a selected dependency (FS by default) */
  typeOf?: (id: string) => string
  /** enables the per-dependency type Select */
  onTypeChange?: (id: string, type: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const path = disabled ? null : (projectId ? `/api/tasks?projectId=${projectId}&limit=200` : '/api/tasks?limit=200')
  const candidatesQ = useData<{ items: TaskItem[] }>(path)
  const candidates = useMemo(
    () => (candidatesQ.data?.items ?? []).filter((t) => !(excludeIds ?? []).includes(t.id)),
    [candidatesQ.data, excludeIds]
  )
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? candidates.filter((t) => t.title.toLowerCase().includes(needle))
    : candidates

  function resolveTitle(id: string): string | undefined {
    return candidates.find((c) => c.id === id)?.title ?? titleOf?.(id)
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between font-normal"
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{candidatesQ.loading ? 'Loading tasks…' : 'Add dependency…'}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search tasks by title…" value={q} onValueChange={setQ} />
            <CommandList>
              <CommandEmpty>{candidatesQ.loading ? 'Loading…' : 'No tasks found.'}</CommandEmpty>
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((t) => {
                    const selected = value.includes(t.id)
                    return (
                      <CommandItem
                        key={t.id}
                        value={t.id}
                        onSelect={() => toggle(t.id)}
                        aria-selected={selected}
                      >
                        <span className={cn('mr-1 flex size-4 items-center justify-center', !selected && 'opacity-0')}>
                          <span className="flex size-3.5 items-center justify-center rounded border">
                            {selected && <span className="size-2 rounded-[2px] bg-emerald-600 dark:bg-emerald-400" aria-hidden />}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t.project && <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{t.project.name}</span>}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const title = resolveTitle(id)
            return (
              <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                <span className="shrink-0 text-muted-foreground" aria-hidden>→</span>
                <span className="truncate">{title ?? 'Task'}</span>
                {onTypeChange && (
                  <Select value={typeOf?.(id) ?? 'FS'} onValueChange={(t) => onTypeChange(id, t)}>
                    <SelectTrigger
                      className="h-6 w-[70px] gap-0.5 px-1.5 text-[10px]"
                      aria-label={`Link type for ${title ?? 'dependency'}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t} · {DEP_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  disabled={disabled}
                  aria-label={`Remove dependency ${title ?? id}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">This task starts as soon as its dependencies complete.</p>
      )}
    </div>
  )
}

// ---------- task detail dialog ----------

export interface TaskDetailDialogProps {
  task: TaskItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** called with every PATCH result — parents apply it to their lists */
  onUpdated: (updated: TaskItem) => void
  /** called after a successful delete */
  onDeleted?: (id: string) => void
  employees?: EmployeeItem[]
  projects?: ProjectOption[]
  /** milestone options — only provided from project detail context */
  milestones?: MilestoneLite[]
  /** dynamic board columns (surface TASK) — status Select + badge labels/tones */
  columns?: TaskColumnOption[]
}

export function TaskDetailDialog({
  task, open, onOpenChange, onUpdated, onDeleted, employees, milestones, projects, columns,
}: TaskDetailDialogProps) {
  const { membership, role } = useWorkspace()
  const [local, setLocal] = useState<TaskItem | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [form, setForm] = useState({
    status: '', priority: '', assignee: 'none', milestone: 'none', project: 'none',
    start: '', due: '', est: '', tags: '', deps: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  /** per-dependency link-type overrides chosen in this dialog (graph/FS fallback) */
  const [depTypes, setDepTypes] = useState<Record<string, string>>({})

  const comments = useData<{ items: CommentItem[] }>(
    open && task ? `/api/tasks/${task.id}/comments` : null
  )
  // dependency graph slice — the authoritative link types (FS/SS/FF/SF) + badges
  const depGraph = useData<{
    dependencies: Array<{ dependsOnTaskId: string; type: string }>
    dependents: Array<{ taskId: string; type: string }>
  }>(open && task ? `/api/tasks/${task.id}/dependencies` : null)

  // sync local state when the dialog opens for a task
  const syncId = open ? task?.id : null
  useEffect(() => {
    if (task && open) {
      setLocal(task)
      setTitleDraft(task.title)
      setDescDraft(task.description ?? '')
      setForm({
        status: task.status,
        priority: task.priority,
        assignee: task.assigneeMembershipId ?? 'none',
        milestone: task.milestoneId ?? 'none',
        project: task.projectId ?? 'none',
        start: toDateInput(task.startDate),
        due: toDateInput(task.dueDate),
        est: task.estimatedHours != null ? String(task.estimatedHours) : '',
        tags: task.tags ?? '',
        deps: (task.dependsOn ?? []).map((d) => d.id),
      })
      setEditingTitle(false)
      setEditingDesc(false)
      setDepTypes({})
    }
  }, [syncId, open])

  const t = local ?? task
  const subs = t?.subtasks ?? []
  const canEdit = !!t && (isMgr(role) || t.creatorMembershipId === membership?.id || t.assigneeMembershipId === membership?.id)
  const projectColor = t?.project?.color ?? '#10b981'
  const projOption = projects?.find((p) => p.id === t?.projectId)
  const depTitleOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of t?.dependsOn ?? []) m.set(d.id, d.title)
    for (const d of t?.dependents ?? []) m.set(d.id, d.title)
    return (id: string) => m.get(id)
  }, [t?.dependsOn, t?.dependents])
  /** unfinished dependencies — this task cannot start until they are done */
  const openBlockers = (t?.dependsOn ?? []).filter((d) => !isDoneColumn(d.status ?? '', columns)).length
  /** link type of a dependsOn id: explicit dialog choice → graph → FS */
  const graphDepTypes = useMemo(
    () => new Map((depGraph.data?.dependencies ?? []).map((d) => [d.dependsOnTaskId, d.type])),
    [depGraph.data]
  )
  const graphDependentTypes = useMemo(
    () => new Map((depGraph.data?.dependents ?? []).map((d) => [d.taskId, d.type])),
    [depGraph.data]
  )
  const depTypeOf = (id: string): string => depTypes[id] ?? graphDepTypes.get(id) ?? 'FS'

  async function patch(body: Record<string, unknown>, successMsg?: string): Promise<TaskItem | null> {
    if (!t) return null
    setSaving(true)
    try {
      const updated = await api<TaskItem>(`/api/tasks/${t.id}`, { method: 'PATCH', body })
      setLocal(updated)
      onUpdated(updated)
      if (successMsg) toast({ title: successMsg })
      return updated
    } catch {
      return null
    } finally {
      setSaving(false)
    }
  }

  async function toggleSubtask(sub: { id: string; title: string; status: string }) {
    if (!t) return
    const next = sub.status === 'DONE' ? 'TODO' : 'DONE'
    try {
      const updated = await api<TaskItem>(`/api/tasks/${sub.id}`, { method: 'PATCH', body: { status: next } })
      // the response is the subtask itself — merge it into the parent's checklist locally
      setLocal((prev) => prev && prev.id === t.id
        ? { ...prev, subtasks: (prev.subtasks ?? []).map((s) => (s.id === sub.id ? { ...s, status: updated.status } : s)) }
        : prev)
      onUpdated(updated)
    } catch { /* api() toasts */ }
  }

  async function saveProperties() {
    if (!t) return
    const body: Record<string, unknown> = {
      status: form.status,
      priority: form.priority,
      assigneeMembershipId: form.assignee === 'none' ? null : form.assignee,
      milestoneId: form.milestone === 'none' ? null : form.milestone,
      tags: form.tags.trim() || null,
    }
    // moving the task to another project (or out to internal) — the milestone
    // resets with the move (milestones belong to a single project)
    const projectChanged = form.project !== (t.projectId ?? 'none')
    if (projectChanged) {
      body.projectId = form.project === 'none' ? null : form.project
      body.milestoneId = null
    }
    if (form.due !== toDateInput(t.dueDate)) body.dueDate = form.due || null
    if (form.start !== toDateInput(t.startDate)) body.startDate = form.start || null
    if (form.est !== (t.estimatedHours != null ? String(t.estimatedHours) : '')) {
      body.estimatedHours = form.est === '' ? null : Number(form.est)
    }
    const currentDeps = (t.dependsOn ?? []).map((d) => d.id)
    const typesChanged = form.deps.some((id) => depTypeOf(id) !== (graphDepTypes.get(id) ?? 'FS'))
    if (form.deps.join('\u0000') !== currentDeps.join('\u0000') || typesChanged) {
      // typed dependency set — { id, type } entries (FS default) replace the links
      body.dependsOnTaskIds = form.deps.map((id) => ({ id, type: depTypeOf(id) }))
    }
    const updated = await patch(body, projectChanged ? 'Task moved' : 'Task updated')
    if (updated) {
      if (projectChanged) setForm((f) => ({ ...f, milestone: 'none' }))
      if (body.dependsOnTaskIds !== undefined) depGraph.refresh() // badges/types stay in sync
    }
  }

  async function postComment() {
    if (!t || !comment.trim()) return
    setPosting(true)
    try {
      await api(`/api/tasks/${t.id}/comments`, { method: 'POST', body: { body: comment.trim() } })
      setComment('')
      comments.refresh()
    } catch { /* api() toasts */ } finally {
      setPosting(false)
    }
  }

  async function deleteTask() {
    if (!t) return
    const taskRef = t
    try {
      await api(`/api/tasks/${taskRef.id}`, { method: 'DELETE' })
      // M15-fe: undo toast — soft-delete allows restore within 5s
      toast({
        title: 'Task deleted',
        description: `"${taskRef.title}" was removed`,
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            api(`/api/tasks/${taskRef.id}/restore`, { method: 'POST', silent: true })
              .then(() => { toast({ title: 'Task restored' }); onDeleted?.(taskRef.id) })
              .catch(() => toast({ title: 'Could not restore', variant: 'destructive' }))
          },
        },
      })
      onDeleted?.(taskRef.id)
      onOpenChange(false)
    } catch { /* api() toasts */ }
  }

  if (!t) return null
  const due = dueLabel(t.dueDate)
  const statusOptions: TaskColumnOption[] = columns?.length
    ? columns
    : TASK_STATUSES.map((s) => ({ key: s, label: TASK_STATUS_LABELS[s] }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogDescription className="sr-only">
          Task details — properties, dependencies, subtasks and comments.
        </DialogDescription>
        {/* header */}
        <DialogHeader className="space-y-2 border-b p-4 sm:p-6">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 shrink-0"><PriorityDot priority={t.priority} /></span>
            {editingTitle ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-9"
                  aria-label="Task title"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="size-9 shrink-0" disabled={saving || !titleDraft.trim()}
                  onClick={async () => {
                    if (titleDraft.trim() && titleDraft.trim() !== t.title) await patch({ title: titleDraft.trim() }, 'Title updated')
                    setEditingTitle(false)
                  }}>
                  <Save className="size-4" aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => { setEditingTitle(false); setTitleDraft(t.title) }}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-1">
                <DialogTitle className="min-w-0 flex-1 text-left text-lg font-semibold leading-snug">{t.title}</DialogTitle>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setEditingTitle(true)} aria-label="Edit title">
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={taskStatusLabel(t.status, columns)} tone={taskStatusTone(t.status, columns)} />
            {t.project && (
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: projectColor }} aria-hidden />
                {projOption ? projOption.name : t.project.name}
              </span>
            )}
            {t.milestone && (
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                <ListChecks className="size-3" aria-hidden /> {t.milestone.title}
              </span>
            )}
            <span className="text-xs text-muted-foreground">by {t.creatorName ?? '—'} · {relativeTime(t.createdAt)}</span>
          </div>
        </DialogHeader>

        {/* body */}
        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[1fr_260px]">
          {/* left column */}
          <div className="order-2 flex min-w-0 flex-col gap-4 md:order-1">
            {/* description */}
            <Card className="py-0">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Description</CardTitle>
                {canEdit && !editingDesc && (
                  <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => { setEditingDesc(true); setDescDraft(t.description ?? '') }}>
                    <Pencil className="size-3.5" aria-hidden /> Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pb-4">
                {editingDesc ? (
                  <div className="flex flex-col gap-2">
                    <Textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={5} placeholder="Add a description…" aria-label="Task description" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9" disabled={saving}
                        onClick={async () => { await patch({ description: descDraft.trim() || null }, 'Description updated'); setEditingDesc(false) }}>
                        <Save className="mr-1.5 size-3.5" aria-hidden /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditingDesc(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : t.description ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.description}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No description yet.</p>
                )}
              </CardContent>
            </Card>

            {/* subtasks checklist */}
            {subs.length > 0 && (
              <Card className="py-0">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <ListChecks className="size-4 text-muted-foreground" aria-hidden />
                    Subtasks ({subtaskDoneCount(t)}/{Math.max(t.subtaskCount, subs.length)})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <ul className="flex flex-col gap-1.5">
                    {subs.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSubtask(s)}
                          className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                          aria-label={s.status === 'DONE' ? 'Mark subtask as open' : 'Mark subtask done'}
                        >
                          {s.status === 'DONE'
                            ? <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={'truncate text-sm' + (s.status === 'DONE' ? ' text-muted-foreground line-through' : '')}>{s.title}</p>
                          {s.assigneeName && <p className="truncate text-[11px] text-muted-foreground">{s.assigneeName}</p>}
                        </div>
                        <StatusBadge label={taskStatusLabel(s.status, columns)} tone={taskStatusTone(s.status, columns)} className="hidden shrink-0 sm:inline-flex" />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* dependencies (depends on / blocks) — open blockers highlighted */}
            {((t.dependsOn?.length ?? 0) > 0 || (t.dependents?.length ?? 0) > 0) && (
              <Card className="py-0">
                <CardContent className="flex flex-col gap-3 pb-4 pt-4">
                  {(t.dependsOn?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Link2 className="size-3.5" aria-hidden /> Depends on
                        {openBlockers > 0 && (
                          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {openBlockers} open — this task is blocked
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.dependsOn!.map((d) => {
                          const depDone = d.status ? isDoneColumn(d.status, columns) : false
                          const linkType = d.type ?? graphDepTypes.get(d.id) ?? 'FS'
                          return (
                            <span
                              key={d.id}
                              title={`${linkType} — ${DEP_TYPE_LABELS[linkType] ?? linkType}`}
                              className={'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] ' + (depDone ? 'bg-emerald-600/10 border-emerald-600/20' : 'bg-amber-500/10 border-amber-500/25')}
                            >
                              <span className="shrink-0 text-muted-foreground" aria-hidden>→</span>
                              <span className="truncate">{d.title}</span>
                              <DepTypeBadge type={linkType} />
                              {depDone
                                ? <CheckCircle2 className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                : <Circle className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {(t.dependents?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Play className="size-3.5" aria-hidden /> Blocks
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.dependents!.map((d) => {
                          const depDone = d.status ? isDoneColumn(d.status, columns) : false
                          const linkType = d.type ?? graphDependentTypes.get(d.id) ?? 'FS'
                          return (
                            <span key={d.id} title={`${linkType} — ${DEP_TYPE_LABELS[linkType] ?? linkType}`} className={'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] ' + (depDone ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400 border-amber-500/25 bg-amber-500/15')}>
                              <span className="shrink-0" aria-hidden>←</span>
                              <span className="truncate">{d.title}</span>
                              <DepTypeBadge type={linkType} />
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* meta chips */}
            {(t.estimatedHours != null || t.completedAt || t.startDate) && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {t.startDate && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1">
                    <Play className="size-3.5" aria-hidden />{' '}
                    {new Date(t.startDate).getTime() > Date.now() ? 'Starts' : 'Started'} {relativeTime(t.startDate)}
                  </span>
                )}
                {t.estimatedHours != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1">
                    <Clock className="size-3.5" aria-hidden /> {t.estimatedHours}h estimated
                  </span>
                )}
                {t.completedAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-emerald-600/15 px-2 py-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Completed {relativeTime(t.completedAt)}
                  </span>
                )}
              </div>
            )}

            {/* comments */}
            <Card className="py-0">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
                  Comments
                  {comments.data?.items.length ? <span className="text-muted-foreground">({comments.data.items.length})</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
                  {comments.loading && !comments.data ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Loading comments…</p>
                  ) : comments.data && comments.data.items.length > 0 ? (
                    comments.data.items.map((c) => (
                      <div key={c.id} className="flex gap-2.5">
                        <UserAvatar name={c.authorName} avatarUrl={c.author?.user.avatarUrl} size="sm" className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 px-3 py-2">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <p className="text-xs font-semibold">{c.authorName ?? 'Unknown'}</p>
                            <p className="text-[11px] text-muted-foreground">{relativeTime(c.createdAt)}</p>
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">No comments yet — start the conversation.</p>
                  )}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    placeholder="Write a comment…"
                    aria-label="New comment"
                    className="min-h-11"
                  />
                  <Button className="h-11 shrink-0" disabled={posting || !comment.trim()} onClick={postComment} aria-label="Post comment">
                    <Send className="size-4" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* right column — properties */}
          <div className="order-1 flex flex-col gap-3 md:order-2">
            <Card className="py-0">
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm font-medium">Properties</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pb-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-status" className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))} disabled={!canEdit || saving}>
                    <SelectTrigger id="td-status" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-priority" className="text-xs">Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))} disabled={!canEdit || saving}>
                    <SelectTrigger id="td-priority" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className="inline-flex items-center gap-2"><PriorityDot priority={p} /> {PRIORITY_LABELS[p]}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-assignee" className="text-xs">Assignee</Label>
                  <Select value={form.assignee} onValueChange={(v) => setForm((f) => ({ ...f, assignee: v }))} disabled={!canEdit || saving || !employees}>
                    <SelectTrigger id="td-assignee" className="h-11 w-full">
                      <SelectValue placeholder={t.assigneeName ?? 'Unassigned'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(employees ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* project selector — only in org-wide task contexts (project detail passes a single project) */}
                {canEdit && projects && projects.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="td-project" className="text-xs">Project</Label>
                    <Select
                      value={form.project}
                      onValueChange={(v) => setForm((f) => ({ ...f, project: v, milestone: 'none' }))}
                      disabled={!canEdit || saving}
                    >
                      <SelectTrigger id="td-project" className="h-11 w-full">
                        <SelectValue placeholder="No project (internal)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No project (internal)</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.project !== (t.projectId ?? 'none') && (
                      <p className="text-[11px] text-muted-foreground">
                        Saving moves the task — its milestone resets (milestones belong to one project) and both projects' progress is recalculated.
                      </p>
                    )}
                  </div>
                )}
                {milestones && milestones.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="td-milestone" className="text-xs">Milestone</Label>
                    <Select value={form.milestone} onValueChange={(v) => setForm((f) => ({ ...f, milestone: v }))} disabled={!canEdit || saving}>
                      <SelectTrigger id="td-milestone" className="h-11 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {milestones.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-start" className="text-xs">Start date</Label>
                  <Input id="td-start" type="date" value={form.start} className="h-11"
                    max={form.due || undefined}
                    onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} disabled={!canEdit || saving} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-due" className="text-xs">Due date</Label>
                  <Input id="td-due" type="date" value={form.due} className="h-11"
                    min={form.start || undefined}
                    onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} disabled={!canEdit || saving} />
                  {t.dueDate && (
                    <p className={'text-[11px]' + (due.overdue ? ' font-medium text-rose-600 dark:text-rose-400' : ' text-muted-foreground')}>{due.text}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-est" className="text-xs">Estimated hours</Label>
                  <Input id="td-est" type="number" min="0.5" max="999" step="0.5" value={form.est} className="h-11"
                    onChange={(e) => setForm((f) => ({ ...f, est: e.target.value }))} disabled={!canEdit || saving} placeholder="—" />
                </div>
                {canEdit && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="td-deps" className="flex items-center gap-1.5 text-xs">
                      <Link2 className="size-3.5" aria-hidden /> Dependencies
                    </Label>
                    <TaskDependencyPicker
                      projectId={t.projectId}
                      excludeIds={[t.id]}
                      value={form.deps}
                      onChange={(deps) => setForm((f) => ({ ...f, deps }))}
                      disabled={saving}
                      titleOf={depTitleOf}
                      typeOf={depTypeOf}
                      onTypeChange={(id, type) => setDepTypes((prev) => ({ ...prev, [id]: type }))}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td-tags" className="flex items-center gap-1.5 text-xs"><Tags className="size-3.5" aria-hidden /> Tags</Label>
                  <Input id="td-tags" value={form.tags} className="h-11" placeholder="comma,separated"
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} disabled={!canEdit || saving} />
                  {csv(t.tags).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {csv(t.tags).map((tag) => (
                        <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <Button className="h-11 w-full" disabled={saving} onClick={saveProperties}>
                    <Save className="mr-2 size-4" aria-hidden /> {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* assignee summary + delete */}
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-3">
              {t.assigneeName ? (
                <>
                  <UserAvatar name={t.assigneeName} avatarUrl={t.assignee?.user.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.assigneeName}</p>
                    <p className="text-[11px] text-muted-foreground">Assigned</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted"><UserIcon className="size-4 text-muted-foreground" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Unassigned</p>
                    <p className="text-[11px] text-muted-foreground">Nobody owns this task</p>
                  </div>
                </>
              )}
            </div>

            {canEdit && (
              <>
                <Separator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="h-11 w-full gap-2 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400">
                      <Trash2 className="size-4" aria-hidden /> Delete task
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &quot;{t.title}&quot; will be permanently removed, along with its comments. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                      <AlertDialogAction className="h-11 bg-rose-600 hover:bg-rose-700" onClick={deleteTask}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-4 pb-4 pt-3 sm:px-6">
          <DialogDescription className="text-[11px]">
            Task created {relativeTime(t.createdAt)}{t.parentTaskId ? ' · subtask' : ''}
          </DialogDescription>
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
