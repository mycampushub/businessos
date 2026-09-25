'use client'

/**
 * Projects — portfolio grid (stats, filters, cards, new-project dialog) and the
 * project detail page (Overview / Milestones / Tasks / Gantt / Team / Files tabs),
 * selected via nav.params.projectId deep-links from the portfolio.
 */

import { useMemo, useState } from 'react'
import { addDays } from 'date-fns'
import { api, apiForm, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { toast } from '@/hooks/use-toast'
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_TONE, PRIORITIES, PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  ROLE_LABELS, ROLE_TONE, money, fmtDate, dueLabel, relativeTime, currencySymbol,
} from '@/lib/format'
import type { BadgeTone } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { KanbanBoard } from '@/components/app/kanban'
import { GanttChart, type GanttItem, type GanttLink } from '@/components/app/gantt'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FolderKanban, Plus, Search, Building2, ArrowRight, ArrowLeft, MoreHorizontal, Pencil, CheckCircle2,
  Trash2, Flag, Milestone as MilestoneIcon, ListChecks, Users, FolderOpen, FileText, Image as ImageIcon,
  Sheet, File, Wallet, Receipt, AlertTriangle, Activity, MessageSquare, CalendarDays, Clock, Upload,
  Megaphone,
} from 'lucide-react'
import {
  TaskDetailDialog, TaskDependencyPicker, TaskKanbanCard, isMgr,
  type TaskItem, type EmployeeItem, type ProjectOption, type MilestoneLite, type TaskColumnOption,
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

// ---------- types (worklog T1-d shapes) ----------

interface ProjectListItem {
  id: string
  name: string
  code: string | null
  description: string | null
  status: string
  priority: string
  budget: number | null
  startDate: string
  endDate: string | null
  progress: number
  color: string | null
  client: { id: string; name: string } | null
  managerName: string | null
  taskStats: { total: number; done: number }
}

interface MilestoneItem {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  status: string // PENDING | IN_PROGRESS | COMPLETED | DELAYED
  completedAt: string | null
  taskCount: number
  doneTaskCount: number
}

interface MemberItem {
  id: string
  membershipId: string
  role: string | null
  membership: { role: string; title: string | null; user: { name: string; avatarUrl: string | null } }
  user: { name: string; avatarUrl: string | null }
}

interface ActivityItem {
  id: string
  action: string | null
  message: string
  createdAt: string
  actorName: string | null
}

interface ProjectDetail extends ProjectListItem {
  managerMembershipId: string | null
  milestones: MilestoneItem[]
  tasks: TaskItem[]
  members: MemberItem[]
  activity: ActivityItem[]
  invoiceTotal: number
  taskStats: { total: number; done: number; overdue: number }
}

interface DocumentItem {
  id: string
  name: string
  folder: string
  mimeType: string | null
  size: number | null
  version: number
  uploadedById: string | null
  uploadedByName: string | null
  createdAt: string
}

interface HolidayItem {
  id: string
  name: string
  type: string
  startDate: string
  endDate: string
  days: number
  description: string | null
}

const PROJECT_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#f43f5e', '#f97316', '#8b5cf6', '#84cc16']
const MILESTONE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', DELAYED: 'Delayed',
}
const MILESTONE_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: 'muted', IN_PROGRESS: 'info', COMPLETED: 'success', DELAYED: 'destructive',
}
const MILESTONE_DOT: Record<string, string> = {
  PENDING: 'bg-muted-foreground/40', IN_PROGRESS: 'bg-teal-500', COMPLETED: 'bg-emerald-600', DELAYED: 'bg-rose-500',
}

function fmtSize(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// M12-fe: client-side mirror of the server MIME allowlist (src/lib/server/storage.ts)
// — the view cannot import that module directly (it pulls in fs/promises).
// Mirrors the same constants/validation used in documents-view.tsx so the
// project-tab upload dialog behaves identically to the Documents module.
const ALLOWED_MIME_LIST = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/json',
]
const ALLOWED_MIME_SET = new Set<string>(ALLOWED_MIME_LIST)
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'application/x-zip-compressed': 'application/zip',
  'text/x-csv': 'text/csv',
}
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip', json: 'application/json',
}
const ACCEPT_MIME = ALLOWED_MIME_LIST.join(',')
const MAX_FILE_BYTES = 25 * 1024 * 1024

/** M13-ui: client-side MIME validation — declared type first, extension fallback
 *  for browsers that report empty types. Mirrors documents-view.tsx. */
