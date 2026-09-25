'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import {
  money, fmtDate, currencySymbol, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_TONE,
  LEAD_SOURCES, LEAD_SOURCE_LABELS,
} from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BadgeCheck, Banknote, Building2, ChevronDown, MoreHorizontal, Pencil, Plus, Search,
  Sparkles, Trash2, Users,
} from 'lucide-react'
import { leadSchema } from '@/lib/validations'
import { useFormErrors } from '@/lib/client/use-form-errors'

// ---------- local types ----------

interface LeadItem {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  source: string
  status: string
  value: number | null
  industry: string | null
  notes: string | null
  ownerMembershipId: string | null
  ownerName: string | null
  createdAt: string
}

interface LeadForm {
  name: string
  company: string
  email: string
  phone: string
  source: string
  value: string
  notes: string
}

const EMPTY_FORM: LeadForm = { name: '', company: '', email: '', phone: '', source: 'MANUAL', value: '', notes: '' }

export default function CrmLeadsView() {
  const { org, role } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const canManage = role === 'OWNER' || role === 'ADMIN'

  const { data, loading, error, refresh } = useData<{ items: LeadItem[] }>('/api/crm/leads')
  const items = data?.items ?? []

  // filters
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [source, setSource] = useState('ALL')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((l) => {
      if (status !== 'ALL' && l.status !== status) return false
      if (source !== 'ALL' && l.source !== source) return false
      if (!needle) return true
      return [l.name, l.company, l.email].some((f) => (f ?? '').toLowerCase().includes(needle))
    })
  }, [items, q, status, source])

  // stats
  const stats = useMemo(() => ({
    total: items.length,
    fresh: items.filter((l) => l.status === 'NEW').length,
    qualified: items.filter((l) => l.status === 'QUALIFIED').length,
    pipeline: items.reduce((s, l) => s + (l.value ?? 0), 0),
  }), [items])

  // dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LeadItem | null>(null)
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const { errors, validate, clearError, clearAll } = useFormErrors()
  const [deleting, setDeleting] = useState<LeadItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [converting, setConverting] = useState<LeadItem | null>(null)
  const [convertForm, setConvertForm] = useState({ createDeal: true, dealValue: '' })
  const [convertingBusy, setConvertingBusy] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    clearAll()
    setFormOpen(true)
  }

  function openEdit(lead: LeadItem) {
    setEditing(lead)
    setForm({
      name: lead.name,
      company: lead.company ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source,
      value: lead.value != null ? String(lead.value) : '',
      notes: lead.notes ?? '',
    })
    clearAll()
    setFormOpen(true)
  }

  async function saveLead() {
    // M14-fe: zod validation layer — existing toast fallbacks are kept
    // below as a second line of defense for fields the schema doesn't cover
    // (or for cases where the schema is intentionally permissive).
    if (!validate(leadSchema, form)) {
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' })
      return
    }
    if (!form.name.trim()) {
      toast({ title: 'Name is required', description: 'Please give the lead a name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name,
        company: form.company,
        email: form.email,
        phone: form.phone,
        source: form.source,
        value: form.value === '' ? null : Number(form.value), // null clears on PATCH, ignored on POST
        notes: form.notes,
      }
      if (editing) {
        await api(`/api/crm/leads/${editing.id}`, { method: 'PATCH', body })
        toast({ title: 'Lead updated', description: `${form.name} was saved.` })
      } else {
        await api('/api/crm/leads', { method: 'POST', body })
        toast({ title: 'Lead created', description: `${form.name} added to the pipeline.` })
      }
      setFormOpen(false)
      refresh()
    } catch {
      // api() already toasts the error
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(lead: LeadItem, next: string) {
    if (next === lead.status) return
    setBusyId(lead.id)
    try {
      await api(`/api/crm/leads/${lead.id}`, { method: 'PATCH', body: { status: next } })
      toast({
        title: `Marked ${LEAD_STATUS_LABELS[next]}`,
        description: next === 'CONVERTED' ? 'Client + project kickoff flow ready.' : `${lead.name} is now ${LEAD_STATUS_LABELS[next]}.`,
      })
      refresh()
    } catch {
    } finally {
      setBusyId(null)
    }
  }

  function openConvert(lead: LeadItem) {
    setConverting(lead)
    setConvertForm({ createDeal: true, dealValue: lead.value != null ? String(lead.value) : '' })
  }

  async function confirmConvert() {
    if (!converting) return
    const lead = converting
    setConvertingBusy(true)
    try {
      const res = await api<{ deal: { name: string; value: number; stageName: string | null } | null }>(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        body: {
          status: 'CONVERTED',
          createDeal: convertForm.createDeal,
          ...(convertForm.createDeal && convertForm.dealValue !== '' ? { dealValue: Number(convertForm.dealValue) } : {}),
        },
      })
      toast({
        title: res.deal ? 'Lead converted — deal created' : 'Lead converted',
        description: res.deal
          ? `"${res.deal.name}" opened in the pipeline at ${money(res.deal.value, cur)}${res.deal.stageName ? ` (${res.deal.stageName})` : ''}.`
          : `${lead.name} is marked converted.`,
      })
      setConverting(null)
      refresh()
    } catch {
      // api() already toasts the error
    } finally {
      setConvertingBusy(false)
    }
  }

  async function deleteLead() {
    if (!deleting) return
    const lead = deleting
    setDeleting(null)
    try {
      await api(`/api/crm/leads/${lead.id}`, { method: 'DELETE' })
      // M15-fe: undo toast — soft-delete allows restore within 5s
      toast({
        title: 'Lead deleted',
        description: `${lead.name} was removed.`,
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            api(`/api/crm/leads/${lead.id}/restore`, { method: 'POST', silent: true })
              .then(() => { toast({ title: 'Lead restored' }); refresh() })
              .catch(() => toast({ title: 'Could not restore', variant: 'destructive' }))
          },
        },
      })
      refresh()
    } catch {
    }
  }

  const setF = (k: keyof LeadForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    clearError(k)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Users}
        title="Leads"
        description="Capture inbound interest and qualify it into pipeline opportunities."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> New lead
            </Button>
          ) : undefined
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total leads" value={stats.total} icon={Users} loading={loading} />
        <StatCard label="New" value={stats.fresh} icon={Sparkles} tone="info" loading={loading} />
        <StatCard label="Qualified" value={stats.qualified} icon={BadgeCheck} tone="warning" loading={loading} />
        <StatCard
          label="Total pipeline value"
          value={money(stats.pipeline, cur, true)}
          icon={Banknote}
          tone="success"
          sub={`${items.filter((l) => l.value).length} valued leads`}
          loading={loading}
        />
      </div>

      {/* filter bar */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company or email…"
              className="pl-9"
              aria-label="Search leads"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:w-auto">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filter by source">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sources</SelectItem>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* table */}
      {loading ? (
        <Card className="py-0">
          <CardContent className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <EmptyState icon={Search} title="Couldn't load leads" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={items.length === 0 ? 'No leads yet' : 'No leads match your filters'}
          description={
            items.length === 0
              ? 'Start capturing prospects — website enquiries, referrals, event contacts.'
              : 'Try clearing the search or filters.'
          }
          action={
            items.length === 0 && canManage ? (
              <Button variant="outline" onClick={openCreate}>
                <Plus className="size-4" aria-hidden /> Add your first lead
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-background">
                  <TableHead className="min-w-44">Lead</TableHead>
                  <TableHead className="min-w-48">Contact</TableHead>
                  <TableHead className="min-w-32">Source</TableHead>
                  <TableHead className="min-w-36">Status</TableHead>
                  <TableHead className="min-w-28 text-right">Value</TableHead>
                  <TableHead className="min-w-40">Owner</TableHead>
                  <TableHead className="min-w-28">Created</TableHead>
                  {canManage && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={busyId === lead.id ? 'opacity-50' : undefined}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={lead.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{lead.name}</p>
                          {lead.company && <p className="truncate text-xs text-muted-foreground">{lead.company}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {lead.email ? (
                          <p className="truncate">{lead.email}</p>
                        ) : (
                          <p className="text-muted-foreground">No email</p>
                        )}
                        {lead.phone && <p className="truncate text-xs text-muted-foreground">{lead.phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</span>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="inline-flex cursor-pointer items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                              disabled={busyId === lead.id}
                              aria-label={`Change status of ${lead.name}`}
                            >
                              <StatusBadge label={LEAD_STATUS_LABELS[lead.status] ?? lead.status} tone={LEAD_STATUS_TONE[lead.status]} />
                              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Change status</DropdownMenuLabel>
                            {LEAD_STATUSES.map((s) => (
                              <DropdownMenuItem key={s} onClick={() => void changeStatus(lead, s)} disabled={s === lead.status}>
                                {LEAD_STATUS_LABELS[s]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <StatusBadge label={LEAD_STATUS_LABELS[lead.status] ?? lead.status} tone={LEAD_STATUS_TONE[lead.status]} />
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {lead.value != null ? money(lead.value, cur) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={lead.ownerName} size="xs" />
                        <span className="truncate text-sm">{lead.ownerName ?? 'Unassigned'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(lead.createdAt)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${lead.name}`}>
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(lead)}>
                              <Pencil className="size-4" aria-hidden /> Edit
                            </DropdownMenuItem>
                            {lead.status !== 'CONVERTED' && (
                              <DropdownMenuItem onClick={() => openConvert(lead)}>
                                <Building2 className="size-4" aria-hidden /> Convert to company
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(lead)}>
                              <Trash2 className="size-4" aria-hidden /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} leads
          </div>
        </Card>
      )}

      {/* create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit lead' : 'New lead'}</DialogTitle>
            <DialogDescription>
              {editing ? `Update details for ${editing.name}.` : 'Capture a new prospect for the pipeline.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-name">Name *</Label>
              <Input
                id="lead-name"
                value={form.name}
                onChange={(e) => setF('name')(e.target.value)}
                placeholder="e.g. Zaman Khan"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'lead-name-error' : undefined}
              />
              {errors.name && <p id="lead-name-error" className="text-xs text-destructive" role="alert">{errors.name}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-company">Company</Label>
                <Input
                  id="lead-company"
                  value={form.company}
                  onChange={(e) => setF('company')(e.target.value)}
                  placeholder="e.g. UrbanCart"
                  aria-invalid={!!errors.company}
                  aria-describedby={errors.company ? 'lead-company-error' : undefined}
                />
                {errors.company && <p id="lead-company-error" className="text-xs text-destructive" role="alert">{errors.company}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-source">Source</Label>
                <Select value={form.source} onValueChange={setF('source')}>
                  <SelectTrigger
                    id="lead-source"
                    className="w-full"
                    aria-invalid={!!errors.source}
                    aria-describedby={errors.source ? 'lead-source-error' : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.source && <p id="lead-source-error" className="text-xs text-destructive" role="alert">{errors.source}</p>}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setF('email')(e.target.value)}
                  placeholder="name@company.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'lead-email-error' : undefined}
                />
                {errors.email && <p id="lead-email-error" className="text-xs text-destructive" role="alert">{errors.email}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone"
                  value={form.phone}
                  onChange={(e) => setF('phone')(e.target.value)}
                  placeholder="+880…"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'lead-phone-error' : undefined}
                />
                {errors.phone && <p id="lead-phone-error" className="text-xs text-destructive" role="alert">{errors.phone}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-value">Estimated value ({currencySymbol(cur)})</Label>
              <Input
                id="lead-value"
                type="number"
                min="0"
                value={form.value}
                onChange={(e) => setF('value')(e.target.value)}
                placeholder="0"
                aria-invalid={!!errors.value}
                aria-describedby={errors.value ? 'lead-value-error' : undefined}
              />
              {errors.value && <p id="lead-value-error" className="text-xs text-destructive" role="alert">{errors.value}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea
                id="lead-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setF('notes')(e.target.value)}
                placeholder="Context, requirements, follow-ups…"
                aria-invalid={!!errors.notes}
                aria-describedby={errors.notes ? 'lead-notes-error' : undefined}
              />
              {errors.notes && <p id="lead-notes-error" className="text-xs text-destructive" role="alert">{errors.notes}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveLead()} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create lead'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* convert dialog — status flip + optional pipeline deal */}
      <Dialog open={!!converting} onOpenChange={(o) => { if (!o) setConverting(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert “{converting?.name}”?</DialogTitle>
            <DialogDescription>
              The lead will be marked converted{converting?.company ? ` and linked to ${converting.company}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="lead-create-deal" className="text-sm">Create deal in pipeline</Label>
                <p className="text-xs text-muted-foreground">Open an opportunity for this lead right away.</p>
              </div>
              <Switch
                id="lead-create-deal"
                checked={convertForm.createDeal}
                onCheckedChange={(v) => setConvertForm((f) => ({ ...f, createDeal: v }))}
                aria-label="Create deal in pipeline"
              />
            </div>
            {convertForm.createDeal && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-deal-value">Deal value ({currencySymbol(cur)})</Label>
                <Input
                  id="lead-deal-value"
                  type="number"
                  min="0"
                  value={convertForm.dealValue}
                  onChange={(e) => setConvertForm((f) => ({ ...f, dealValue: e.target.value }))}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">Prefilled from the lead's estimated value.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConverting(null)}>Cancel</Button>
            <Button disabled={convertingBusy} onClick={() => void confirmConvert()}>
              {convertingBusy ? 'Converting…' : 'Convert lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}”{deleting?.company ? ` (${deleting.company})` : ''} will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteLead()} className="bg-destructive text-white hover:bg-destructive/90">
              Delete lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
