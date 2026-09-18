'use client'

import { useEffect, useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { KanbanBoard, type KanbanColumnDef } from '@/components/app/kanban'
import { AddColumnDialog, ColumnMenu, type CrudColumn } from './shared/board-column-crud'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { APPLICATION_STAGE_LABELS, APPLICATION_STAGE_TONE, APPLICATION_STAGES, relativeTime, csv } from '@/lib/format'
import type { BadgeTone } from '@/lib/format'
import { CalendarClock, CircleAlert, ClipboardList, Handshake, Mail, Phone, Search, Star, UserRoundSearch, UsersRound, XCircle, Briefcase, Sparkles } from 'lucide-react'

// ---------- local types ----------

interface Application {
  id: string
  jobId: string
  candidateName: string
  email: string
  phone: string | null
  coverLetter: string | null
  skills: string | null
  experienceYears: number | null
  stage: string
  rating: number | null
  notes: string | null
  source: string
  createdAt: string
  decidedAt: string | null
  jobTitle: string
  user: { id: string; name: string; avatarUrl: string | null } | null
}

interface Job { id: string; title: string; status: string }

/** HIRING board column (GET /api/columns?surface=HIRING) */
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

/** normalized stage option used everywhere in the view */
interface StageCol {
  key: string
  label: string
  isDone: boolean
  isRejected: boolean
  color?: string | null
}

const STAGE_CRUD_LABELS = {
  boardName: 'stage',
  noun: 'candidate',
  done: 'Hired stage',
  rejected: 'Rejected stage',
  addTitle: 'Add stage',
} as const

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return null
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rated ${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('size-3.5', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} aria-hidden />
      ))}
    </span>
  )
}

function stageTone(col: StageCol | undefined, key: string): BadgeTone {
  if (col?.isDone) return 'success'
  if (col?.isRejected) return 'muted'
  return APPLICATION_STAGE_TONE[key] ?? 'outline'
}

function stageLabel(col: StageCol | undefined, key: string): string {
  return col?.label ?? APPLICATION_STAGE_LABELS[key] ?? key
}

