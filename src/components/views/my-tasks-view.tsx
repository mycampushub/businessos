'use client'

/**
 * My Tasks — personal workspace. Everything assigned to the current user
 * across all projects: stat cards, a dynamic kanban board (columns from
 * /api/columns?surface=TASK — drag = status PATCH), column CRUD for
 * OWNER/ADMIN/MANAGER, recently-completed (status ∈ done columns) +
 * no-due-date backlog lists, quick task creation with dates, estimates
 * and dependencies.
 */

import { useMemo, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { toast } from '@/hooks/use-toast'
import { TASK_STATUS_LABELS, PRIORITY_LABELS, PRIORITIES, dueLabel, relativeTime } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { KanbanBoard, type KanbanColumnDef } from '@/components/app/kanban'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ListChecks, CheckCircle2, CalendarDays, AlertTriangle, Plus, ClipboardList, Inbox, Flame,
} from 'lucide-react'
import {
  TaskDetailDialog, TaskDependencyPicker, TaskKanbanCard, isMgr,
  type TaskItem, type EmployeeItem, type ProjectOption, type TaskColumnOption,
} from './shared/task-detail'
import { AddColumnDialog, ColumnMenu, type CrudColumn } from './shared/board-column-crud'

interface ColumnItem {
  id: string
  surface: string
  key: string
  label: string
  order: number
  isDone: boolean
  isRejected: boolean
  color: string | null
}

const COLUMN_CRUD_LABELS = {
  boardName: 'column',
  noun: 'card',
  done: 'Done column',
  addTitle: 'Add column',
} as const

function isDueThisWeek(t: TaskItem, doneKeys: Set<string>): boolean {
  if (!t.dueDate || doneKeys.has(t.status)) return false
  const due = new Date(t.dueDate).getTime()
  const now = Date.now()
  return due >= now && due <= now + 7 * 86400000
}

