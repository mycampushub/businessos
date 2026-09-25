'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { money, fmtDate, dueLabel, DEAL_STATUS_LABELS, DEAL_STATUS_TONE } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { KanbanBoard, type KanbanColumnDef } from '@/components/app/kanban'
import { AddColumnDialog, ColumnMenu, type CrudColumn } from './shared/board-column-crud'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Banknote, CalendarDays, FolderKanban, Handshake, Pencil, Plus, Target, Trash2, TrendingUp, Trophy, XCircle,
} from 'lucide-react'

// ---------- local types ----------

interface DealItem {
  id: string
  name: string
  value: number
  companyId: string | null
  companyName: string | null
  contactId: string | null
  contactName: string | null
  stageId: string | null
  stageName: string | null
  probability: number
  expectedCloseDate: string | null
  status: 'OPEN' | 'WON' | 'LOST'
  ownerMembershipId: string | null
  ownerName: string | null
  clientId: string | null
  clientName: string | null
  projectId: string | null
  notes: string | null
  wonAt: string | null
  createdAt: string
}

interface StageItem { id: string; name: string; order: number; isTerminalWon: boolean; isTerminalLost: boolean }

interface CompanyLite { id: string; name: string }
interface ContactLite { id: string; name: string; companyId: string | null }
interface ProjectLite { id: string; name: string }

interface DealForm {
  name: string
  value: string
  companyId: string
  contactId: string
  stageId: string
  projectId: string
  probability: string
  expectedCloseDate: string
  notes: string
}

const EMPTY_FORM: DealForm = { name: '', value: '', companyId: '', contactId: '', stageId: '', projectId: '', probability: '20', expectedCloseDate: '', notes: '' }

const STAGE_CRUD_LABELS = {
  boardName: 'stage',
  noun: 'deal',
  done: 'Won stage',
  rejected: 'Lost stage',
  addTitle: 'Add stage',
} as const

function CloseChip({ deal }: { deal: DealItem }) {
  const due = dueLabel(deal.expectedCloseDate)
  return (
    <span className={due.overdue ? 'text-[10px] font-medium text-rose-600 dark:text-rose-400' : 'text-[10px] text-muted-foreground'}>
      {due.text}
    </span>
  )
}