export default function RecruitCandidatesView() {
  const { role, nav, can } = useWorkspace()
  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'HR'
  // stage CRUD gated by the recruit-candidates module; adding a stage additionally needs OWNER/ADMIN/MANAGER server-side
  const canManageColumns = can('recruit-candidates')
  const canAddColumn = canManageColumns && (role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER')

  const [jobFilter, setJobFilter] = useState(nav.params?.jobId ?? 'all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Application | null>(null)
  const [acting, setActing] = useState(false)
  const [addStageOpen, setAddStageOpen] = useState(false)

  // keep the job filter in sync when deep-linked again from the jobs view
  const deepJobId = nav.params?.jobId
  useEffect(() => {
    if (deepJobId) setJobFilter(deepJobId)
  }, [deepJobId])

  const appsData = useData<{ items: Application[]; stages: string[] }>(
    jobFilter === 'all' ? '/api/recruitment/applications' : `/api/recruitment/applications?jobId=${jobFilter}`,
    [jobFilter],
  )
  const jobsData = useData<{ items: Job[] }>('/api/recruitment/jobs')
  // dynamic hiring board (stop using the API's static stages constant)
  const colsData = useData<{ items: ColumnItem[] }>('/api/columns?surface=HIRING')

  const applications = appsData.data?.items ?? []
  const jobs = jobsData.data?.items ?? []

  const stages: StageCol[] = useMemo(() => {
    const cols = colsData.data?.items
    if (cols?.length) {
      return cols.map((c) => ({ key: c.key, label: c.label, isDone: c.isDone, isRejected: c.isRejected, color: c.color }))
    }
    // fallback while the board loads (or if unavailable): the static vocabulary
    const fallback = (appsData.data?.stages?.length ? appsData.data.stages : [...APPLICATION_STAGES])
    return fallback.map((k) => ({ key: k, label: APPLICATION_STAGE_LABELS[k] ?? k, isDone: k === 'HIRED', isRejected: k === 'REJECTED' }))
  }, [colsData.data, appsData.data?.stages])
  const stageOf = useMemo(() => {
    const m = new Map<string, StageCol>()
    for (const s of stages) m.set(s.key, s)
    return (key: string): StageCol | undefined => m.get(key)
  }, [stages])
  const isTerminalStage = (key: string) => {
    const c = stageOf(key)
    return !!c && (c.isDone || c.isRejected)
  }

  // ---------- stats ----------
  const total = applications.length
  const interviewing = applications.filter((a) => a.stage === 'INTERVIEW' || a.stage === 'ASSESSMENT').length
  const offers = applications.filter((a) => a.stage === 'OFFER').length
  const hired = applications.filter((a) => stageOf(a.stage)?.isDone).length

  // ---------- client-side name search ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return applications
    return applications.filter(
      (a) => a.candidateName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.jobTitle.toLowerCase().includes(q),
    )
  }, [applications, search])

  // ---------- pipeline totals strip ----------
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>()
    applications.forEach((a) => m.set(a.stage, (m.get(a.stage) ?? 0) + 1))
    return m
  }, [applications])

  // ---------- actions ----------
  async function moveStage(a: Application, stage: string) {
    if (a.stage === stage) return
    if (!canManage) {
      toast({ title: 'Not allowed', description: 'Only management can move candidates through the pipeline.', variant: 'destructive' })
      return
    }
    try {
      await api(`/api/recruitment/applications/${a.id}`, { method: 'PATCH', body: { stage } })
      toast({ title: 'Stage updated', description: `${a.candidateName} → ${stageLabel(stageOf(stage), stage)}` })
      appsData.refresh()
      // keep the open dialog in sync with the new stage
      setSelected((s) => (s && s.id === a.id ? { ...s, stage } : s))
    } catch {
      // api() toasts the error
    }
  }

  async function terminalAction(a: Application, action: 'hire' | 'reject') {
    setActing(true)
    try {
      await api(`/api/recruitment/applications/${a.id}`, { method: 'PATCH', body: { action } })
      toast({
        title: action === 'hire' ? 'Candidate hired' : 'Candidate rejected',
        description: `${a.candidateName} for ${a.jobTitle}`,
      })
      appsData.refresh()
      setSelected(null)
    } catch {
      // api() toasts the error
    } finally {
      setActing(false)
    }
  }

  // ---------- stage (HIRING column) CRUD ----------

  function crudColumns(): CrudColumn[] {
    const cols = colsData.data?.items
    if (!cols?.length) return []
    const counts = new Map<string, number>()
    for (const a of applications) counts.set(a.stage, (counts.get(a.stage) ?? 0) + 1)
    return cols.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.label,
      color: c.color,
      isDone: c.isDone,
      isRejected: c.isRejected,
      cardCount: counts.get(c.key) ?? 0,
    }))
  }

  const columnHandlers = {
    rename: async (col: CrudColumn, label: string) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { label } })
      toast({ title: 'Stage renamed', description: `Now called “${label}”.` })
      colsData.refresh()
      appsData.refresh()
    },
    recolor: async (col: CrudColumn, color: string | null) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { color } })
      toast({ title: 'Stage color updated' })
      colsData.refresh()
    },
    move: async (col: CrudColumn, direction: 'left' | 'right') => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { direction } })
      colsData.refresh()
      appsData.refresh()
    },
    toggleDone: async (col: CrudColumn, next: boolean) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { isDone: next } })
      toast({ title: next ? 'Hired stage enabled' : 'Hired stage disabled', description: `“${col.title}” ${next ? 'now counts as hired' : 'no longer counts as hired'}.` })
      colsData.refresh()
      appsData.refresh()
    },
    toggleRejected: async (col: CrudColumn, next: boolean) => {
      await api(`/api/columns/${col.id}`, { method: 'PATCH', body: { isRejected: next } })
      toast({ title: next ? 'Rejected stage enabled' : 'Rejected stage disabled', description: `“${col.title}” ${next ? 'now ends the pipeline run' : 'no longer ends the pipeline run'}.` })
      colsData.refresh()
      appsData.refresh()
    },
    delete: async (col: CrudColumn, moveToId: string) => {
      const res = await api<{ moved: number }>(`/api/columns/${col.id}?moveTo=${moveToId}`, { method: 'DELETE' })
      toast({ title: `Stage deleted — ${res.moved} candidate${res.moved === 1 ? '' : 's'} moved` })
      colsData.refresh()
      appsData.refresh()
    },
  }

  const addStage = async (draft: { label: string; color: string | null; isDone: boolean; isRejected: boolean }) => {
    await api('/api/columns', {
      method: 'POST',
      body: { surface: 'HIRING', label: draft.label, color: draft.color, isDone: draft.isDone, isRejected: draft.isRejected },
    })
    toast({ title: 'Stage added', description: `“${draft.label}” is at the end of the pipeline.` })
    colsData.refresh()
    appsData.refresh()
  }

  const boardColumns: KanbanColumnDef[] = stages.map((s) => ({
    id: s.key, title: s.label, color: s.color, isDone: s.isDone, isRejected: s.isRejected,
  }))
  const crudCols = crudColumns()
  // Hire/Reject only make sense while the HIRED/REJECTED column keys still exist (server writes those literal keys)
  const hasHiredStage = stages.some((s) => s.key === 'HIRED')
  const hasRejectedStage = stages.some((s) => s.key === 'REJECTED')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ClipboardList}
        title="Candidates"
        description="Drag candidates through the hiring pipeline — applied to hired."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total candidates" value={appsData.loading ? 0 : total} sub={jobFilter !== 'all' ? 'Filtered by job' : 'All openings'} icon={UsersRound} tone="info" loading={appsData.loading} />
        <StatCard label="In interview" value={appsData.loading ? 0 : interviewing} sub="Interview + assessment" icon={CalendarClock} tone="warning" loading={appsData.loading} />
        <StatCard label="Offers" value={appsData.loading ? 0 : offers} sub="Awaiting decision" icon={Sparkles} tone="default" loading={appsData.loading} />
        <StatCard label="Hired" value={appsData.loading ? 0 : hired} sub="Closed successfully" icon={Handshake} tone="success" loading={appsData.loading} />
      </div>

      {/* Filters */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate, email, job…" className="pl-9" aria-label="Search candidates" />
          </div>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-full sm:w-[220px]" aria-label="Filter by job">
              <SelectValue placeholder="Job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.title}{j.status !== 'OPEN' ? ` (${j.status.toLowerCase()})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Pipeline totals strip */}
      {appsData.loading && !appsData.data ? null : applications.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pipeline:</span>
          {stages.map((s) => (
            <StatusBadge
              key={s.key}
              label={`${s.label} · ${stageCounts.get(s.key) ?? 0}`}
              tone={stageTone(s, s.key)}
              dot={false}
              className="text-xs"
            />
          ))}
        </div>
      ) : null}

      {/* Kanban board */}
      {appsData.loading && !appsData.data ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80 w-72 shrink-0 rounded-xl md:w-80" />)}
        </div>
      ) : appsData.error ? (
        <EmptyState icon={CircleAlert} title="Could not load candidates" description={appsData.error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title={applications.length === 0 ? 'No applications yet' : 'No candidates match'}
          description={
            applications.length === 0
              ? 'Applications from the job marketplace and your careers page will appear here.'
              : 'Try clearing the search or picking another job.'
          }
          action={applications.length > 0 ? <Button variant="outline" onClick={() => { setSearch(''); setJobFilter('all') }}>Clear filters</Button> : undefined}
        />
      ) : (
        <KanbanBoard
          columns={boardColumns}
          items={filtered}
          columnOf={(a) => a.stage}
          onMove={(a, colId) => moveStage(a, colId)}
          onCardClick={(a) => setSelected(a)}
          renderCard={(a) => <CandidateCard app={a} terminal={isTerminalStage(a.stage)} />}
          renderColumnMenu={
            canManageColumns
              ? (col) => {
                  const idx = stages.findIndex((s) => s.key === col.id)
                  const crud = crudCols.find((c) => c.key === col.id)
                  if (!crud) return null
                  return (
                    <ColumnMenu
                      col={crud}
                      siblings={crudCols}
                      isFirst={idx <= 0}
                      isLast={idx >= crudCols.length - 1}
                      isOnly={crudCols.length <= 1}
                      labels={STAGE_CRUD_LABELS}
                      handlers={columnHandlers}
                    />
                  )
                }
              : undefined
          }
          onAddColumn={canAddColumn ? () => setAddStageOpen(true) : undefined}
          addColumnLabel="Add stage"
        />
      )}

      {/* Detail dialog */}
      <CandidateDialog
        application={selected}
        canManage={canManage}
        stages={stages}
        acting={acting}
        hasHiredStage={hasHiredStage}
        hasRejectedStage={hasRejectedStage}
        onClose={() => setSelected(null)}
        onMove={moveStage}
        onTerminal={terminalAction}
      />

      {/* add stage dialog (HIRING column CRUD) */}
      <AddColumnDialog
        open={addStageOpen}
        onOpenChange={setAddStageOpen}
        labels={STAGE_CRUD_LABELS}
        onCreate={addStage}
        showColor
        showRejected
      />
    </div>
  )
}