export default function MyTasksView() {
  const { me, role } = useWorkspace()
  // ALL tasks assigned to me (open + completed) — the board filters by dynamic done columns
  const mine = useData<{ items: TaskItem[] }>('/api/tasks?assignee=me&limit=1000')
  const columns = useData<{ items: ColumnItem[] }>('/api/columns?surface=TASK')
  const employees = useData<{ items: EmployeeItem[] }>('/api/hr/employees')
  const projects = useData<{ items: ProjectOption[] }>('/api/projects')

  const [createOpen, setCreateOpen] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '', projectId: 'none', dueDate: '', startDate: '', priority: 'MEDIUM',
    description: '', est: '', deps: [] as string[],
  })

  const [detailOpen, setDetailOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<TaskItem | null>(null)

  const allItems = mine.data?.items ?? []
  const colItems = columns.data?.items ?? []
  // graceful fallback when the column list is unavailable: derive boards from the data itself
  const effectiveColumns: TaskColumnOption[] = useMemo(() => {
    if (colItems.length) return colItems.map((c) => ({ key: c.key, label: c.label, isDone: c.isDone, isRejected: c.isRejected, color: c.color }))
    if (columns.error && allItems.length) {
      return [...new Set(allItems.map((t) => t.status))].map((key) => ({ key, label: TASK_STATUS_LABELS[key] ?? key, isDone: false }))
    }
    return []
  }, [colItems, columns.error, allItems])
  const doneKeys = useMemo(() => new Set(effectiveColumns.filter((c) => c.isDone).map((c) => c.key)), [effectiveColumns])

  const items = useMemo(() => allItems.filter((t) => !doneKeys.has(t.status)), [allItems, doneKeys])
  const doneItems = useMemo(
    () => allItems.filter((t) => doneKeys.has(t.status)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [allItems, doneKeys]
  )
  const noDue = items.filter((t) => !t.dueDate)

  const stats = {
    inProgress: items.filter((t) => t.status === 'IN_PROGRESS').length,
    dueThisWeek: items.filter((t) => isDueThisWeek(t, doneKeys)).length,
    overdue: items.filter((t) => !doneKeys.has(t.status) && dueLabel(t.dueDate).overdue).length,
  }
  const loading = (mine.loading && !mine.data) || (columns.loading && !columns.data && !columns.error)

  // ---------- board columns + CRUD affordances ----------

  const boardColumns: KanbanColumnDef[] = effectiveColumns.map((c) => ({
    id: c.key, title: c.label, color: c.color, isDone: c.isDone, isRejected: c.isRejected,
  }))
  const canManageColumns = isMgr(role)

  async function refreshBoard() {
    columns.refresh()
    mine.refresh()
  }

  function crudColumns(): CrudColumn[] {
    const counts = new Map<string, number>()
    for (const t of allItems) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
    const src: TaskColumnOption[] = colItems.length
      ? colItems.map((c) => ({ key: c.key, label: c.label, isDone: c.isDone, isRejected: c.isRejected, color: c.color }))
      : effectiveColumns
    return src.map((c, i) => ({
      id: colItems.length ? colItems[i].id : c.key,
      key: c.key,
      title: c.label,
      color: c.color ?? null,
      isDone: c.isDone,
      isRejected: c.isRejected,
      cardCount: counts.get(c.key) ?? 0,
    }))
  }

  const crudHandlers = {
    rename: async (col: CrudColumn, label: string) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { label } })
      toast({ title: 'Column renamed', description: `Now called “${label}”.` })
      void refreshBoard()
    },
    recolor: async (col: CrudColumn, color: string | null) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { color } })
      toast({ title: 'Column color updated' })
      columns.refresh()
    },
    move: async (col: CrudColumn, direction: 'left' | 'right') => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { direction } })
      void refreshBoard()
    },
    toggleDone: async (col: CrudColumn, next: boolean) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { isDone: next } })
      toast({ title: next ? 'Done column enabled' : 'Done column disabled', description: `“${col.title}” ${next ? 'now counts as completed' : 'no longer counts as completed'}.` })
      void refreshBoard()
    },
    delete: async (col: CrudColumn, moveToId: string) => {
      const res = await api<{ moved: number }>(`/api/columns/${col.id}?moveTo=${moveToId}`, { method: 'DELETE' })
      toast({ title: `Column deleted — ${res.moved} card${res.moved === 1 ? '' : 's'} moved` })
      void refreshBoard()
    },
  }

  const addColumn = async (draft: { label: string; color: string | null; isDone: boolean; isRejected: boolean }) => {
    await api('/api/columns', {
      method: 'POST',
      body: { surface: 'TASK', label: draft.label, color: draft.color, isDone: draft.isDone },
    })
    toast({ title: 'Column added', description: `“${draft.label}” is at the end of the board.` })
    void refreshBoard()
  }

  // ---------- task actions ----------

  function openDetail(task: TaskItem) {
    setDialogTask(task)
    setDetailOpen(true)
  }

  function applyUpdate(updated: TaskItem) {
    mine.setData((prev) => prev
      ? { items: prev.items.map((t) => {
          if (t.id === updated.id) return updated
          if ((t.subtasks ?? []).some((s) => s.id === updated.id)) {
            return { ...t, subtasks: (t.subtasks ?? []).map((s) => (s.id === updated.id ? { ...s, status: updated.status } : s)) }
          }
          return t
        }) }
      : prev)
    setDialogTask((prev) => (prev && prev.id === updated.id ? updated : prev))
  }

  function handleDeleted(id: string) {
    mine.setData((prev) => (prev ? { items: prev.items.filter((t) => t.id !== id) } : prev))
    setDialogTask((prev) => (prev && prev.id === id ? null : prev))
  }

  async function moveTask(task: TaskItem, status: string) {
    try {
      const updated = await api<TaskItem>(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status } })
      applyUpdate(updated)
      toast({ title: 'Task moved', description: `"${task.title}" → ${effectiveColumns.find((c) => c.key === status)?.label ?? status}` })
    } catch {
      mine.refresh() // revert layout on failure
    }
  }

  async function createTask() {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const created = await api<TaskItem>('/api/tasks', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          projectId: form.projectId !== 'none' ? form.projectId : undefined,
          dueDate: form.dueDate || undefined,
          startDate: form.startDate || undefined,
          estimatedHours: form.est ? Number(form.est) : undefined,
          dependsOnTaskIds: form.deps.length ? form.deps : undefined,
          priority: form.priority,
        },
      })
      toast({ title: 'Task created', description: `"${created.title}" added to your board` })
      setCreateOpen(false)
      setForm({ title: '', projectId: 'none', dueDate: '', startDate: '', priority: 'MEDIUM', description: '', est: '', deps: [] })
      mine.refresh()
    } catch { /* api() toasts */ } finally {
      setCreating(false)
    }
  }

  const crudCols = crudColumns()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Tasks"
        description="Everything assigned to you across all projects"
        icon={ClipboardList}
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 gap-2">
                <Plus className="size-4" aria-hidden /> New task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New task</DialogTitle>
                <DialogDescription>A quick personal task — you&apos;ll be the assignee.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-title">Title *</Label>
                  <Input id="mt-title" value={form.title} className="h-11"
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" autoFocus />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="mt-project">Project</Label>
                    <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v, deps: [] }))}>
                      <SelectTrigger id="mt-project" className="h-11 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No project</SelectItem>
                        {(projects.data?.items ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="inline-flex items-center gap-2">
                              <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color ?? '#10b981' }} aria-hidden />
                              {p.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="mt-priority">Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                      <SelectTrigger id="mt-priority" className="h-11 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            <span className="inline-flex items-center gap-2"><PriorityDot priority={p} /> {PRIORITY_LABELS[p]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="mt-start">Start date</Label>
                    <Input id="mt-start" type="date" value={form.startDate} className="h-11"
                      max={form.dueDate || undefined}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="mt-due">Due date</Label>
                    <Input id="mt-due" type="date" value={form.dueDate} className="h-11"
                      min={form.startDate || undefined}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="mt-est">Est. hours</Label>
                    <Input id="mt-est" type="number" min="0.5" max="999" step="0.5" value={form.est} className="h-11"
                      placeholder="—" onChange={(e) => setForm((f) => ({ ...f, est: e.target.value }))} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-deps">Dependencies</Label>
                  <TaskDependencyPicker
                    projectId={form.projectId !== 'none' ? form.projectId : null}
                    value={form.deps}
                    onChange={(deps) => setForm((f) => ({ ...f, deps }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-desc">Description</Label>
                  <Textarea id="mt-desc" value={form.description} rows={3}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional details…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" className="h-11" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button className="h-11" disabled={creating || !form.title.trim()} onClick={createTask}>
                  {creating ? 'Creating…' : 'Create task'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="In Progress" value={stats.inProgress} icon={ListChecks} tone="info" loading={loading}
          sub={`${items.length} open task${items.length === 1 ? '' : 's'} assigned to you`} />
        <StatCard label="Due This Week" value={stats.dueThisWeek} icon={CalendarDays} tone="warning" loading={loading}
          sub="next 7 days" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone="danger" loading={loading}
          sub={stats.overdue ? 'needs attention' : 'all clear'} />
      </div>

      {/* kanban */}
      <section aria-label="Task board" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Board</h2>
        {loading ? (
          <div className="flex gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : boardColumns.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No board columns yet"
            description="An OWNER/ADMIN/MANAGER can add columns from the tasks board."
          />
        ) : items.length === 0 && doneItems.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No tasks assigned to you"
            description="Enjoy the calm — or create a personal task to get moving."
            action={
              <Button className="h-11 gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" aria-hidden /> New task
              </Button>
            }
          />
        ) : (
          <KanbanBoard
            columns={boardColumns}
            items={allItems}
            columnOf={(t) => t.status}
            onMove={moveTask}
            renderCard={(t) => <TaskKanbanCard task={t} dimmed={doneKeys.has(t.status)} />}
            onCardClick={openDetail}
            renderColumnMenu={
              canManageColumns
                ? (col) => {
                    const idx = effectiveColumns.findIndex((c) => c.key === col.id)
                    const crud = crudCols.find((c) => c.key === col.id)
                    if (!crud) return null
                    return (
                      <ColumnMenu
                        col={crud}
                        siblings={crudCols}
                        isFirst={idx <= 0}
                        isLast={idx >= crudCols.length - 1}
                        isOnly={crudCols.length <= 1}
                        labels={COLUMN_CRUD_LABELS}
                        handlers={crudHandlers}
                      />
                    )
                  }
                : undefined
            }
            onAddColumn={canManageColumns ? () => setAddColumnOpen(true) : undefined}
          />
        )}
      </section>

      {/* completed + backlog */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="py-0">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Recently completed
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{doneItems.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {mine.loading && !mine.data ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
              </div>
            ) : doneItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nothing completed yet — drag a card to a done column.</p>
            ) : (
              <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
                {doneItems.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openDetail(t)}
                      className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-muted-foreground line-through">{t.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {t.project?.name ?? 'No project'} · {t.completedAt ? relativeTime(t.completedAt) : 'recently'}
                        </span>
                      </span>
                      <StatusBadge
                        label={effectiveColumns.find((c) => c.key === t.status)?.label ?? 'Done'}
                        tone="success"
                        className="hidden shrink-0 sm:inline-flex"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
              No due date
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{noDue.length}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">Backlog — give these a deadline.</p>
          </CardHeader>
          <CardContent className="pb-4">
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
              </div>
            ) : noDue.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Every task has a due date. Impressive.</p>
            ) : (
              <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
                {noDue.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openDetail(t)}
                      className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50">
                      <span className="shrink-0"><PriorityDot priority={t.priority} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{t.project?.name ?? 'No project'}</span>
                      </span>
                      {t.priority === 'URGENT' && <Flame className="size-4 shrink-0 text-rose-500" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <TaskDetailDialog
        task={dialogTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={applyUpdate}
        onDeleted={handleDeleted}
        employees={employees.data?.items}
        projects={projects.data?.items}
        columns={effectiveColumns}
      />

      {/* add column dialog (column CRUD) */}
      <AddColumnDialog
        open={addColumnOpen}
        onOpenChange={setAddColumnOpen}
        labels={COLUMN_CRUD_LABELS}
        onCreate={addColumn}
        showRejected={false}
      />

      <p className="sr-only">
        Signed in as {me?.user.name ?? 'current user'} — showing tasks assigned to you.
      </p>
    </div>
  )
}
