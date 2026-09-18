'use client'

/**
 * Tasks — the org-wide task explorer. Filter bar (search + project + assignee +
 * dynamic status from board columns), stat row, and three views: kanban board
 * (dynamic columns + column CRUD for tasks-module managers), sortable table
 * list (status sort follows column order), and a month calendar.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  startOfMonth, startOfWeek,
} from 'date-fns'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { toast } from '@/hooks/use-toast'
import { TASK_STATUS_LABELS, PRIORITY_LABELS, dueLabel, fmtDate, fmtTime, minutesToHours } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { KanbanBoard, type KanbanColumnDef } from '@/components/app/kanban'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search, X, ClipboardList, AlertTriangle, CalendarDays, KanbanSquare, ListTodo, CalendarRange,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Layers, UserRound, Video,
} from 'lucide-react'
import {
  TaskDetailDialog, TaskKanbanCard, taskStatusLabel, taskStatusTone,
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 }
const PRIORITY_CELL: Record<string, string> = {
  LOW: 'bg-muted-foreground/40', MEDIUM: 'bg-amber-500', HIGH: 'bg-orange-500', URGENT: 'bg-rose-500',
}

const COLUMN_CRUD_LABELS = {
  boardName: 'column',
  noun: 'card',
  done: 'Done column',
  addTitle: 'Add column',
} as const

type SortKey = 'due' | 'priority' | 'status' | null

/** calendar slices of the T4-c endpoints (only the fields the grid needs) */
interface CalMeeting {
  id: string
  title: string
  startsAt: string
  durationMins: number
  projectId: string | null
}

interface CalMilestone {
  id: string
  title: string
  dueDate: string | null
  projectId: string
  projectName: string
  projectColor: string | null
  doneTaskCount: number
  taskCount: number
  completed: boolean
}

/** holiday slice of GET /api/hr/holidays (T5 — readable by every member) */
interface CalHoliday {
  id: string
  name: string
  type: string
  startDate: string
  endDate: string
  days: number
}

interface CalEvent {
  key: string
  kind: 'task' | 'milestone' | 'meeting' | 'holiday'
  time: number
  task?: TaskItem
  milestone?: CalMilestone
  meeting?: CalMeeting
  holiday?: CalHoliday
}