// ---------- candidate card ----------

function CandidateCard({ app, terminal }: { app: Application; terminal: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-md', terminal && 'opacity-55')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar name={app.candidateName} size="xs" />
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-semibold', terminal && 'line-through decoration-muted-foreground/60')}>{app.candidateName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{app.jobTitle}</p>
          </div>
        </div>
        {app.user && <Badge variant="secondary" className="shrink-0 text-[10px]">Platform user</Badge>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StarRating rating={app.rating} />
          {app.experienceYears != null && (
            <Badge variant="outline" className="text-[10px]">{app.experienceYears}y exp</Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{relativeTime(app.createdAt)}</span>
      </div>
    </div>
  )
}

// ---------- candidate detail dialog ----------

function CandidateDialog({
  application, canManage, stages, acting, hasHiredStage, hasRejectedStage, onClose, onMove, onTerminal,
}: {
  application: Application | null
  canManage: boolean
  stages: StageCol[]
  acting: boolean
  hasHiredStage: boolean
  hasRejectedStage: boolean
  onClose: () => void
  onMove: (a: Application, stage: string) => Promise<void>
  onTerminal: (a: Application, action: 'hire' | 'reject') => Promise<void>
}) {
  const [hireOpen, setHireOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const open = !!application
  const col = application ? stages.find((s) => s.key === application.stage) : undefined
  const terminal = !!col && (col.isDone || col.isRejected)

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setHireOpen(false); setRejectOpen(false) } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {application && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <UserAvatar name={application.candidateName} avatarUrl={application.user?.avatarUrl ?? null} size="lg" />
                  <div className="min-w-0">
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                      <span className="truncate">{application.candidateName}</span>
                      {application.user && <Badge variant="secondary" className="text-[10px]">Platform user</Badge>}
                    </DialogTitle>
                    <DialogDescription className="truncate">
                      Applied for <strong className="font-medium">{application.jobTitle}</strong> · {relativeTime(application.createdAt)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={stageLabel(col, application.stage)} tone={stageTone(col, application.stage)} />
                <StarRating rating={application.rating} />
                {application.experienceYears != null && <Badge variant="outline" className="text-xs">{application.experienceYears} year{application.experienceYears === 1 ? '' : 's'} experience</Badge>}
                <Badge variant="outline" className="text-xs">via {application.source.toLowerCase()}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2 truncate"><Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {application.email}</div>
                <div className="flex items-center gap-2 truncate"><Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {application.phone ?? '—'}</div>
                <div className="flex items-center gap-2 truncate"><Briefcase className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {application.jobTitle}</div>
              </div>

              {csv(application.skills).length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {csv(application.skills).map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                  </div>
                </div>
              )}

              {application.coverLetter && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cover letter</h3>
                  <p className="whitespace-pre-line rounded-lg bg-muted/30 p-4 text-sm leading-relaxed">{application.coverLetter}</p>
                </div>
              )}

              {canManage && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</h3>
                  <p className={cn('rounded-lg border border-dashed p-4 text-sm', application.notes ? 'leading-relaxed' : 'text-muted-foreground')}>
                    {application.notes ?? 'No internal notes yet.'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Notes are read-only in this view and captured during intake.</p>
                </div>
              )}

              <Separator />

              {canManage ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Move to stage</Label>
                    <Select
                      value={application.stage}
                      onValueChange={(v) => { void onMove(application, v) }}
                      disabled={acting || terminal}
                    >
                      <SelectTrigger className="w-full" aria-label="Move candidate to stage"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.key} value={s.key} disabled={s.key === application.stage}>
                            {s.label}{s.key === application.stage ? ' (current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {terminal && <p className="text-[11px] text-muted-foreground">This candidate is in a terminal stage — the pipeline run is closed.</p>}
                  </div>
                  {!terminal && (hasHiredStage || hasRejectedStage) && (
                    <DialogFooter className="gap-2">
                      {hasHiredStage && (
                        <AlertDialog open={hireOpen} onOpenChange={setHireOpen}>
                          <AlertDialogTrigger asChild>
                            <Button className="bg-emerald-600 text-white hover:bg-emerald-600/90" disabled={acting}>
                              <Handshake className="mr-1.5 size-4" aria-hidden /> Hire
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hire {application.candidateName}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The candidate moves to Hired for {application.jobTitle}, managers get notified and the candidate is informed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                                onClick={() => { void onTerminal(application, 'hire') }}
                              >
                                Confirm hire
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {hasRejectedStage && (
                        <>
                          <Button
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10"
                            disabled={acting}
                            onClick={() => setRejectOpen(true)}
                          >
                            <XCircle className="mr-1.5 size-4" aria-hidden /> Reject
                          </Button>
                          <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reject {application.candidateName}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The candidate moves to Rejected for {application.jobTitle}. This ends their pipeline run — managers are notified.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => { void onTerminal(application, 'reject') }}
                                >
                                  Confirm reject
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </DialogFooter>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Pipeline actions are limited to owners, admins, managers and HR.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