export default function CrmDealsView() {
  const { org, role, can } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const canManage = role === 'OWNER' || role === 'ADMIN'
  // pipeline-stage CRUD is gated by the crm-deals module (OWNER/ADMIN/MANAGER full by default)
  const canManageStages = can('crm-deals')

  const { data, loading, error, refresh } = useData<{ items: DealItem[]; stages: StageItem[] }>('/api/crm/deals')
  const items = data?.items ?? []
  // project names for the linked-project chip/row (graceful when projects are not visible)
  const projectsQ = useData<{ items: ProjectLite[] }>('/api/projects')
  const projectNameOf = useMemo(() => {
    const m = new Map((projectsQ.data?.items ?? []).map((p) => [p.id, p.name]))
    return (id: string | null): string | null => (id ? m.get(id) ?? null : null)
  }, [projectsQ.data])
  const stages = useMemo(
    () => [...(data?.stages ?? [])].sort((a, b) => a.order - b.order),
    [data?.stages]
  )
  const stageOf = useMemo(() => {
    const m = new Map<string, StageItem>()
    for (const s of stages) m.set(s.id, s)
    return (id: string | null): StageItem | undefined => (id ? m.get(id) : undefined)
  }, [stages])
  // terminal via stage flags first (a deal dragged into a won/lost-flagged stage), else the deal status
  const won = useMemo(() => items.filter((d) => stageOf(d.stageId)?.isTerminalWon || d.status === 'WON'), [items, stageOf])
  const lost = useMemo(() => items.filter((d) => stageOf(d.stageId)?.isTerminalLost || d.status === 'LOST'), [items, stageOf])
  const open = useMemo(
    () => items.filter((d) => d.status === 'OPEN' && !stageOf(d.stageId)?.isTerminalWon && !stageOf(d.stageId)?.isTerminalLost),
    [items, stageOf]
  )

  // form support data (only fetched while the create dialog is open)
  const [formOpen, setFormOpen] = useState(false)
  const companiesQ = useData<{ items: CompanyLite[] }>(formOpen ? '/api/crm/companies' : null)
  const contactsQ = useData<{ items: ContactLite[] }>(formOpen ? '/api/crm/contacts' : null)

  // stats
  const stats = useMemo(() => ({
    openValue: open.reduce((s, d) => s + d.value, 0),
    weighted: open.reduce((s, d) => s + (d.value * d.probability) / 100, 0),
    wonCount: won.length,
    wonValue: won.reduce((s, d) => s + d.value, 0),
  }), [open, won])

  // dialogs
  const [detail, setDetail] = useState<DealItem | null>(null)
  const [form, setForm] = useState<DealForm>(EMPTY_FORM)
  const [editing, setEditing] = useState<DealItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<{ kind: 'won' | 'lost' | 'delete'; deal: DealItem } | null>(null)
  const [busy, setBusy] = useState(false)
  const [addStageOpen, setAddStageOpen] = useState(false)

  const contactOptions = useMemo(() => {
    const all = contactsQ.data?.items ?? []
    return form.companyId ? all.filter((c) => c.companyId === form.companyId) : all
  }, [contactsQ.data, form.companyId])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, stageId: stages[0]?.id ?? '', probability: '20' })
    setFormOpen(true)
  }

  function openEdit(deal: DealItem) {
    setEditing(deal)
    setForm({
      name: deal.name,
      value: String(deal.value),
      companyId: deal.companyId ?? '',
      contactId: deal.contactId ?? '',
      stageId: deal.stageId ?? '',
      projectId: deal.projectId ?? '__none',
      probability: String(deal.probability),
      expectedCloseDate: deal.expectedCloseDate?.slice(0, 10) ?? '',
      notes: deal.notes ?? '',
    })
    setFormOpen(true)
  }

  async function saveDeal() {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', description: 'Please give the deal a name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        // linked project: only sent when it changed (null = unlink the deal)
        const projectChanged = form.projectId !== (editing.projectId ?? '__none')
        await api(`/api/crm/deals/${editing.id}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            value: form.value === '' ? 0 : Number(form.value),
            probability: form.probability === '' ? undefined : Number(form.probability),
            expectedCloseDate: form.expectedCloseDate || null, // null clears on PATCH
            notes: form.notes,
            ...(projectChanged ? { projectId: form.projectId === '__none' ? null : form.projectId } : {}),
          },
        })
        toast({ title: 'Deal updated', description: `${form.name} was saved.` })
      } else {
        await api('/api/crm/deals', {
          method: 'POST',
          body: {
            name: form.name,
            value: form.value === '' ? 0 : Number(form.value),
            companyId: form.companyId || undefined,
            contactId: form.contactId || undefined,
            stageId: form.stageId || undefined,
            probability: form.probability === '' ? 20 : Number(form.probability),
            expectedCloseDate: form.expectedCloseDate || undefined,
            notes: form.notes,
          },
        })
        toast({ title: 'Deal created', description: `${form.name} added to the pipeline.` })
      }
      setFormOpen(false)
      setDetail(null)
      refresh()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function moveDeal(deal: DealItem, stageId: string) {
    const stageName = stages.find((s) => s.id === stageId)?.name ?? 'new stage'
    try {
      await api(`/api/crm/deals/${deal.id}`, { method: 'PATCH', body: { stageId } })
      toast({ title: 'Deal moved', description: `${deal.name} → ${stageName}` })
      refresh()
    } catch {
    }
  }

  async function runConfirm() {
    if (!confirming) return
    const { kind, deal } = confirming
    setConfirming(null)
    setBusy(true)
    try {
      if (kind === 'won') {
        await api(`/api/crm/deals/${deal.id}`, { method: 'PATCH', body: { status: 'WON' } })
        toast({ title: 'Deal won — client record created', description: `${deal.name} closed at ${money(deal.value, cur)}. Client + project kickoff flow is ready.` })
      } else if (kind === 'lost') {
        await api(`/api/crm/deals/${deal.id}`, { method: 'PATCH', body: { status: 'LOST' } })
        toast({ title: 'Deal marked lost', description: `${deal.name} moved to the lost column.` })
      } else {
        await api(`/api/crm/deals/${deal.id}`, { method: 'DELETE' })
        toast({ title: 'Deal deleted', description: `${deal.name} was removed.` })
      }
      setDetail(null)
      refresh()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  const columns: KanbanColumnDef[] = stages.map((s) => ({
    id: s.id,
    title: s.name,
    isDone: s.isTerminalWon,
    isRejected: s.isTerminalLost,
  }))
  const setF = (k: keyof DealForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  // ---------- pipeline stage CRUD ----------

  function crudStages(): CrudColumn[] {
    const counts = new Map<string, number>()
    for (const d of items) {
      const sid = d.stageId ?? stages[0]?.id
      if (sid) counts.set(sid, (counts.get(sid) ?? 0) + 1)
    }
    return stages.map((s) => ({
      id: s.id,
      title: s.name,
      color: null,
      isDone: s.isTerminalWon,
      isRejected: s.isTerminalLost,
      cardCount: counts.get(s.id) ?? 0,
    }))
  }

  const stageHandlers = {
    rename: async (col: CrudColumn, label: string) => {
      await api(`/api/crm/stages/${col.id}`, { method: 'PATCH', body: { name: label } })
      toast({ title: 'Stage renamed', description: `Now called “${label}”.` })
      refresh()
    },
    move: async (col: CrudColumn, direction: 'left' | 'right') => {
      await api(`/api/crm/stages/${col.id}`, { method: 'PATCH', body: { direction } })
      refresh()
    },
    toggleDone: async (col: CrudColumn, next: boolean) => {
      await api(`/api/crm/stages/${col.id}`, { method: 'PATCH', body: { isTerminalWon: next } })
      toast({ title: next ? 'Won stage enabled' : 'Won stage disabled', description: `“${col.title}” ${next ? 'now closes deals as won' : 'no longer closes deals as won'}.` })
      refresh()
    },
    toggleRejected: async (col: CrudColumn, next: boolean) => {
      await api(`/api/crm/stages/${col.id}`, { method: 'PATCH', body: { isTerminalLost: next } })
      toast({ title: next ? 'Lost stage enabled' : 'Lost stage disabled', description: `“${col.title}” ${next ? 'now closes deals as lost' : 'no longer closes deals as lost'}.` })
      refresh()
    },
    delete: async (col: CrudColumn, moveToId: string) => {
      const res = await api<{ moved: number }>(`/api/crm/stages/${col.id}?moveTo=${moveToId}`, { method: 'DELETE' })
      toast({ title: `Stage deleted — ${res.moved} deal${res.moved === 1 ? '' : 's'} moved` })
      refresh()
    },
  }

  const addStage = async (draft: { label: string; color: string | null; isDone: boolean; isRejected: boolean }) => {
    await api('/api/crm/stages', {
      method: 'POST',
      body: { name: draft.label, isTerminalWon: draft.isDone, isTerminalLost: draft.isRejected },
    })
    toast({ title: 'Stage added', description: `“${draft.label}” is at the end of the pipeline.` })
    refresh()
  }

  // H4-fe: surface API errors explicitly instead of falling through to the
  // "No deals yet" empty state (which is misleading when the request failed).
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          icon={Handshake}
          title="Deals"
          description="Drag deals through the pipeline — winning one creates the client record."
          actions={canManage ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> New deal
            </Button>
          ) : undefined}
        />
        <EmptyState icon={Handshake} title="Couldn't load deals" description={error} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Handshake}
        title="Deals"
        description="Drag deals through the pipeline — winning one creates the client record."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> New deal
            </Button>
          ) : undefined
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Open pipeline" value={money(stats.openValue, cur, true)} icon={Target} tone="info" sub={`${open.length} open deals`} loading={loading} />
        <StatCard label="Weighted forecast" value={money(stats.weighted, cur, true)} icon={TrendingUp} sub="Σ value × probability" loading={loading} />
        <StatCard label="Won" value={stats.wonCount} icon={Trophy} tone="success" loading={loading} />
        <StatCard label="Won value" value={money(stats.wonValue, cur, true)} icon={Banknote} tone="success" loading={loading} />
      </div>

      {/* ---------- pipeline board ---------- */}
      <section aria-label="Deal pipeline" className="flex flex-col gap-4">
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="w-72 shrink-0 py-0 md:w-80">
                <CardContent className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stages.length === 0 || items.length === 0 ? (
          <EmptyState
            icon={Target}
            title={items.length === 0 ? 'No deals yet' : 'Pipeline is clear'}
            description={items.length === 0 ? 'Create your first deal to start tracking the pipeline.' : 'All deals are closed — add a new opportunity.'}
            action={canManage ? <Button variant="outline" onClick={openCreate}><Plus className="size-4" aria-hidden /> New deal</Button> : undefined}
          />
        ) : (
          <KanbanBoard
            columns={columns}
            items={open}
            columnOf={(d) => d.stageId ?? stages[0]?.id ?? ''}
            onMove={(d, colId) => void moveDeal(d, colId)}
            onCardClick={(d) => setDetail(d)}
            renderColumnMenu={
              canManageStages
                ? (col) => {
                    const crudCols = crudStages()
                    const idx = stages.findIndex((s) => s.id === col.id)
                    const crud = crudCols.find((c) => c.id === col.id)
                    if (!crud) return null
                    return (
                      <ColumnMenu
                        col={crud}
                        siblings={crudCols}
                        isFirst={idx <= 0}
                        isLast={idx >= crudCols.length - 1}
                        isOnly={crudCols.length <= 1}
                        labels={STAGE_CRUD_LABELS}
                        handlers={stageHandlers}
                      />
                    )
                  }
                : undefined
            }
            onAddColumn={canManageStages ? () => setAddStageOpen(true) : undefined}
            addColumnLabel="Add stage"
            renderCard={(d) => (
              <div className="rounded-lg border bg-background p-3 shadow-xs transition-shadow hover:shadow-sm">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">{d.companyName ?? d.clientName ?? 'No company'}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold tabular-nums">{money(d.value, cur)}</span>
                  <UserAvatar name={d.ownerName} size="xs" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={d.probability} className="h-1.5 flex-1" aria-label={`Win probability ${d.probability}%`} />
                  <span className="w-8 text-right text-[10px] text-muted-foreground tabular-nums">{d.probability}%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <CloseChip deal={d} />
                  {d.contactName && <span className="truncate text-[10px] text-muted-foreground">{d.contactName}</span>}
                </div>
              </div>
            )}
          />
        )}

        {/* ---------- won / lost strips below the board ---------- */}
        {!loading && items.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {(['WON', 'LOST'] as const).map((k) => {
              const list = k === 'WON' ? won : lost
              const isWon = k === 'WON'
              return (
                <Card
                  key={k}
                  className={
                    isWon
                      ? 'border-emerald-600/30 bg-emerald-500/[0.04] py-0 dark:bg-emerald-500/[0.07]'
                      : 'py-0 opacity-80'
                  }
                >
                  <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      {isWon ? (
                        <Trophy className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      ) : (
                        <XCircle className="size-4 text-muted-foreground" aria-hidden />
                      )}
                      {isWon ? 'Won' : 'Lost'}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {list.length} · {money(list.reduce((s, d) => s + d.value, 0), cur, true)}
                    </span>
                  </CardHeader>
                  <CardContent className="px-0 pb-2">
                    {list.length === 0 ? (
                      <p className="px-4 pb-3 text-xs text-muted-foreground">No {k.toLowerCase()} deals.</p>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto">
                        {list.map((d) => (
                          <li key={d.id}>
                            <button
                              type="button"
                              onClick={() => setDetail(d)}
                              className={
                                isWon
                                  ? 'flex w-full cursor-pointer items-center gap-3 border-l-2 border-emerald-600/40 bg-emerald-500/[0.06] px-4 py-2.5 text-left transition-colors hover:bg-emerald-500/12'
                                  : 'flex w-full cursor-pointer items-center gap-3 border-l-2 border-muted-foreground/20 px-4 py-2.5 text-left transition-colors hover:bg-muted/60'
                              }
                            >
                              <UserAvatar name={d.ownerName} size="xs" className={isWon ? undefined : 'opacity-70'} />
                              <div className="min-w-0 flex-1">
                                <p className={isWon ? 'truncate text-sm font-medium' : 'truncate text-sm font-medium text-muted-foreground'}>{d.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {d.clientName ?? d.companyName ?? 'No company'}
                                  {d.wonAt ? ` · won ${fmtDate(d.wonAt)}` : ''}
                                </p>
                              </div>
                              <span className={isWon ? 'shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400' : 'shrink-0 text-sm font-medium tabular-nums text-muted-foreground'}>{money(d.value, cur)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ---------- deal detail dialog ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="min-w-0">
                    <DialogTitle className="leading-snug">{detail.name}</DialogTitle>
                    <DialogDescription className="mt-0.5">
                      {detail.companyName ?? detail.clientName ?? 'No company'}
                      {detail.contactName ? ` · ${detail.contactName}` : ''}
                    </DialogDescription>
                  </div>
                  <StatusBadge label={DEAL_STATUS_LABELS[detail.status]} tone={DEAL_STATUS_TONE[detail.status]} />
                </div>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Value</p><p className="font-semibold tabular-nums">{money(detail.value, cur)}</p></div>
                <div><p className="text-xs text-muted-foreground">Probability</p><p className="tabular-nums">{detail.probability}%</p></div>
                <div><p className="text-xs text-muted-foreground">Stage</p><p>{detail.stageName ?? '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><p>{DEAL_STATUS_LABELS[detail.status]}</p></div>
                <div><p className="text-xs text-muted-foreground">Expected close</p><p>{fmtDate(detail.expectedCloseDate)}</p></div>
                <div><p className="text-xs text-muted-foreground">Owner</p><p>{detail.ownerName ?? 'Unassigned'}</p></div>
                <div><p className="text-xs text-muted-foreground">Client</p><p>{detail.clientName ?? 'Not linked yet'}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">Linked project</p>
                  {detail.projectId ? (
                    <p className="inline-flex items-center gap-1.5">
                      <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {projectNameOf(detail.projectId) ?? 'Linked'}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Not linked</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{detail.status === 'WON' ? 'Won at' : 'Created'}</p>
                  <p>{fmtDate(detail.status === 'WON' ? detail.wonAt : detail.createdAt)}</p>
                </div>
              </div>

              {detail.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap text-sm">{detail.notes}</p>
                  </div>
                </>
              )}

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.status === 'OPEN' && canManage && (
                    <Button variant="outline" size="sm" onClick={() => setConfirming({ kind: 'lost', deal: detail })}>
                      <XCircle className="size-4" aria-hidden /> Mark lost
                    </Button>
                  )}
                  {detail.status === 'OPEN' && canManage && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirming({ kind: 'won', deal: detail })}>
                      <Trophy className="size-4" aria-hidden /> Mark won
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirming({ kind: 'delete', deal: detail })}
                    >
                      <Trash2 className="size-4" aria-hidden /> Delete
                    </Button>
                  )}
                </div>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={() => openEdit(detail)}>
                    <Pencil className="size-4" aria-hidden /> Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- create / edit dialog ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit deal' : 'New deal'}</DialogTitle>
            <DialogDescription>
              {editing ? `Update ${editing.name}.` : 'Add an opportunity to the pipeline.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="deal-name">Name *</Label>
              <Input id="deal-name" value={form.name} onChange={(e) => setF('name')(e.target.value)} placeholder="e.g. Apex Healthcare Booking Platform" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="deal-value">Value</Label>
                <Input id="deal-value" type="number" min="0" value={form.value} onChange={(e) => setF('value')(e.target.value)} placeholder="0" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="deal-probability">Probability (%)</Label>
                <Input id="deal-probability" type="number" min="0" max="100" value={form.probability} onChange={(e) => setF('probability')(e.target.value)} />
              </div>
            </div>
            {!editing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="deal-company">Company</Label>
                  <Select
                    value={form.companyId}
                    onValueChange={(v) => { setForm((f) => ({ ...f, companyId: v === '__none' ? '' : v, contactId: '' })) }}
                  >
                    <SelectTrigger id="deal-company" className="w-full"><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No company</SelectItem>
                      {(companiesQ.data?.items ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="deal-contact">Contact</Label>
                  <Select value={form.contactId} onValueChange={(v) => setF('contactId')(v === '__none' ? '' : v)} disabled={!form.companyId}>
                    <SelectTrigger id="deal-contact" className="w-full"><SelectValue placeholder={form.companyId ? 'Select contact' : 'Pick a company first'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No contact</SelectItem>
                      {contactOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {editing && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="deal-project" className="flex items-center gap-1.5">
                  <FolderKanban className="size-3.5" aria-hidden /> Linked project
                </Label>
                <Select
                  value={form.projectId}
                  onValueChange={(v) => setF('projectId')(v)}
                >
                  <SelectTrigger id="deal-project" className="w-full">
                    <SelectValue placeholder={projectsQ.loading ? 'Loading projects…' : 'No linked project'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No linked project</SelectItem>
                    {(projectsQ.data?.items ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Tie the deal to its delivery project — handy after a win, for the kickoff flow.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {!editing && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="deal-stage">Stage</Label>
                  <Select value={form.stageId} onValueChange={setF('stageId')}>
                    <SelectTrigger id="deal-stage" className="w-full"><SelectValue placeholder="Select stage" /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="deal-close" className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden /> Expected close
                </Label>
                <Input id="deal-close" type="date" value={form.expectedCloseDate} onChange={(e) => setF('expectedCloseDate')(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="deal-notes">Notes</Label>
              <Textarea id="deal-notes" rows={3} value={form.notes} onChange={(e) => setF('notes')(e.target.value)} placeholder="Scope, stakeholders, competition…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveDeal()} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create deal'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- won / lost / delete confirmations ---------- */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirming.kind === 'won'
                    ? 'Mark this deal as won?'
                    : confirming.kind === 'lost'
                      ? 'Mark this deal as lost?'
                      : 'Delete this deal?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirming.kind === 'won'
                    ? `“${confirming.deal.name}” will be closed at ${money(confirming.deal.value, cur)}. A client record will be linked (or created) so you can run the client + project kickoff flow.`
                    : confirming.kind === 'lost'
                      ? `“${confirming.deal.name}” will be moved to the lost column and its probability set to 0%. You can still view it under Closed.`
                      : `“${confirming.deal.name}” will be permanently removed from the pipeline. This cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={() => void runConfirm()}
                  className={
                    confirming.kind === 'won'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : confirming.kind === 'lost'
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-destructive text-white hover:bg-destructive/90'
                  }
                >
                  {confirming.kind === 'won' ? 'Mark won' : confirming.kind === 'lost' ? 'Mark lost' : 'Delete deal'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- add pipeline stage (stage CRUD) ---------- */}
      <AddColumnDialog
        open={addStageOpen}
        onOpenChange={setAddStageOpen}
        labels={STAGE_CRUD_LABELS}
        onCreate={addStage}
        showColor={false}
        showRejected
      />
    </div>
  )
}