const KIND_LABEL: Record<CalEvent['kind'], string> = {
  task: 'Task', milestone: 'Milestone', meeting: 'Meeting', holiday: 'Holiday',
}
const KIND_CLASS: Record<CalEvent['kind'], string> = {
  task: 'bg-muted text-muted-foreground',
  milestone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  meeting: 'bg-teal-600/12 text-teal-700 dark:text-teal-300',
  holiday: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

/** holiday chip classes (amber, matching the milestone accent but calendar-specific) */
const HOLIDAY_CHIP_CLASS = 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400'

export default function TasksView() {
  const { can, navigate } = useWorkspace()
  // filters
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])

  const path = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedQ) params.set('q', debouncedQ)
    if (projectId !== 'all') params.set('projectId', projectId)
    if (assignee === 'me') params.set('assignee', 'me')
    else if (assignee !== 'all' && assignee !== 'none') params.set('assignee', assignee)
    if (status !== 'all') params.set('status', status)
    params.set('limit', '2000')
    return `/api/tasks?${params.toString()}`
  }, [debouncedQ, projectId, assignee, status])

  const tasks = useData<{ items: TaskItem[] }>(path)
  const columnsQ = useData<{ items: ColumnItem[] }>('/api/columns?surface=TASK')
  const employees = useData<{ items: EmployeeItem[] }>('/api/hr/employees')
  const projects = useData<{ items: ProjectOption[] }>('/api/projects')

  // active tab (board | list | calendar) — the calendar tab owns its data + controls
  const [tab, setTab] = useState('board')

  // calendar data — lazy: only fetched while the Calendar tab is open. Unfiltered so
  // every task with a due date lands on the grid regardless of the shared filters.
  const onCalendar = tab === 'calendar'
  const calTasks = useData<{ items: TaskItem[] }>(onCalendar ? '/api/tasks?limit=500' : null)
  const calMeetings = useData<{ items: CalMeeting[] }>(onCalendar ? '/api/meetings?scope=all' : null)
  const calMilestones = useData<{ items: CalMilestone[] }>(onCalendar ? '/api/milestones' : null)
  const calHolidays = useData<{ items: CalHoliday[] }>(onCalendar ? '/api/hr/holidays' : null)
  const [calProjectId, setCalProjectId] = useState('all')

  // list sort + calendar state
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [month, setMonth] = useState(() => new Date())

  // dialogs
  const [detailOpen, setDetailOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<TaskItem | null>(null)
  const [dayDialogDate, setDayDialogDate] = useState<Date | null>(null)
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  const allItems = tasks.data?.items ?? []
  const colItems = columnsQ.data?.items ?? []
  // board columns — dynamic (fallback: derive from the loaded data if the list is unavailable)
  const columns: TaskColumnOption[] = useMemo(() => {
    if (colItems.length) return colItems.map((c) => ({ key: c.key, label: c.label, isDone: c.isDone, isRejected: c.isRejected, color: c.color }))
    if (columnsQ.error && allItems.length) {
      return [...new Set(allItems.map((t) => t.status))].map((key) => ({ key, label: TASK_STATUS_LABELS[key] ?? key, isDone: false }))
    }
    return []
  }, [colItems, columnsQ.error, allItems])
  const doneKeys = useMemo(() => new Set(columns.filter((c) => c.isDone).map((c) => c.key)), [columns])
  const statusOrder = useMemo(() => {
    const m = new Map<string, number>()
    columns.forEach((c, i) => m.set(c.key, i))
    return m
  }, [columns])

  // "Unassigned" is a client-side filter (server supports ids / me / all)
  const items = assignee === 'none' ? allItems.filter((t) => !t.assigneeMembershipId) : allItems

  const stats = {
    total: items.length,
    overdue: items.filter((t) => !doneKeys.has(t.status) && dueLabel(t.dueDate).overdue).length,
    done: items.filter((t) => doneKeys.has(t.status)).length,
  }
  const donePct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0
  const loading = (tasks.loading && !tasks.data) || (columnsQ.loading && !columnsQ.data && !columnsQ.error)
  const hasFilters = q !== '' || projectId !== 'all' || assignee !== 'all' || status !== 'all'

  // calendar events (tasks + milestones + meetings + holidays) keyed by local day — built from the
  // calendar tab's own unfiltered fetches, filtered client-side by the calendar project select
  // (holidays are org-wide and never filtered by project)
  const calEvents = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    const add = (key: string, ev: CalEvent) => {
      const arr = map.get(key)
      if (arr) arr.push(ev)
      else map.set(key, [ev])
    }
    for (const t of calTasks.data?.items ?? []) {
      if (!t.dueDate) continue
      if (calProjectId !== 'all' && t.projectId !== calProjectId) continue
      add(format(new Date(t.dueDate), 'yyyy-MM-dd'), {
        key: `t-${t.id}`, kind: 'task', time: new Date(t.dueDate).getTime(), task: t,
      })
    }
    for (const ms of calMilestones.data?.items ?? []) {
      if (!ms.dueDate) continue
      if (calProjectId !== 'all' && ms.projectId !== calProjectId) continue
      add(format(new Date(ms.dueDate), 'yyyy-MM-dd'), {
        key: `m-${ms.id}`, kind: 'milestone', time: new Date(ms.dueDate).getTime(), milestone: ms,
      })
    }
    for (const mt of calMeetings.data?.items ?? []) {
      if (calProjectId !== 'all' && mt.projectId !== calProjectId) continue
      add(format(new Date(mt.startsAt), 'yyyy-MM-dd'), {
        key: `v-${mt.id}`, kind: 'meeting', time: new Date(mt.startsAt).getTime(), meeting: mt,
      })
    }
    // org holidays — one all-day entry per covered day, only for the rendered month grid
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    for (const h of calHolidays.data?.items ?? []) {
      const hStart = new Date(h.startDate.slice(0, 10) + 'T12:00:00')
      const hEnd = new Date(h.endDate.slice(0, 10) + 'T12:00:00')
      if (hEnd < gridStart || hStart > gridEnd) continue
      let cursor = hStart > gridStart ? new Date(hStart.getTime()) : new Date(gridStart.getTime())
      const stop = hEnd < gridEnd ? hEnd : gridEnd
      let guard = 0
      while (cursor <= stop && guard < 80) {
        const dayKey = format(cursor, 'yyyy-MM-dd')
        add(dayKey, { key: `h-${h.id}-${dayKey}`, kind: 'holiday', time: -1, holiday: h })
        cursor = addDays(cursor, 1)
        guard++
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.time - b.time)
    return map
  }, [calTasks.data, calMilestones.data, calMeetings.data, calHolidays.data, calProjectId, month])

  const noDueCount = (calTasks.data?.items ?? []).filter((t) => !t.dueDate).length
  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month])
  const today = new Date()

  // sorted list rows
  const sortedItems = useMemo(() => {
    if (!sortKey) return items
    const dir = sortDir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      if (sortKey === 'due') {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
        return (av - bv) * dir
      }
      if (sortKey === 'status') {
        // status sort follows board column order (unknown statuses last)
        const av = statusOrder.get(a.status) ?? 999
        const bv = statusOrder.get(b.status) ?? 999
        return (av - bv) * dir
      }
      const av = PRIORITY_WEIGHT[a.priority] ?? 0
      const bv = PRIORITY_WEIGHT[b.priority] ?? 0
      return (av - bv) * dir
    })
  }, [items, sortKey, sortDir, statusOrder])

  function openDetail(task: TaskItem) {
    setDialogTask(task)
    setDetailOpen(true)
  }

  // ---- calendar event helpers ----

  function eventTitle(ev: CalEvent): string {
    return ev.task?.title ?? ev.milestone?.title ?? ev.meeting?.title ?? ev.holiday?.name ?? ''
  }

  function eventMeta(ev: CalEvent): string {
    if (ev.task) {
      return `${ev.task.project?.name ?? 'No project'} · ${ev.task.assigneeName ?? 'Unassigned'}`
    }
    if (ev.milestone) {
      return `${ev.milestone.projectName} · ${ev.milestone.doneTaskCount}/${ev.milestone.taskCount} tasks done`
    }
    if (ev.meeting) {
      return `${fmtTime(ev.meeting.startsAt)} · ${minutesToHours(ev.meeting.durationMins)}`
    }
    if (ev.holiday) {
      const h = ev.holiday
      const range =
        h.days === 1
          ? fmtDate(h.startDate.slice(0, 10) + 'T12:00:00')
          : `${fmtDate(h.startDate.slice(0, 10) + 'T12:00:00')} – ${fmtDate(h.endDate.slice(0, 10) + 'T12:00:00')}`
      return `${range} · ${h.days} day${h.days === 1 ? '' : 's'}`
    }
    return ''
  }

  function eventAria(ev: CalEvent): string {
    if (ev.task) return `Task: ${ev.task.title}, due ${fmtDate(ev.task.dueDate)}`
    if (ev.milestone) return `Milestone: ${ev.milestone.title}, due ${fmtDate(ev.milestone.dueDate)}`
    if (ev.meeting) return `Meeting: ${ev.meeting.title}, ${fmtDate(ev.meeting.startsAt)} at ${fmtTime(ev.meeting.startsAt)}`
    if (ev.holiday) return `Holiday: ${ev.holiday.name}, ${fmtDate(ev.holiday.startDate.slice(0, 10) + 'T12:00:00')}`
    return eventTitle(ev)
  }

  /** task → its detail dialog · milestone → the project · meeting → the Meetings module · holiday → the Leave module */
  function openEvent(ev: CalEvent) {
    if (ev.kind === 'task' && ev.task) openDetail(ev.task)
    else if (ev.kind === 'milestone' && ev.milestone) navigate('projects', { projectId: ev.milestone.projectId })
    else if (ev.kind === 'meeting') navigate('meetings')
    else if (ev.kind === 'holiday') navigate('hr-leave')
  }

  function applyUpdate(updated: TaskItem) {
    tasks.setData((prev) => prev
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
    tasks.setData((prev) => (prev ? { items: prev.items.filter((t) => t.id !== id) } : prev))
    setDialogTask((prev) => (prev && prev.id === id ? null : prev))
  }

  async function moveTask(task: TaskItem, nextStatus: string) {
    try {
      const updated = await api<TaskItem>(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: nextStatus } })
      applyUpdate(updated)
      toast({ title: 'Task moved', description: `"${task.title}" → ${columns.find((c) => c.key === nextStatus)?.label ?? nextStatus}` })
    } catch {
      tasks.refresh()
    }
  }

  function toggleSort(key: 'due' | 'priority' | 'status') {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const SortIcon = sortKey === null ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown

  function clearFilters() {
    setQ('')
    setDebouncedQ('')
    setProjectId('all')
    setAssignee('all')
    setStatus('all')
  }

  const employeeOptions = employees.data?.items ?? []
  const projectOptions = projects.data?.items ?? []

  // ---------- column CRUD ----------

  const canManageColumns = can('tasks')

  function crudColumns(): CrudColumn[] {
    const counts = new Map<string, number>()
    for (const t of allItems) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
    return columns.map((c, i) => ({
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
      columnsQ.refresh()
      tasks.refresh()
    },
    recolor: async (col: CrudColumn, color: string | null) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { color } })
      toast({ title: 'Column color updated' })
      columnsQ.refresh()
    },
    move: async (col: CrudColumn, direction: 'left' | 'right') => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { direction } })
      columnsQ.refresh()
      tasks.refresh()
    },
    toggleDone: async (col: CrudColumn, next: boolean) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { isDone: next } })
      toast({ title: next ? 'Done column enabled' : 'Done column disabled', description: `“${col.title}” ${next ? 'now counts as completed' : 'no longer counts as completed'}.` })
      columnsQ.refresh()
      tasks.refresh()
    },
    delete: async (col: CrudColumn, moveToId: string) => {
      const res = await api<{ moved: number }>(`/api/columns/${col.id}?moveTo=${moveToId}`, { method: 'DELETE' })
      toast({ title: `Column deleted — ${res.moved} card${res.moved === 1 ? '' : 's'} moved` })
      columnsQ.refresh()
      tasks.refresh()
    },
  }

  const addColumn = async (draft: { label: string; color: string | null; isDone: boolean; isRejected: boolean }) => {
    await api('/api/columns', {
      method: 'POST',
      body: { surface: 'TASK', label: draft.label, color: draft.color, isDone: draft.isDone },
    })
    toast({ title: 'Column added', description: `“${draft.label}” is at the end of the board.` })
    columnsQ.refresh()
    tasks.refresh()
  }

  const crudCols = crudColumns()
  const boardColumns: KanbanColumnDef[] = columns.map((c) => ({
    id: c.key, title: c.label, color: c.color, isDone: c.isDone, isRejected: c.isRejected,
  }))

  const filterBar = (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="tk-q" className="text-xs">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="tk-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search task titles…"
            className="h-11 pl-9" autoComplete="off" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto">
        <div className="flex w-full flex-col gap-1.5 sm:w-44">
          <Label htmlFor="tk-project" className="text-xs">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="tk-project" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              <SelectItem value="none">No project</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color ?? '#10b981' }} aria-hidden />
                    <span className="max-w-40 truncate">{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-44">
          <Label htmlFor="tk-assignee" className="text-xs">Assignee</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="tk-assignee" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="none">Unassigned</SelectItem>
              {employeeOptions.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor="tk-status" className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="tk-status" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {columns.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {hasFilters && (
        <Button variant="ghost" className="h-11 gap-1.5 px-3 text-muted-foreground" onClick={clearFilters}>
          <X className="size-4" aria-hidden /> Clear
        </Button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tasks" description="Every task across the organization — board, list and calendar" icon={ClipboardList} />

      {/* shared filters apply to the board + list; the calendar has its own controls */}
      {tab !== 'calendar' && filterBar}

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Tasks" value={stats.total} icon={Layers} loading={loading} sub={hasFilters ? 'matching filters' : 'all tasks'} />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone="danger" loading={loading}
          sub={stats.overdue ? 'past their due date' : 'all on track'} />
        <Card className="py-0">
          <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completed</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight">{donePct}%</p>
              <Progress value={donePct} className="mt-2 h-2" aria-label={`${donePct}% complete`} />
              <p className="mt-1 text-xs text-muted-foreground">{stats.done} of {stats.total} done</p>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/12 text-emerald-700 dark:text-emerald-400">
              <CalendarDays className="size-5" aria-hidden />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-12 w-full justify-start overflow-x-auto p-1 sm:w-auto">
          <TabsTrigger value="board" className="gap-1.5 px-4"><KanbanSquare className="size-4" aria-hidden /> Board</TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5 px-4"><ListTodo className="size-4" aria-hidden /> List</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 px-4"><CalendarRange className="size-4" aria-hidden /> Calendar</TabsTrigger>
        </TabsList>

        {/* ---- board ---- */}
        <TabsContent value="board" className="mt-4">
          {loading ? (
            <div className="flex gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : boardColumns.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No board columns yet"
              description="An OWNER/ADMIN/MANAGER can add columns from the board." />
          ) : items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No tasks match your filters"
              description={hasFilters ? 'Try clearing the filters to see everything.' : 'Create tasks from a project or My Tasks.'}
              action={hasFilters ? <Button variant="outline" className="h-11" onClick={clearFilters}>Clear filters</Button> : undefined} />
          ) : (
            <KanbanBoard
              columns={boardColumns}
              items={items}
              columnOf={(t) => t.status}
              onMove={moveTask}
              renderCard={(t) => <TaskKanbanCard task={t} dimmed={doneKeys.has(t.status)} />}
              onCardClick={openDetail}
              renderColumnMenu={
                canManageColumns
                  ? (col) => {
                      const idx = columns.findIndex((c) => c.key === col.id)
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
        </TabsContent>

        {/* ---- list ---- */}
        <TabsContent value="list" className="mt-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={ListTodo} title="No tasks match your filters" description="Adjust the filters above." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Task</TableHead>
                    <TableHead className="min-w-40">Assignee</TableHead>
                    <TableHead className="min-w-28">
                      <button type="button" onClick={() => toggleSort('status')}
                        className="inline-flex items-center gap-1 hover:text-foreground" aria-label="Sort by status (column order)">
                        Status <SortIcon className="size-3.5" aria-hidden />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-24">
                      <button type="button" onClick={() => toggleSort('priority')}
                        className="inline-flex items-center gap-1 hover:text-foreground" aria-label="Sort by priority">
                        Priority <SortIcon className="size-3.5" aria-hidden />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-28">
                      <button type="button" onClick={() => toggleSort('due')}
                        className="inline-flex items-center gap-1 hover:text-foreground" aria-label="Sort by due date">
                        Due <SortIcon className="size-3.5" aria-hidden />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-20 text-right">Est (h)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((t) => {
                    const due = dueLabel(t.dueDate)
                    const dimmed = doneKeys.has(t.status)
                    return (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => openDetail(t)}>
                        <TableCell className="max-w-72">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0"><PriorityDot priority={t.priority} /></span>
                            <span className="min-w-0">
                              <span className={'block truncate font-medium' + (dimmed ? ' text-muted-foreground line-through' : '')}>{t.title}</span>
                              {t.project && (
                                <span className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[11px] text-muted-foreground">
                                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.project.color ?? '#10b981' }} aria-hidden />
                                  <span className="truncate">{t.project.name}</span>
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.assigneeName ? (
                            <span className="flex items-center gap-2">
                              <UserAvatar name={t.assigneeName} avatarUrl={t.assignee?.user.avatarUrl} size="xs" />
                              <span className="truncate text-sm">{t.assigneeName}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <UserRound className="size-3.5" aria-hidden /> Unassigned
                            </span>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge label={taskStatusLabel(t.status, columns)} tone={taskStatusTone(t.status, columns)} /></TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm">
                            <span className={'size-2 rounded-full ' + (PRIORITY_CELL[t.priority] ?? 'bg-muted-foreground/40')} aria-hidden />
                            {PRIORITY_LABELS[t.priority] ?? t.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={'text-sm' + (due.overdue && !dimmed ? ' font-medium text-rose-600 dark:text-rose-400' : dimmed ? ' text-muted-foreground' : '')}>
                            {t.dueDate ? due.text : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {t.estimatedHours ?? '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ---- calendar ---- */}
        <TabsContent value="calendar" className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="size-11" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <p className="min-w-40 text-center text-sm font-semibold capitalize" aria-live="polite">{format(month, 'MMMM yyyy')}</p>
              <Button variant="outline" size="icon" className="size-11" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" className="h-11 px-3" onClick={() => setMonth(new Date())}>Today</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={calProjectId} onValueChange={setCalProjectId}>
                <SelectTrigger id="cal-project" className="h-11 w-48" aria-label="Filter calendar by project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color ?? '#10b981' }} aria-hidden />
                        <span className="max-w-40 truncate">{p.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noDueCount > 0 && (
                <Badge variant="outline" className="gap-1.5 border-dashed font-normal text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden /> {noDueCount} task{noDueCount === 1 ? '' : 's'} without due date
                </Badge>
              )}
            </div>
          </div>

          {calTasks.loading && !calTasks.data ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <div className="min-w-[750px]">
                <div className="grid grid-cols-7 border-b">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const dayEvents = calEvents.get(format(day, 'yyyy-MM-dd')) ?? []
                    const inMonth = isSameMonth(day, month)
                    const isToday = isSameDay(day, today)
                    return (
                      <div key={day.toISOString()}
                        className={'flex min-h-24 flex-col gap-1 border-b border-r p-1.5 last:border-r-0 sm:min-h-28 md:min-h-32 '
                          + (inMonth ? 'bg-card' : 'bg-muted/40 text-muted-foreground')
                          + (isToday ? ' ring-1 ring-inset ring-emerald-600/40' : '')}>
                        <button type="button" onClick={() => dayEvents.length > 0 && setDayDialogDate(day)}
                          className={'flex min-h-6 items-center justify-center self-start rounded-md px-1.5 text-xs '
                            + (isToday ? 'bg-emerald-600 font-semibold text-white' : 'text-muted-foreground')}>
                          {format(day, 'd')}
                        </button>
                        <div className="flex flex-col gap-0.5">
                          {dayEvents.slice(0, 3).map((ev) => {
                            const dimmed = ev.kind === 'task' && ev.task ? doneKeys.has(ev.task.status) : false
                            return (
                              <button
                                key={ev.key}
                                type="button"
                                onClick={() => openEvent(ev)}
                                className={`flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors ${
                                  ev.kind === 'holiday' ? HOLIDAY_CHIP_CLASS : 'bg-muted/60 hover:bg-accent'
                                }`}
                                aria-label={eventAria(ev)}
                              >
                                {ev.kind === 'task' && (
                                  <span className={'size-1.5 shrink-0 rounded-full ' + (ev.task ? (PRIORITY_CELL[ev.task.priority] ?? 'bg-muted-foreground/40') : '')} aria-hidden />
                                )}
                                {ev.kind === 'milestone' && (
                                  <span className="size-2 shrink-0 rotate-45 rounded-[2px] bg-amber-500" aria-hidden />
                                )}
                                {ev.kind === 'meeting' && (
                                  <Video className="size-3 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                                )}
                                {ev.kind === 'holiday' && (
                                  <CalendarDays className="size-3 shrink-0" aria-hidden />
                                )}
                                <span className={'truncate text-[11px] leading-tight' + (dimmed ? ' text-muted-foreground line-through' : '')}>
                                  {eventTitle(ev)}
                                </span>
                              </button>
                            )
                          })}
                          {dayEvents.length > 3 && (
                            <button type="button" onClick={() => setDayDialogDate(day)}
                              className="rounded-md px-1 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:bg-muted">
                              +{dayEvents.length - 3} more
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Tasks on their due date · milestones as <span className="inline-block size-2 rotate-45 rounded-[2px] bg-amber-500 align-middle" aria-hidden /> · meetings with a <Video className="inline size-3 text-teal-600 dark:text-teal-400" aria-hidden /> icon · public &amp; company holidays as amber chips. Click an item to open it.
          </p>
        </TabsContent>
      </Tabs>

      {/* day dialog — everything scheduled on that day */}
      <Dialog open={dayDialogDate !== null} onOpenChange={(o) => !o && setDayDialogDate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dayDialogDate ? format(dayDialogDate, 'EEEE, d MMMM yyyy') : ''}</DialogTitle>
            <DialogDescription>
              {dayDialogDate ? (calEvents.get(format(dayDialogDate, 'yyyy-MM-dd')) ?? []).length : 0} item(s) scheduled this day
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
            {(dayDialogDate ? calEvents.get(format(dayDialogDate, 'yyyy-MM-dd')) ?? [] : []).map((ev) => (
              <li key={ev.key}>
                <button type="button" onClick={() => { setDayDialogDate(null); openEvent(ev) }}
                  className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left hover:bg-muted/50">
                  {ev.kind === 'task' && (
                    <span className={'size-2 shrink-0 rounded-full ' + (ev.task ? (PRIORITY_CELL[ev.task.priority] ?? 'bg-muted-foreground/40') : '')} aria-hidden />
                  )}
                  {ev.kind === 'milestone' && (
                    <span className="size-2 shrink-0 rotate-45 rounded-[2px] bg-amber-500" aria-hidden />
                  )}
                  {ev.kind === 'meeting' && (
                    <Video className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                  )}
                  {ev.kind === 'holiday' && (
                    <CalendarDays className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {eventTitle(ev)}
                      {ev.kind === 'task' && ev.task && doneKeys.has(ev.task.status) ? ' ✓' : ''}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{eventMeta(ev)}</span>
                  </span>
                  <span className={'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ' + KIND_CLASS[ev.kind]}>
                    {KIND_LABEL[ev.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <TaskDetailDialog
        task={dialogTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={applyUpdate}
        onDeleted={handleDeleted}
        employees={employees.data?.items}
        projects={projects.data?.items}
        columns={columns}
      />

      {/* add column dialog (column CRUD) */}
      <AddColumnDialog
        open={addColumnOpen}
        onOpenChange={setAddColumnOpen}
        labels={COLUMN_CRUD_LABELS}
        onCreate={addColumn}
        showRejected={false}
      />
    </div>
  )
}