function isAllowedClientFile(file: File): boolean {
  const declared = (file.type ?? '').trim().toLowerCase()
  if (declared) {
    return ALLOWED_MIME_SET.has(MIME_ALIASES[declared] ?? declared)
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return !!MIME_BY_EXTENSION[ext]
}

const DOC_DEFAULT_FOLDER = '__default__'
const DOC_NEW_FOLDER = '__new__'

function docIcon(mime: string | null) {
  if (!mime) return File
  if (mime.includes('pdf')) return FileText
  if (mime.startsWith('image/')) return ImageIcon
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return Sheet
  return File
}

function activityIcon(action: string | null) {
  const a = action ?? ''
  if (a.startsWith('task')) return ListChecks
  if (a.startsWith('milestone')) return MilestoneIcon
  if (a.startsWith('comment')) return MessageSquare
  if (a.startsWith('document') || a.startsWith('file')) return FileText
  if (a.startsWith('project.status')) return Flag
  if (a.startsWith('announcement')) return Megaphone
  return Activity
}

// ===========================================================================
// Root switch: portfolio vs project detail
// ===========================================================================

export default function ProjectsView() {
  const { nav } = useWorkspace()
  if (nav.params?.projectId) {
    return <ProjectDetailPage projectId={nav.params.projectId} />
  }
  return <PortfolioPage />
}

// ===========================================================================
// Portfolio
// ===========================================================================

function PortfolioPage() {
  const { role, navigate, org } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const projects = useData<{ items: ProjectListItem[] }>('/api/projects')

  const [statusFilter, setStatusFilter] = useState('all')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  // support data for the create dialog — fetched only while it is open
  const employees = useData<{ items: EmployeeItem[] }>(createOpen ? '/api/hr/employees' : null)
  const clients = useData<{ items: Array<{ id: string; name: string }> }>(createOpen ? '/api/crm/clients' : null)
  const [creating, setCreating] = useState(false)
  // H20: extracted EMPTY_FORM so openCreate() can reset the form before
  // opening the dialog (no stale input carried across close/reopen cycles).
  const EMPTY_PROJECT_FORM = {
    name: '', code: '', description: '', client: 'none', manager: 'none',
    status: 'PLANNING', priority: 'MEDIUM', budget: '', startDate: '', endDate: '', color: PROJECT_COLORS[0],
  }
  const [form, setForm] = useState(EMPTY_PROJECT_FORM)

  const all = projects.data?.items ?? []
  const loading = projects.loading && !projects.data
  const canCreate = isMgr(role)
  const clientOptions = clients.data?.items ?? []

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (!needle) return true
      return (
        p.name.toLowerCase().includes(needle)
        || (p.code ?? '').toLowerCase().includes(needle)
        || (p.client?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [all, statusFilter, q])

  const counts = {
    active: all.filter((p) => p.status === 'ACTIVE').length,
    planning: all.filter((p) => p.status === 'PLANNING').length,
    completed: all.filter((p) => p.status === 'COMPLETED').length,
    onHold: all.filter((p) => p.status === 'ON_HOLD').length,
  }

  async function createProject() {
    if (!form.name.trim()) return
    setCreating(true)
    try {
      const created = await api<ProjectListItem>('/api/projects', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          description: form.description.trim() || undefined,
          clientId: form.client !== 'none' ? form.client : undefined,
          managerMembershipId: form.manager !== 'none' ? form.manager : undefined,
          status: form.status,
          priority: form.priority,
          budget: form.budget ? Number(form.budget) : undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          color: form.color,
        },
      })
      toast({ title: 'Project created', description: `${created.name} is ready` })
      setCreateOpen(false)
      setForm({ ...EMPTY_PROJECT_FORM })
      navigate('projects', { projectId: created.id })
    } catch { /* api() toasts */ } finally {
      setCreating(false)
    }
  }

  // H20: openCreate resets the form before opening the dialog so stale input
  // from a previous open is never carried over to a fresh create session.
  function openCreate() {
    setForm({ ...EMPTY_PROJECT_FORM })
    setCreateOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description={`Portfolio of ${all.length} project${all.length === 1 ? '' : 's'}${org ? ` at ${org.name}` : ''}`}
        icon={FolderKanban}
        actions={canCreate && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button className="h-11 gap-2" onClick={openCreate}><Plus className="size-4" aria-hidden /> New project</Button>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
                <DialogDescription>Set up the basics — you can refine everything later.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-name">Name *</Label>
                    <Input id="np-name" value={form.name} className="h-11" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Atlas Mobile App" autoFocus />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-code">Code</Label>
                    <Input id="np-code" value={form.code} className="h-11" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="MER-006" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="np-desc">Description</Label>
                  <Textarea id="np-desc" value={form.description} rows={2} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this project about?" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-client">Client</Label>
                    <Select value={form.client} onValueChange={(v) => setForm((f) => ({ ...f, client: v }))}>
                      <SelectTrigger id="np-client" className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Internal / none</SelectItem>
                        {clientOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-manager">Manager</Label>
                    <Select value={form.manager} onValueChange={(v) => setForm((f) => ({ ...f, manager: v }))}>
                      <SelectTrigger id="np-manager" className="h-11"><SelectValue placeholder="Me (default)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Me (default)</SelectItem>
                        {(employees.data?.items ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-status">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger id="np-status" className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['PLANNING', 'ACTIVE', 'ON_HOLD'].map((s) => (
                          <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-priority">Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                      <SelectTrigger id="np-priority" className="h-11"><SelectValue /></SelectTrigger>
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
                    <Label htmlFor="np-budget">Budget ({currencySymbol(cur)})</Label>
                    <Input id="np-budget" type="number" min="0" value={form.budget} className="h-11"
                      onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="Optional" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-start">Start date</Label>
                    <Input id="np-start" type="date" value={form.startDate} className="h-11"
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-end">End date</Label>
                    <Input id="np-end" type="date" value={form.endDate} className="h-11"
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Color</Label>
                  <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Project color">
                    {PROJECT_COLORS.map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={`Color ${c}`}
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        className={'size-11 rounded-lg border-2 transition-transform hover:scale-105 ' + (form.color === c ? 'border-foreground' : 'border-transparent')}>
                        <span className="block size-full rounded-md" style={{ backgroundColor: c }} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" className="h-11" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button className="h-11" disabled={creating || !form.name.trim()} onClick={createProject}>
                  {creating ? 'Creating…' : 'Create project'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Active" value={counts.active} icon={FolderKanban} tone="success" loading={loading} />
        <StatCard label="Planning" value={counts.planning} icon={Flag} tone="info" loading={loading} />
        <StatCard label="Completed" value={counts.completed} icon={CheckCircle2} tone="default" loading={loading} />
        <StatCard label="On Hold" value={counts.onHold} icon={Clock} tone="warning" loading={loading} />
      </div>

      {/* filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or client…"
            className="h-11 pl-9" aria-label="Search projects" />
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={canCreate ? 'Create your first project to start tracking work.' : 'Projects will appear here once they are created.'}
          action={canCreate && (
            <Button className="h-11 gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> New project
            </Button>
          )}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No projects match" description="Try a different search or status filter." />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => <ProjectCard key={p.id} project={p} onOpen={() => navigate('projects', { projectId: p.id })} />)}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project: p, onOpen }: { project: ProjectListItem; onOpen: () => void }) {
  const endOverdue = p.endDate && p.status !== 'COMPLETED' && new Date(p.endDate).getTime() < Date.now()
  return (
    <Card className="flex flex-col overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className="h-1.5 w-full" style={{ backgroundColor: p.color ?? '#10b981' }} aria-hidden />
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{p.code ?? '—'}</span>
          <StatusBadge label={PROJECT_STATUS_LABELS[p.status] ?? p.status} tone={PROJECT_STATUS_TONE[p.status] ?? 'outline'} />
        </div>
        <h3 className="text-base font-semibold leading-snug">{p.name}</h3>
        {p.client ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" aria-hidden /> {p.client.name}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5 shrink-0" aria-hidden /> Internal</p>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{p.progress}% · {p.taskStats.done}/{p.taskStats.total} tasks</span>
          </div>
          <Progress value={p.progress} className="h-2" aria-label={`${p.progress}% complete`} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <PriorityDot priority={p.priority} /> {PRIORITY_LABELS[p.priority] ?? p.priority}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            {fmtDate(p.startDate)} → <span className={endOverdue ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>{fmtDate(p.endDate)}</span>
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between border-t pt-3">
          {p.managerName ? (
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <UserAvatar name={p.managerName} size="xs" /> <span className="truncate">{p.managerName}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No manager</span>
          )}
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-3" onClick={onOpen} aria-label={`Open ${p.name}`}>
            Open <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ===========================================================================
// Project detail
// ===========================================================================

function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { role, membership, navigate, org, can } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const detail = useData<ProjectDetail>(`/api/projects/${projectId}`)
  const employees = useData<{ items: EmployeeItem[] }>('/api/hr/employees')
  const documents = useData<{ items: DocumentItem[]; folders: string[] }>(`/api/documents?projectId=${projectId}`)
  const columnsQ = useData<{ items: ColumnItem[] }>('/api/columns?surface=TASK')
  const holidaysQ = useData<{ items: HolidayItem[]; workDays: number[] }>('/api/hr/holidays')

  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', status: '', priority: '', progress: '', budget: '', endDate: '' })

  // H20: extracted empty-form constants so the openCreate* helpers can reset
  // stale input before opening the dialog (no form-state leak across reopens).
  const EMPTY_MS_FORM = { title: '', description: '', dueDate: '' }
  const [msForm, setMsForm] = useState(EMPTY_MS_FORM)
  const [msOpen, setMsOpen] = useState(false)
  const [msEdit, setMsEdit] = useState<{ id: string; title: string; description: string; dueDate: string; status: string } | null>(null)

  const EMPTY_TASK_FORM = {
    title: '', assignee: 'none', milestone: 'none', priority: 'MEDIUM', dueDate: '',
    startDate: '', est: '', description: '', deps: [] as string[],
  }
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM)
  const [taskOpen, setTaskOpen] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  // M12-fe: real-file upload (mirrors documents-view). folderChoice is the
  // __default__/__new__ sentinel pattern, name auto-fills from the picked file.
  const EMPTY_DOC_FORM = { name: '', folderChoice: DOC_DEFAULT_FOLDER, newFolder: '' }
  const [docForm, setDocForm] = useState(EMPTY_DOC_FORM)
  const [docOpen, setDocOpen] = useState(false)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docFileError, setDocFileError] = useState<string | null>(null)

  const [taskFilterStatus, setTaskFilterStatus] = useState('all')
  const [taskFilterAssignee, setTaskFilterAssignee] = useState('all')

  const [detailTaskOpen, setDetailTaskOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<TaskItem | null>(null)

  const p = detail.data
  const loading = detail.loading && !p
  const canManage = !!p && (isMgr(role) || p.managerMembershipId === membership?.id)
  // column CRUD: projects-module managers OR this project's manager
  const canManageColumns = !!p && (can('projects') || p.managerMembershipId === membership?.id)
  const canDelete = role === 'OWNER' || role === 'ADMIN'

  const colItems = columnsQ.data?.items ?? []
  const boardColumns: TaskColumnOption[] = colItems.map((c) => ({
    key: c.key, label: c.label, isDone: c.isDone, isRejected: c.isRejected, color: c.color,
  }))
  const doneKeys = useMemo(() => new Set(boardColumns.filter((c) => c.isDone).map((c) => c.key)), [boardColumns])
  const statusLabelOf = (status: string) => boardColumns.find((c) => c.key === status)?.label ?? TASK_STATUS_LABELS[status] ?? status

  // normalize: tasks from GET /api/projects/[id] omit the subtasks relation (only _count)
  const projectTasks = useMemo(
    () => (p?.tasks ?? []).map((t) => ({ ...t, subtasks: t.subtasks ?? [] })),
    [p]
  )

  const tasks = useMemo(() => {
    return projectTasks.filter((t) => {
      if (taskFilterStatus !== 'all' && t.status !== taskFilterStatus) return false
      if (taskFilterAssignee === 'none' && t.assigneeMembershipId) return false
      if (taskFilterAssignee !== 'all' && taskFilterAssignee !== 'none' && t.assigneeMembershipId !== taskFilterAssignee) return false
      return true
    })
  }, [projectTasks, taskFilterStatus, taskFilterAssignee])

  // organization calendar for the gantt: weekly non-working days + public holidays
  const nonWorkingDays = useMemo(() => {
    const wd = holidaysQ.data?.workDays
    if (!wd?.length) return [6, 7]
    return [1, 2, 3, 4, 5, 6, 7].filter((d) => !wd.includes(d))
  }, [holidaysQ.data])

  const ganttHolidays = useMemo(
    () => (holidaysQ.data?.items ?? []).map((h) => ({ start: new Date(h.startDate), end: new Date(h.endDate), name: h.name })),
    [holidaysQ.data]
  )

  // gantt items (+ dependency links from dependsOn — same project only)
  const ganttItems = useMemo<GanttItem[]>(() => {
    if (!p) return []
    const labelOf = (key: string) => colItems.find((c) => c.key === key)?.label ?? TASK_STATUS_LABELS[key] ?? key
    const items: GanttItem[] = []
    const taskEnds = projectTasks.map((t) => (t.dueDate ? new Date(t.dueDate) : null)).filter(Boolean) as Date[]
    const msEnds = p.milestones.map((m) => (m.dueDate ? new Date(m.dueDate) : null)).filter(Boolean) as Date[]
    const allEnds = [p.endDate ? new Date(p.endDate) : null, ...taskEnds, ...msEnds].filter(Boolean) as Date[]
    const projectEnd = allEnds.length ? new Date(Math.max(...allEnds.map((d) => d.getTime()))) : addDays(new Date(p.startDate), 30)
    items.push({
      id: `pr-${p.id}`, name: p.name, start: new Date(p.startDate), end: projectEnd,
      progress: p.progress, color: '#059669', kind: 'project', completed: p.status === 'COMPLETED',
    })
    for (const m of p.milestones) {
      if (!m.dueDate) continue
      const d = new Date(m.dueDate)
      items.push({
        id: `ms-${m.id}`, name: m.title, start: d, end: d, kind: 'milestone', meta: MILESTONE_STATUS_LABELS[m.status],
        completed: m.status === 'COMPLETED',
      })
    }
    for (const t of projectTasks) {
      // bars start at startDate (fallback createdAt); end = dueDate ?? estimatedHours-days heuristic ?? +3d
      const start = t.startDate ? new Date(t.startDate) : new Date(t.createdAt)
      const estDays = t.estimatedHours != null ? Math.max(1, Math.ceil(t.estimatedHours / 8)) : null
      const end = t.dueDate ? new Date(t.dueDate) : estDays != null ? addDays(start, estDays) : addDays(start, 3)
      items.push({
        id: `t-${t.id}`, name: t.title, start, end: end < start ? addDays(start, 1) : end,
        progress: doneKeys.has(t.status) ? 100 : 0, color: '#14b8a6', kind: 'task',
        assignee: t.assigneeName ?? undefined, meta: labelOf(t.status), completed: doneKeys.has(t.status),
      })
    }
    return items
  }, [p, projectTasks, doneKeys, colItems])

  // dependency link types (FS/SS/FF/SF) for the gantt connectors — fetched in
  // a SINGLE request via the batch endpoint /api/projects/[id]/dependencies
  // (H5-fe fix: replaces the previous N+1 Promise.all of one request per task).
  const depsQ = useData<{ items: Array<{ taskId: string; dependsOnTaskId: string; type: string }> }>(
    p ? `/api/projects/${p.id}/dependencies` : null
  )
  const depTypes = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const e of depsQ.data?.items ?? []) {
      map[`${e.taskId}:${e.dependsOnTaskId}`] = e.type
    }
    return map
  }, [depsQ.data])

  const ganttLinks = useMemo(() => {
    const links: GanttLink[] = []
    const taskIds = new Set(projectTasks.map((t) => t.id))
    for (const t of projectTasks) {
      for (const dep of t.dependsOn ?? []) {
        if (taskIds.has(dep.id)) {
          // link type (FS/SS/FF/SF) rides on the gantt connector label
          links.push({ fromId: `t-${dep.id}`, toId: `t-${t.id}`, type: depTypes[`${t.id}:${dep.id}`] })
        }
      }
    }
    return links
  }, [projectTasks, depTypes])

  function openDetailTask(t: TaskItem) {
    setDialogTask(t)
    setDetailTaskOpen(true)
  }

  // gantt task bars deep-link into the same task detail dialog used on the board
  function openGanttItem(item: GanttItem) {
    if (!item.id.startsWith('t-')) return
    const t = projectTasks.find((x) => x.id === item.id.slice(2))
    if (t) openDetailTask(t)
  }

  function applyTaskUpdate(updated: TaskItem) {
    detail.setData((prev) => prev
      ? { ...prev, tasks: prev.tasks.map((t) => {
          if (t.id === updated.id) return updated
          if ((t.subtasks ?? []).some((s) => s.id === updated.id)) {
            return { ...t, subtasks: (t.subtasks ?? []).map((s) => (s.id === updated.id ? { ...s, status: updated.status } : s)) }
          }
          return t
        }) }
      : prev)
    setDialogTask((prev) => (prev && prev.id === updated.id ? updated : prev))
    detail.refresh() // recompute progress/taskStats server-side
  }

  function handleTaskDeleted(id: string) {
    detail.setData((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== id) } : prev))
    setDialogTask((prev) => (prev && prev.id === id ? null : prev))
    detail.refresh()
  }

  async function moveTask(task: TaskItem, status: string) {
    try {
      const updated = await api<TaskItem>(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status } })
      applyTaskUpdate(updated)
      toast({ title: 'Task moved', description: `"${task.title}" → ${statusLabelOf(status)}` })
    } catch {
      detail.refresh()
    }
  }

  // ---------- column CRUD (TASK board) ----------

  function crudColumns(): CrudColumn[] {
    const counts = new Map<string, number>()
    for (const t of projectTasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
    return colItems.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.label,
      color: c.color,
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
      detail.refresh()
    },
    recolor: async (col: CrudColumn, color: string | null) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { color } })
      toast({ title: 'Column color updated' })
      columnsQ.refresh()
    },
    move: async (col: CrudColumn, direction: 'left' | 'right') => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { direction } })
      columnsQ.refresh()
      detail.refresh()
    },
    toggleDone: async (col: CrudColumn, next: boolean) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { isDone: next } })
      toast({ title: next ? 'Done column enabled' : 'Done column disabled', description: `“${col.title}” ${next ? 'now counts as completed' : 'no longer counts as completed'}.` })
      columnsQ.refresh()
      detail.refresh()
    },
    delete: async (col: CrudColumn, moveToId: string) => {
      const res = await api<{ moved: number }>(`/api/columns/${col.id}?moveTo=${moveToId}`, { method: 'DELETE' })
      toast({ title: `Column deleted — ${res.moved} card${res.moved === 1 ? '' : 's'} moved` })
      columnsQ.refresh()
      detail.refresh()
    },
  }

  const addColumn = async (draft: { label: string; color: string | null; isDone: boolean; isRejected: boolean }) => {
    await api('/api/columns', {
      method: 'POST',
      body: { surface: 'TASK', label: draft.label, color: draft.color, isDone: draft.isDone },
    })
    toast({ title: 'Column added', description: `“${draft.label}” is at the end of the board.` })
    columnsQ.refresh()
    detail.refresh()
  }

  async function patchProject(body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/projects/${projectId}`, { method: 'PATCH', body })
      toast({ title: msg })
      detail.refresh()
    } catch { /* api() toasts */ }
  }

  async function deleteProject() {
    try {
      await api(`/api/projects/${projectId}`, { method: 'DELETE' })
      toast({ title: 'Project deleted', description: 'The project and its board were removed' })
      navigate('projects')
    } catch { /* api() toasts */ }
  }

  async function addMilestone() {
    if (!msForm.title.trim()) return
    setSaving(true)
    try {
      await api(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        body: { title: msForm.title.trim(), description: msForm.description.trim() || undefined, dueDate: msForm.dueDate || undefined },
      })
      toast({ title: 'Milestone added', description: msForm.title.trim() })
      setMsOpen(false)
      setMsForm({ ...EMPTY_MS_FORM })
      detail.refresh()
    } catch { /* api() toasts */ } finally {
      setSaving(false)
    }
  }

  async function patchMilestone(id: string, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/milestones/${id}`, { method: 'PATCH', body })
      toast({ title: msg })
      detail.refresh()
    } catch { /* api() toasts */ }
  }

  function openMsEdit(m: MilestoneItem) {
    setMsEdit({
      id: m.id,
      title: m.title,
      description: m.description ?? '',
      dueDate: m.dueDate ? m.dueDate.slice(0, 10) : '',
      status: m.status,
    })
  }

  async function saveMsEdit() {
    if (!msEdit || !msEdit.title.trim()) return
    const current = p?.milestones.find((x) => x.id === msEdit.id)
    const body: Record<string, unknown> = {
      title: msEdit.title.trim(),
      status: msEdit.status, // DELAYED finally reachable from the UI
    }
    if (msEdit.description.trim() !== (current?.description ?? '')) {
      body.description = msEdit.description.trim() || null
    }
    if (msEdit.dueDate !== (current?.dueDate ? current.dueDate.slice(0, 10) : '')) {
      body.dueDate = msEdit.dueDate || null
    }
    await patchMilestone(msEdit.id, body, 'Milestone updated')
    setMsEdit(null)
  }

  async function deleteMilestone(id: string) {
    try {
      await api(`/api/milestones/${id}`, { method: 'DELETE' })
      toast({ title: 'Milestone deleted' })
      detail.refresh()
    } catch { /* api() toasts */ }
  }

  async function addTask() {
    if (!taskForm.title.trim()) return
    setSaving(true)
    try {
      const created = await api<TaskItem>('/api/tasks', {
        method: 'POST',
        body: {
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          projectId,
          assigneeMembershipId: taskForm.assignee !== 'none' ? taskForm.assignee : undefined,
          milestoneId: taskForm.milestone !== 'none' ? taskForm.milestone : undefined,
          priority: taskForm.priority,
          dueDate: taskForm.dueDate || undefined,
          startDate: taskForm.startDate || undefined,
          estimatedHours: taskForm.est ? Number(taskForm.est) : undefined,
          dependsOnTaskIds: taskForm.deps.length ? taskForm.deps : undefined,
        },
      })
      toast({ title: 'Task created', description: `"${created.title}" added to the board` })
      setTaskOpen(false)
      setTaskForm({ ...EMPTY_TASK_FORM })
      detail.refresh()
    } catch { /* api() toasts */ } finally {
      setSaving(false)
    }
  }

  // M12-fe: real upload — same apiForm pattern as documents-view.tsx. The
  // projectId is implicit (this is the project detail page) and is appended
  // to the FormData so the file is auto-linked to this project.
  async function addDocument() {
    const folderName =
      docForm.folderChoice === DOC_NEW_FOLDER
        ? docForm.newFolder.trim()
        : docForm.folderChoice === DOC_DEFAULT_FOLDER
          ? 'General'
          : docForm.folderChoice || 'General'
    if (docForm.folderChoice === DOC_NEW_FOLDER && !folderName) {
      toast({ title: 'Folder name required', description: 'Enter a name for the new folder.', variant: 'destructive' })
      return
    }
    const name = docForm.name.trim()
    if (!name) {
      toast({ title: 'Name required', description: 'Give the document a file name.', variant: 'destructive' })
      return
    }
    if (!docFile) {
      toast({ title: 'File required', description: 'Choose a file to upload first.', variant: 'destructive' })
      return
    }
    if (docFile.size > MAX_FILE_BYTES) {
      toast({ title: 'File too large', description: 'Maximum upload size is 25 MB.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('file', docFile)
      fd.append('name', name)
      fd.append('folder', folderName)
      fd.append('projectId', projectId)
      await apiForm('/api/documents', fd)
      toast({ title: 'File uploaded', description: `${name} (${fmtSize(docFile.size)}) stored in ${folderName}.` })
      setDocOpen(false)
      setDocForm({ ...EMPTY_DOC_FORM })
      setDocFile(null)
      setDocFileError(null)
      documents.refresh()
    } catch { /* apiForm() toasts */ } finally {
      setSaving(false)
    }
  }

  async function deleteDocument(id: string) {
    try {
      await api(`/api/documents/${id}`, { method: 'DELETE' })
      toast({ title: 'File deleted' })
      documents.refresh()
    } catch { /* api() toasts */ }
  }

  // H20: openCreate* helpers reset their respective form before opening the
  // dialog so stale input from a previous open is never carried over.
  function openCreateTask() {
    setTaskForm({ ...EMPTY_TASK_FORM })
    setTaskOpen(true)
  }
  function openCreateMs() {
    setMsForm({ ...EMPTY_MS_FORM })
    setMsOpen(true)
  }
  function openCreateDoc() {
    setDocForm({ ...EMPTY_DOC_FORM })
    setDocFile(null)
    setDocFileError(null)
    setDocOpen(true)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  if (!p) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" className="h-11 w-fit gap-2" onClick={() => navigate('projects')}>
          <ArrowLeft className="size-4" aria-hidden /> Back to projects
        </Button>
        <EmptyState icon={AlertTriangle} title="Project not found"
          description="It may have been deleted, or it belongs to another organization." />
      </div>
    )
  }

  const overdueTasks = p.taskStats.overdue
  const upcoming = [...p.milestones]
    .filter((m) => m.status !== 'COMPLETED')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 3)
  const memberOptions = p.members.map((m) => ({ id: m.membershipId, name: m.user.name }))
  const milestoneOptions: MilestoneLite[] = p.milestones.map((m) => ({ id: m.id, title: m.title }))

  const docs = documents.data?.items ?? []
  const folders = documents.data?.folders ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-3">
        <Button variant="ghost" className="h-11 w-fit gap-2 px-2 text-muted-foreground" onClick={() => navigate('projects')}>
          <ArrowLeft className="size-4" aria-hidden /> All projects
        </Button>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-1 hidden size-10 shrink-0 items-center justify-center rounded-lg sm:flex"
              style={{ backgroundColor: `${p.color ?? '#10b981'}20`, color: p.color ?? '#10b981' }} aria-hidden>
              <FolderKanban className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{p.name}</h1>
                {p.code && <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{p.code}</span>}
                <StatusBadge label={PROJECT_STATUS_LABELS[p.status] ?? p.status} tone={PROJECT_STATUS_TONE[p.status] ?? 'outline'} />
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PriorityDot priority={p.priority} /> {PRIORITY_LABELS[p.priority] ?? p.priority}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {p.client && (
                  <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden /> {p.client.name}</span>
                )}
                {p.managerName && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserAvatar name={p.managerName} size="xs" /> {p.managerName}
                  </span>
                )}
                {p.budget != null && (
                  <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" aria-hidden /> {money(p.budget, cur)}</span>
                )}
                {p.invoiceTotal > 0 && (
                  <span className="inline-flex items-center gap-1.5"><Receipt className="size-3.5" aria-hidden /> {money(p.invoiceTotal, cur)} invoiced</span>
                )}
                <span className={'inline-flex items-center gap-1.5' + (overdueTasks > 0 ? ' font-medium text-rose-600 dark:text-rose-400' : '')}>
                  <AlertTriangle className="size-3.5" aria-hidden /> {overdueTasks} overdue
                </span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden /> {fmtDate(p.startDate)} → {fmtDate(p.endDate)}</span>
              </div>
              <div className="mt-3 max-w-xl">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{p.progress}% · {p.taskStats.done}/{p.taskStats.total} tasks done</span>
                </div>
                <Progress value={p.progress} className="h-2.5" aria-label={`${p.progress}% complete`} />
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" className="h-11 gap-2" onClick={openCreateTask}>
                <Plus className="size-4" aria-hidden /> Add task
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="size-11" aria-label="Project actions">
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="min-h-11 gap-2 cursor-pointer"
                    onClick={() => {
                      setEditForm({
                        name: p.name, description: p.description ?? '', status: p.status, priority: p.priority,
                        progress: String(p.progress), budget: p.budget != null ? String(p.budget) : '', endDate: p.endDate ? p.endDate.slice(0, 10) : '',
                      })
                      setEditOpen(true)
                    }}>
                    <Pencil className="size-4" aria-hidden /> Edit project
                  </DropdownMenuItem>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem className="min-h-11 gap-2 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                        <CheckCircle2 className="size-4" aria-hidden /> Mark completed
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark project as completed?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &quot;{p.name}&quot; will be marked Completed and its progress set to 100%.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                        <AlertDialogAction className="h-11" onClick={() => patchProject({ status: 'COMPLETED' }, 'Project marked completed')}>Confirm</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem className="min-h-11 gap-2 cursor-pointer text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400" onSelect={(e) => e.preventDefault()}>
                            <Trash2 className="size-4" aria-hidden /> Delete project
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &quot;{p.name}&quot; and all of its tasks and milestones will be permanently removed. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                            <AlertDialogAction className="h-11 bg-rose-600 hover:bg-rose-700" onClick={deleteProject}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* edit project dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Update the project&apos;s core settings.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-name">Name</Label>
              <Input id="ep-name" value={editForm.name} className="h-11" onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-desc">Description</Label>
              <Textarea id="ep-desc" value={editForm.description} rows={3} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-status">Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger id="ep-status" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-priority">Priority</Label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger id="ep-priority" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((pr) => <SelectItem key={pr} value={pr}>{PRIORITY_LABELS[pr]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-progress">Progress %</Label>
                <Input id="ep-progress" type="number" min="0" max="100" value={editForm.progress} className="h-11"
                  onChange={(e) => setEditForm((f) => ({ ...f, progress: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-budget">Budget ({currencySymbol(cur)})</Label>
                <Input id="ep-budget" type="number" min="0" value={editForm.budget} className="h-11"
                  onChange={(e) => setEditForm((f) => ({ ...f, budget: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-end">End date</Label>
                <Input id="ep-end" type="date" value={editForm.endDate} className="h-11"
                  onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="h-11" disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await patchProject({
                    name: editForm.name.trim() || undefined,
                    description: editForm.description.trim() || null,
                    status: editForm.status,
                    priority: editForm.priority,
                    progress: editForm.progress === '' ? undefined : Math.max(0, Math.min(100, Number(editForm.progress))),
                    budget: editForm.budget === '' ? null : Number(editForm.budget),
                    endDate: editForm.endDate || null,
                  }, 'Project updated')
                  setEditOpen(false)
                } finally {
                  setSaving(false)
                }
              }}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="overview">
        <TabsList className="h-12 w-full justify-start overflow-x-auto p-1 sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5 px-4">Overview</TabsTrigger>
          <TabsTrigger value="milestones" className="gap-1.5 px-4"><MilestoneIcon className="size-4" aria-hidden /> Milestones</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5 px-4"><ListChecks className="size-4" aria-hidden /> Tasks</TabsTrigger>
          <TabsTrigger value="gantt" className="gap-1.5 px-4"><CalendarDays className="size-4" aria-hidden /> Gantt</TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 px-4"><Users className="size-4" aria-hidden /> Team</TabsTrigger>
          <TabsTrigger value="files" className="gap-1.5 px-4"><FolderOpen className="size-4" aria-hidden /> Files</TabsTrigger>
        </TabsList>

        {/* ---- Overview ---- */}
        <TabsContent value="overview" className="mt-4 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Budget" value={money(p.budget, cur)} icon={Wallet} tone="default" />
            <StatCard label="Invoiced" value={money(p.invoiceTotal, cur)} icon={Receipt} tone="success" />
            <StatCard label="Tasks" value={`${p.taskStats.done}/${p.taskStats.total}`} icon={ListChecks} tone="info"
              sub={`${Math.round((p.taskStats.done / Math.max(1, p.taskStats.total)) * 100)}% complete`} />
            <StatCard label="Overdue" value={overdueTasks} icon={AlertTriangle} tone={overdueTasks ? 'danger' : 'default'}
              sub={overdueTasks ? 'needs attention' : 'all on track'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="py-0 lg:col-span-2">
              <CardHeader className="pb-3 pt-4"><CardTitle className="text-sm font-medium">About this project</CardTitle></CardHeader>
              <CardContent className="pb-4">
                {p.description
                  ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>
                  : <p className="text-sm italic text-muted-foreground">No description yet.</p>}
              </CardContent>
            </Card>

            <Card className="py-0">
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <MilestoneIcon className="size-4 text-amber-500" aria-hidden /> Upcoming milestones
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {upcoming.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No open milestones — add one from the Milestones tab.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {upcoming.map((m) => {
                      const due = dueLabel(m.dueDate)
                      return (
                        <li key={m.id} className="flex items-start gap-2.5">
                          <span className={'mt-1.5 size-2.5 shrink-0 rounded-full ' + (MILESTONE_DOT[m.status] ?? 'bg-muted-foreground/40')} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {m.doneTaskCount}/{m.taskCount} tasks · <span className={due.overdue ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>{due.text}</span>
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="py-0">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-muted-foreground" aria-hidden /> Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {p.activity.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No activity recorded for this project yet.</p>
              ) : (
                <ol className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1">
                  {p.activity.map((a) => {
                    const Icon = activityIcon(a.action)
                    return (
                      <li key={a.id} className="flex items-start gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{a.message}</p>
                          <p className="text-[11px] text-muted-foreground">{a.actorName ?? 'System'} · {relativeTime(a.createdAt)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Milestones ---- */}
        <TabsContent value="milestones" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{p.milestones.length} milestone{p.milestones.length === 1 ? '' : 's'}</p>
            {canManage && (
              <Dialog open={msOpen} onOpenChange={setMsOpen}>
                <Button className="h-11 gap-2" onClick={openCreateMs}><Plus className="size-4" aria-hidden /> Add milestone</Button>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add milestone</DialogTitle>
                    <DialogDescription>A checkpoint the team works towards.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ms-title">Title *</Label>
                      <Input id="ms-title" value={msForm.title} className="h-11" onChange={(e) => setMsForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Public beta launch" autoFocus />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ms-desc">Description</Label>
                      <Textarea id="ms-desc" value={msForm.description} rows={2} onChange={(e) => setMsForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ms-due">Due date</Label>
                      <Input id="ms-due" type="date" value={msForm.dueDate} className="h-11" onChange={(e) => setMsForm((f) => ({ ...f, dueDate: e.target.value }))} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" className="h-11" onClick={() => setMsOpen(false)}>Cancel</Button>
                    <Button className="h-11" disabled={saving || !msForm.title.trim()} onClick={addMilestone}>
                      {saving ? 'Adding…' : 'Add milestone'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {p.milestones.length === 0 ? (
            <EmptyState icon={MilestoneIcon} title="No milestones yet"
              description={canManage ? 'Break the project into checkpoints by adding milestones.' : 'Milestones will appear here once they are added.'} />
          ) : (
            <ol className="relative flex flex-col gap-0 pl-1">
              <span className="absolute bottom-4 left-[15px] top-4 w-px bg-border" aria-hidden />
              {p.milestones.map((m) => {
                const due = dueLabel(m.dueDate)
                return (
                  <li key={m.id} className="relative flex gap-4 py-4">
                    <span className={'z-10 mt-1 size-4 shrink-0 rounded-full border-4 border-background ' + (MILESTONE_DOT[m.status] ?? 'bg-muted-foreground/40')} aria-hidden />
                    <Card className="min-w-0 flex-1 py-0">
                      <CardContent className="flex flex-col gap-2 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className={'truncate text-sm font-semibold' + (m.status === 'COMPLETED' ? ' text-muted-foreground' : '')}>{m.title}</h3>
                            <StatusBadge label={MILESTONE_STATUS_LABELS[m.status] ?? m.status} tone={MILESTONE_STATUS_TONE[m.status] ?? 'muted'} />
                          </div>
                          <div className="flex items-center gap-1">
                            {canManage && (
                              <Button variant="ghost" size="icon" className="size-9" onClick={() => openMsEdit(m)} aria-label={`Edit ${m.title}`}>
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                            )}
                            {canManage && (
                              <Select value={m.status} onValueChange={(v) => patchMilestone(m.id, { status: v }, 'Milestone updated')}>
                                <SelectTrigger className="h-9 w-36 text-xs" aria-label={`Status of ${m.title}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Object.keys(MILESTONE_STATUS_LABELS).map((s) => (
                                    <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {canManage && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400" aria-label={`Delete ${m.title}`}>
                                    <Trash2 className="size-4" aria-hidden />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete milestone?</AlertDialogTitle>
                                    <AlertDialogDescription>&quot;{m.title}&quot; will be permanently removed.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="h-11 bg-rose-600 hover:bg-rose-700" onClick={() => deleteMilestone(m.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                        {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="size-3.5" aria-hidden />
                            <span className={due.overdue && m.status !== 'COMPLETED' ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>
                              {m.dueDate ? `${fmtDate(m.dueDate)} · ${due.text}` : 'No due date'}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <ListChecks className="size-3.5" aria-hidden /> {m.doneTaskCount}/{m.taskCount} tasks
                          </span>
                          {m.completedAt && (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="size-3.5" aria-hidden /> completed {relativeTime(m.completedAt)}
                            </span>
                          )}
                        </div>
                        {m.taskCount > 0 && <Progress value={Math.round((m.doneTaskCount / m.taskCount) * 100)} className="h-1.5" aria-label={`${m.doneTaskCount} of ${m.taskCount} tasks done`} />}
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ol>
          )}
        </TabsContent>

        {/* ---- Tasks ---- */}
        <TabsContent value="tasks" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={taskFilterStatus} onValueChange={setTaskFilterStatus}>
                <SelectTrigger className="h-11 w-40" aria-label="Filter tasks by status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {boardColumns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={taskFilterAssignee} onValueChange={setTaskFilterAssignee}>
                <SelectTrigger className="h-11 w-44" aria-label="Filter tasks by assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {memberOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {tasks.length} of {projectTasks.length} task{projectTasks.length === 1 ? '' : 's'}
              </span>
            </div>
            <Button className="h-11 gap-2" onClick={openCreateTask}>
              <Plus className="size-4" aria-hidden /> Add task
            </Button>
          </div>

          {projectTasks.length === 0 ? (
            <EmptyState icon={ListChecks} title="No tasks in this project"
              description="Add the first task to get the board moving." />
          ) : (
            <KanbanBoard
              columns={boardColumns.map((c) => ({ id: c.key, title: c.label, color: c.color, isDone: c.isDone, isRejected: c.isRejected }))}
              items={tasks}
              columnOf={(t) => t.status}
              onMove={moveTask}
              renderCard={(t) => <TaskKanbanCard task={t} dimmed={doneKeys.has(t.status)} />}
              onCardClick={openDetailTask}
              renderColumnMenu={
                canManageColumns
                  ? (col) => {
                      const crudCols = crudColumns()
                      const idx = boardColumns.findIndex((c) => c.key === col.id)
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

        {/* ---- Gantt ---- */}
        <TabsContent value="gantt" className="mt-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Timeline of the project, its milestones and tasks — click a task bar to open its details.
          </p>
          <GanttChart
            items={ganttItems}
            links={ganttLinks}
            nonWorkingDays={nonWorkingDays}
            holidays={ganttHolidays}
            onItemClick={openGanttItem}
          />
          <p className="text-xs text-muted-foreground">
            Weekends and public holidays are shaded. Connector lines mark task dependencies.
          </p>
        </TabsContent>

        {/* ---- Team ---- */}
        <TabsContent value="team" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{p.members.length} member{p.members.length === 1 ? '' : 's'} on the project team</p>
            {p.managerName && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserAvatar name={p.managerName} size="xs" /> Led by {p.managerName}
              </span>
            )}
          </div>
          {p.members.length === 0 ? (
            <EmptyState icon={Users} title="No team members yet" description="The project team will appear here once members are added." />
          ) : (
            <Card className="py-0">
              <CardContent className="flex flex-col gap-1 p-2">
                {p.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
                    <UserAvatar name={m.user.name} avatarUrl={m.user.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.role ?? 'Team member'}{m.membership.title ? ` · ${m.membership.title}` : ''}
                        {m.membershipId === p.managerMembershipId ? ' · Project manager' : ''}
                      </p>
                    </div>
                    <StatusBadge label={ROLE_LABELS[m.membership.role] ?? m.membership.role} tone={ROLE_TONE[m.membership.role] ?? 'outline'} dot={false} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card className="py-0 border-dashed bg-muted/20">
            <CardContent className="flex items-start gap-3 p-4">
              <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs text-muted-foreground">
                Project team — people staffed on this specific project. Department teams and the wider org chart live in Organization → Structure.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Files ---- */}
        <TabsContent value="files" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{docs.length} file{docs.length === 1 ? '' : 's'} in this project{folders.length ? ` · folders: ${folders.join(', ')}` : ''}</p>
            <Dialog open={docOpen} onOpenChange={setDocOpen}>
              <Button className="h-11 gap-2" onClick={openCreateDoc}><Upload className="size-4" aria-hidden /> Add file</Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add file</DialogTitle>
                  <DialogDescription>Upload a file into this project&apos;s folder — stored alongside the project.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  {/* M12-fe: real <input type="file"> with the same MIME + size
                      validation as documents-view. Name auto-fills from the file. */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-file">File *</Label>
                    <Input
                      id="df-file"
                      type="file"
                      accept={ACCEPT_MIME}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null
                        if (!picked) {
                          setDocFile(null)
                          setDocFileError(null)
                          return
                        }
                        if (!isAllowedClientFile(picked)) {
                          setDocFile(null)
                          setDocFileError('Unsupported file type. Allowed: PDF, images, Office docs, text/CSV, ZIP or JSON.')
                          e.target.value = ''
                          return
                        }
                        if (picked.size > MAX_FILE_BYTES) {
                          setDocFileError(`File is ${fmtSize(picked.size)} — exceeds the 25 MB limit.`)
                        } else {
                          setDocFileError(null)
                        }
                        setDocFile(picked)
                        setDocForm((f) => ({ ...f, name: picked.name }))
                      }}
                      aria-label="Choose a file to upload"
                      aria-invalid={!!docFileError || undefined}
                      aria-describedby={docFileError ? 'df-file-error' : undefined}
                    />
                    {docFile && (
                      <p className="text-xs text-muted-foreground">
                        {docFile.name} · {fmtSize(docFile.size)}
                        {docFile.size > MAX_FILE_BYTES && (
                          <span className="font-medium text-destructive"> — exceeds the 25 MB limit</span>
                        )}
                      </p>
                    )}
                    {docFileError && (
                      <p id="df-file-error" role="alert" className="text-xs font-medium text-destructive">
                        {docFileError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      PDF, images, Office docs, text/CSV, ZIP or JSON — up to 25 MB.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-name">File name *</Label>
                    <Input id="df-name" value={docForm.name} className="h-11" onChange={(e) => setDocForm((f) => ({ ...f, name: e.target.value }))} placeholder="Q3-report.pdf" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-folder">Folder</Label>
                    <Select value={docForm.folderChoice} onValueChange={(v) => setDocForm((f) => ({ ...f, folderChoice: v }))}>
                      <SelectTrigger id="df-folder" className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DOC_DEFAULT_FOLDER}>General (default)</SelectItem>
                        {folders.map((fo) => (
                          <SelectItem key={fo} value={fo}>{fo}</SelectItem>
                        ))}
                        <SelectItem value={DOC_NEW_FOLDER}>New folder…</SelectItem>
                      </SelectContent>
                    </Select>
                    {docForm.folderChoice === DOC_NEW_FOLDER && (
                      <Input
                        value={docForm.newFolder}
                        className="h-11"
                        onChange={(e) => setDocForm((f) => ({ ...f, newFolder: e.target.value }))}
                        placeholder="New folder name"
                        aria-label="New folder name"
                      />
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" className="h-11" onClick={() => setDocOpen(false)}>Cancel</Button>
                  <Button
                    className="h-11"
                    disabled={saving || !docFile || !!docFileError || !docForm.name.trim() || (docFile?.size ?? 0) > MAX_FILE_BYTES || (docForm.folderChoice === DOC_NEW_FOLDER && !docForm.newFolder.trim())}
                    onClick={addDocument}
                  >
                    {saving ? 'Uploading…' : 'Upload file'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {docs.length === 0 ? (
            <EmptyState icon={FolderOpen} title="No files yet"
              description="Register contracts, designs and reports for this project." />
          ) : (
            <Card className="py-0">
              <CardContent className="flex flex-col gap-1 p-2">
                {docs.map((d) => {
                  const Icon = docIcon(d.mimeType)
                  const canDelete = isMgr(role) || d.uploadedById === membership?.id
                  return (
                    <div key={d.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {d.name}
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">v{d.version}</Badge>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.folder} · {d.uploadedByName ?? '—'} · {fmtDate(d.createdAt)} · {fmtSize(d.size)}
                        </p>
                      </div>
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-9 shrink-0 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400" aria-label={`Delete ${d.name}`}>
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete file?</AlertDialogTitle>
                              <AlertDialogDescription>&quot;{d.name}&quot; will be removed from the project folder.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                              <AlertDialogAction className="h-11 bg-rose-600 hover:bg-rose-700" onClick={() => deleteDocument(d.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* add task dialog (project detail) */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
            <DialogDescription>New task in {p.name}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pt-title">Title *</Label>
              <Input id="pt-title" value={taskForm.title} className="h-11" onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" autoFocus />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-assignee">Assignee</Label>
                <Select value={taskForm.assignee} onValueChange={(v) => setTaskForm((f) => ({ ...f, assignee: v }))}>
                  <SelectTrigger id="pt-assignee" className="h-11"><SelectValue placeholder="Me (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Me (default)</SelectItem>
                    {(employees.data?.items ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-milestone">Milestone</Label>
                <Select value={taskForm.milestone} onValueChange={(v) => setTaskForm((f) => ({ ...f, milestone: v }))}>
                  <SelectTrigger id="pt-milestone" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {milestoneOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-priority">Priority</Label>
                <Select value={taskForm.priority} onValueChange={(v) => setTaskForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger id="pt-priority" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        <span className="inline-flex items-center gap-2"><PriorityDot priority={pr} /> {PRIORITY_LABELS[pr]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-due">Due date</Label>
                <Input id="pt-due" type="date" value={taskForm.dueDate} className="h-11"
                  min={taskForm.startDate || undefined}
                  onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-start">Start date</Label>
                <Input id="pt-start" type="date" value={taskForm.startDate} className="h-11"
                  max={taskForm.dueDate || undefined}
                  onChange={(e) => setTaskForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-est">Estimated hours</Label>
                <Input id="pt-est" type="number" min="0.5" max="999" step="0.5" value={taskForm.est} className="h-11"
                  placeholder="—" onChange={(e) => setTaskForm((f) => ({ ...f, est: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pt-deps">Dependencies</Label>
              <TaskDependencyPicker
                projectId={projectId}
                value={taskForm.deps}
                onChange={(deps) => setTaskForm((f) => ({ ...f, deps }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pt-desc">Description</Label>
              <Textarea id="pt-desc" value={taskForm.description} rows={3} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional details…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button className="h-11" disabled={saving || !taskForm.title.trim()} onClick={addTask}>
              {saving ? 'Adding…' : 'Add task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* edit milestone dialog (title / description / due date / status incl. DELAYED) */}
      <Dialog open={!!msEdit} onOpenChange={(o) => { if (!o) setMsEdit(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit milestone</DialogTitle>
            <DialogDescription>Update the checkpoint details.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-edit-title">Title *</Label>
              <Input
                id="ms-edit-title"
                value={msEdit?.title ?? ''}
                className="h-11"
                onChange={(e) => setMsEdit((f) => (f ? { ...f, title: e.target.value } : f))}
                placeholder="e.g. Public beta launch"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-edit-desc">Description</Label>
              <Textarea
                id="ms-edit-desc"
                value={msEdit?.description ?? ''}
                rows={2}
                onChange={(e) => setMsEdit((f) => (f ? { ...f, description: e.target.value } : f))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ms-edit-due">Due date</Label>
                <Input
                  id="ms-edit-due"
                  type="date"
                  value={msEdit?.dueDate ?? ''}
                  className="h-11"
                  onChange={(e) => setMsEdit((f) => (f ? { ...f, dueDate: e.target.value } : f))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ms-edit-status">Status</Label>
                <Select
                  value={msEdit?.status ?? 'PENDING'}
                  onValueChange={(v) => setMsEdit((f) => (f ? { ...f, status: v } : f))}
                >
                  <SelectTrigger id="ms-edit-status" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(MILESTONE_STATUS_LABELS).map((s) => (
                      <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11" onClick={() => setMsEdit(null)}>Cancel</Button>
            <Button className="h-11" disabled={saving || !msEdit?.title.trim()} onClick={() => void saveMsEdit()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* task detail dialog with milestone context */}
      <TaskDetailDialog
        task={dialogTask}
        open={detailTaskOpen}
        onOpenChange={setDetailTaskOpen}
        onUpdated={applyTaskUpdate}
        onDeleted={handleTaskDeleted}
        employees={employees.data?.items}
        projects={[{ id: p.id, name: p.name, color: p.color }]}
        milestones={milestoneOptions}
        columns={boardColumns}
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
