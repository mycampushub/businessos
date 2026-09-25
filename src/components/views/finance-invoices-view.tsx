'use client'

import { useEffect, useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import {
  money, currencySymbol, fmtDate, todayStr, INVOICE_STATUSES, INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE,
} from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle, Ban, CalendarDays, CheckCircle2, Clock, FileText, Pencil, Plus, Receipt, Search, Send, Trash2, X,
} from 'lucide-react'
import { invoiceSchema } from '@/lib/validations'
import { useFormErrors } from '@/lib/client/use-form-errors'

// ---------- local types ----------

interface InvoiceLine { description: string; qty: number; rate: number }

interface InvoiceItem {
  id: string
  number: string
  clientId: string
  clientName: string | null
  issueDate: string
  dueDate: string
  status: string
  items: InvoiceLine[]
  subtotal: number
  taxRate: number
  taxAmount: number
  discount: number
  total: number
  notes: string | null
  projectId: string | null
  paidAt: string | null
  createdAt: string
}

interface ClientLite { id: string; name: string }

interface LineForm { description: string; qty: string; rate: string }
interface InvoiceForm {
  clientId: string
  number: string
  issueDate: string
  dueDate: string
  items: LineForm[]
  taxRate: string
  discount: string
  notes: string
}

const ACTIVE_STATUSES = ['SENT', 'VIEWED', 'PARTIALLY_PAID']

function isPast(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now()
}

/** Suggest the next invoice number, continuing the highest existing sequence (e.g. MER-INV-2025-012). */
function suggestNumber(items: InvoiceItem[]): string {
  let year = 0
  let seq = 0
  for (const inv of items) {
    const m = /^[A-Za-z]+-INV-(\d{4})-(\d+)$/.exec(inv.number.trim())
    if (!m) continue
    const y = Number(m[1])
    const n = Number(m[2])
    if (y > year || (y === year && n > seq)) { year = y; seq = n }
  }
  if (year === 0) { year = new Date().getFullYear(); seq = 0 }
  return `MER-INV-${year}-${String(seq + 1).padStart(3, '0')}`
}

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FinanceInvoicesView() {
  const { org, role } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'FINANCE'

  // H6-fe: paginated "Load more" pattern — replace the old single-shot
  // fetch (which returned every invoice at once) with offset pagination.
  const PAGE_SIZE = 25
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [hasMore, setHasMore] = useState(true)
  const { data, loading, error, refresh } = useData<{ items: InvoiceItem[] }>(
    `/api/finance/invoices?limit=${PAGE_SIZE}&offset=${offset}`
  )

  // Append (or replace on offset=0) whenever a fresh page arrives. Dedupe
  // by id so refresh can't sneak a duplicate in. Only depends on `data`
  // (not `offset`) — see the parallel note in my-tasks-view.
  useEffect(() => {
    if (!data) return
    setItems((prev) => {
      if (offset === 0) return data.items
      const seen = new Set(prev.map((i) => i.id))
      return [...prev, ...data.items.filter((i) => !seen.has(i.id))]
    })
    setHasMore(data.items.length >= PAGE_SIZE)
  }, [data])

  function loadMore() {
    setOffset((o) => o + PAGE_SIZE)
  }

  // Any refresh (create/edit/status change/delete) resets to page 1 so the
  // entire accumulated list is re-fetched from scratch.
  function refreshAll() {
    if (offset === 0) {
      refresh()
    } else {
      setOffset(0)
    }
  }

  // filters
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((inv) => {
      if (status !== 'ALL' && inv.status !== status) return false
      if (!needle) return true
      return [inv.number, inv.clientName].some((f) => (f ?? '').toLowerCase().includes(needle))
    })
  }, [items, q, status])

  // stats (same semantics as /api/finance/summary)
  const stats = useMemo(() => {
    const paid = items.filter((i) => i.status === 'PAID')
    const active = items.filter((i) => ACTIVE_STATUSES.includes(i.status))
    const overdue = items.filter((i) => i.status === 'OVERDUE' || (ACTIVE_STATUSES.includes(i.status) && isPast(i.dueDate)))
    const outstanding = active.filter((i) => !overdue.includes(i))
    const draft = items.filter((i) => i.status === 'DRAFT')
    const sum = (arr: InvoiceItem[]) => arr.reduce((s, i) => s + i.total, 0)
    return { paid, outstanding, overdue, draft, paidV: sum(paid), outV: sum(outstanding), odV: sum(overdue) }
  }, [items])

  // create/edit dialog (one shared form, mode-driven submit)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const clientsQ = useData<{ items: ClientLite[] }>(formOpen ? '/api/crm/clients' : null)
  const [form, setForm] = useState<InvoiceForm>({
    clientId: '', number: '', issueDate: todayStr(), dueDate: plusDays(14),
    items: [{ description: '', qty: '1', rate: '' }], taxRate: '0', discount: '0', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const { errors, validate, clearError, clearAll } = useFormErrors()

  // detail dialog
  const [detail, setDetail] = useState<InvoiceItem | null>(null)
  const [confirming, setConfirming] = useState<{ kind: 'cancel' | 'delete'; inv: InvoiceItem } | null>(null)
  const [busy, setBusy] = useState(false)

  const liveTotals = useMemo(() => {
    const subtotal = form.items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)
    const taxAmount = (subtotal * (Number(form.taxRate) || 0)) / 100
    const total = subtotal + taxAmount - (Number(form.discount) || 0)
    return { subtotal, taxAmount, total }
  }, [form])

  function openCreate() {
    setFormMode('create')
    setEditingId(null)
    setForm({
      clientId: '', number: suggestNumber(items), issueDate: todayStr(), dueDate: plusDays(14),
      items: [{ description: '', qty: '1', rate: '' }], taxRate: '0', discount: '0', notes: '',
    })
    clearAll()
    setFormOpen(true)
  }

  /** Pre-fill the shared form with an existing DRAFT invoice and switch to edit mode. */
  function openEdit(inv: InvoiceItem) {
    setFormMode('edit')
    setEditingId(inv.id)
    setForm({
      clientId: inv.clientId,
      number: inv.number,
      issueDate: inv.issueDate.slice(0, 10),
      dueDate: inv.dueDate.slice(0, 10),
      items:
        inv.items.length > 0
          ? inv.items.map((l) => ({ description: l.description, qty: String(l.qty), rate: String(l.rate) }))
          : [{ description: '', qty: '1', rate: '' }],
      taxRate: String(inv.taxRate ?? 0),
      discount: String(inv.discount ?? 0),
      notes: inv.notes ?? '',
    })
    clearAll()
    setDetail(null)
    setFormOpen(true)
  }

  function setLine(idx: number, patch: Partial<LineForm>) {
    setForm((f) => ({ ...f, items: f.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }))
    clearError('items')
  }

  async function submitInvoice() {
    // M14-fe: zod validation layer. The form filters empty line rows
    // *before* validating so the schema sees only the items that will
    // actually be submitted to the API — `items: min(1)` then surfaces
    // "Add at least one line item" as an inline error under the items
    // section instead of a generic toast.
    const lines = form.items.filter((l) => l.description.trim())
    if (!validate(invoiceSchema, { ...form, items: lines })) {
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' })
      return
    }
    // Existing toast fallbacks (kept as a second line of defense).
    if (!form.clientId) {
      toast({ title: 'Client is required', description: 'Select the client being billed.', variant: 'destructive' })
      return
    }
    if (!form.number.trim()) {
      toast({ title: 'Invoice number is required', variant: 'destructive' })
      return
    }
    if (lines.length === 0) {
      toast({ title: 'Add a line item', description: 'At least one item with a description is required.', variant: 'destructive' })
      return
    }
    if (!form.dueDate) {
      toast({ title: 'Due date is required', variant: 'destructive' })
      return
    }
    if (form.issueDate && form.dueDate < form.issueDate) {
      toast({ title: 'Due date must be on or after the issue date', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        clientId: form.clientId,
        number: form.number,
        issueDate: form.issueDate || undefined,
        dueDate: form.dueDate,
        items: lines.map((l) => ({ description: l.description, qty: Number(l.qty) || 0, rate: Number(l.rate) || 0 })),
        taxRate: Number(form.taxRate) || 0,
        discount: Number(form.discount) || 0,
        notes: form.notes,
      }
      if (formMode === 'edit' && editingId) {
        await api(`/api/finance/invoices/${editingId}`, { method: 'PATCH', body: payload })
        toast({ title: 'Invoice updated', description: `${form.number} saved.` })
      } else {
        await api('/api/finance/invoices', { method: 'POST', body: payload })
        toast({ title: 'Invoice created', description: `${form.number} saved as draft.` })
      }
      setFormOpen(false)
      refreshAll()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function setStatusOf(inv: InvoiceItem, next: string) {
    setBusy(true)
    try {
      await api(`/api/finance/invoices/${inv.id}`, { method: 'PATCH', body: { status: next } })
      toast({
        title: `Invoice ${next === 'SENT' ? 'sent' : next === 'PAID' ? 'marked paid' : 'cancelled'}`,
        description: `${inv.number} · ${money(inv.total, cur)}`,
      })
      setDetail(next === 'CANCELLED' ? null : { ...inv, status: next })
      refreshAll()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!confirming) return
    const { kind, inv } = confirming
    setConfirming(null)
    setBusy(true)
    try {
      if (kind === 'cancel') {
        await api(`/api/finance/invoices/${inv.id}`, { method: 'PATCH', body: { status: 'CANCELLED' } })
        toast({ title: 'Invoice cancelled', description: `${inv.number} was cancelled.` })
        setDetail(null)
      } else {
        await api(`/api/finance/invoices/${inv.id}`, { method: 'DELETE' })
        // M15-fe: undo toast
        toast({
          title: 'Invoice deleted',
          description: `${inv.number} was removed.`,
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              api(`/api/finance/invoices/${inv.id}/restore`, { method: 'POST', silent: true })
                .then(() => { toast({ title: 'Invoice restored' }); refreshAll() })
                .catch(() => toast({ title: 'Could not restore', variant: 'destructive' }))
            },
          },
        })
        setDetail(null)
      }
      refreshAll()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Receipt}
        title="Invoices"
        description="Bill clients and track payment status."
        actions={canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden /> New invoice
          </Button>
        ) : undefined}
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Paid" value={money(stats.paidV, cur, true)} icon={CheckCircle2} tone="success" sub={`${stats.paid.length} invoices`} loading={loading} />
        <StatCard label="Outstanding" value={money(stats.outV, cur, true)} icon={Clock} tone="warning" sub={`${stats.outstanding.length} awaiting payment`} loading={loading} />
        <StatCard label="Overdue" value={money(stats.odV, cur, true)} icon={AlertTriangle} tone="danger" sub={`${stats.overdue.length} past due`} loading={loading} />
        <StatCard label="Draft" value={stats.draft.length} icon={FileText} tone="default" sub={`${money(stats.draft.reduce((s, i) => s + i.total, 0), cur, true)} unbilled`} loading={loading} />
      </div>

      {/* filters */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or client…" className="pl-9" aria-label="Search invoices" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {INVOICE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* table */}
      {loading && items.length === 0 ? (
        <Card className="py-0">
          <CardContent className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : error && items.length === 0 ? (
        <EmptyState icon={Receipt} title="Couldn't load invoices" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={items.length === 0 ? 'No invoices yet' : 'No invoices match your filters'}
          description={items.length === 0 ? 'Create your first invoice to start billing clients.' : 'Try clearing the search or status filter.'}
          action={items.length === 0 && canManage ? (
            <Button variant="outline" onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> Create invoice
            </Button>
          ) : undefined}
        />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-background">
                  <TableHead className="min-w-40">Number</TableHead>
                  <TableHead className="min-w-36">Client</TableHead>
                  <TableHead className="min-w-32">Issued</TableHead>
                  <TableHead className="min-w-36">Due</TableHead>
                  <TableHead className="min-w-32">Status</TableHead>
                  <TableHead className="min-w-28 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const duePast = isPast(inv.dueDate) && inv.status !== 'PAID' && inv.status !== 'CANCELLED'
                  return (
                    <TableRow
                      key={inv.id}
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => setDetail(inv)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(inv) } }}
                      aria-label={`Invoice ${inv.number} for ${inv.clientName ?? 'client'}`}
                    >
                      <TableCell className="font-mono text-sm font-medium">{inv.number}</TableCell>
                      <TableCell className="max-w-44 truncate text-sm">{inv.clientName ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(inv.issueDate)}</TableCell>
                      <TableCell className={`text-sm ${duePast ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                        {fmtDate(inv.dueDate)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={INVOICE_STATUS_LABELS[inv.status] ?? inv.status} tone={INVOICE_STATUS_TONE[inv.status]} />
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{money(inv.total, cur)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {filtered.length} of {items.length} loaded invoice{items.length === 1 ? '' : 's'}
              {hasMore && ' · more available below'}
            </span>
            {(hasMore || loading) && (
              <Button variant="outline" size="sm" className="h-9" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ---------- detail dialog ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                  <div>
                    <DialogTitle className="font-mono">{detail.number}</DialogTitle>
                    <DialogDescription className="mt-0.5">
                      {detail.clientName ?? 'Client'} · issued {fmtDate(detail.issueDate)} · due {fmtDate(detail.dueDate)}
                      {detail.paidAt ? ` · paid ${fmtDate(detail.paidAt)}` : ''}
                    </DialogDescription>
                  </div>
                  <StatusBadge label={INVOICE_STATUS_LABELS[detail.status] ?? detail.status} tone={INVOICE_STATUS_TONE[detail.status]} />
                </div>
              </DialogHeader>

              {/* line items */}
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No line items</TableCell></TableRow>
                    ) : detail.items.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{l.description}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{l.qty}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{money(l.rate, cur)}</TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{money(l.qty * l.rate, cur)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* totals */}
              <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{money(detail.subtotal, cur)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax ({detail.taxRate}%)</span><span className="tabular-nums">{money(detail.taxAmount, cur)}</span></div>
                {detail.discount > 0 && (
                  <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="tabular-nums">−{money(detail.discount, cur)}</span></div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(detail.total, cur)}</span></div>
              </div>

              {detail.notes && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap text-sm">{detail.notes}</p>
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && detail.status === 'DRAFT' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEdit(detail)} disabled={busy}>
                        <Pencil className="size-4" aria-hidden /> Edit
                      </Button>
                      <Button size="sm" onClick={() => void setStatusOf(detail, 'SENT')} disabled={busy}>
                        <Send className="size-4" aria-hidden /> Send
                      </Button>
                    </>
                  )}
                  {canManage && ['SENT', 'VIEWED', 'PARTIALLY_PAID'].includes(detail.status) && (
                    <>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void setStatusOf(detail, 'PAID')} disabled={busy}>
                        <CheckCircle2 className="size-4" aria-hidden /> Mark paid
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirming({ kind: 'cancel', inv: detail })} disabled={busy}>
                        <Ban className="size-4" aria-hidden /> Cancel
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirming({ kind: 'delete', inv: detail })} disabled={busy}>
                      <Trash2 className="size-4" aria-hidden /> Delete
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- create / edit dialog ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formMode === 'edit' ? 'Edit invoice' : 'New invoice'}</DialogTitle>
            <DialogDescription>
              {formMode === 'edit'
                ? 'Update the draft — totals recompute automatically. Status changes are saved separately.'
                : 'Billing is created as a draft — send it when you\'re ready.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-client">Client *</Label>
                <Select value={form.clientId} onValueChange={(v) => { setForm((f) => ({ ...f, clientId: v })); clearError('clientId') }}>
                  <SelectTrigger
                    id="inv-client"
                    className="w-full"
                    aria-invalid={!!errors.clientId}
                    aria-describedby={errors.clientId ? 'inv-client-error' : undefined}
                  >
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clientsQ.data?.items ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                    {clientsQ.loading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading clients…</p>}
                  </SelectContent>
                </Select>
                {errors.clientId && <p id="inv-client-error" className="text-xs text-destructive" role="alert">{errors.clientId}</p>}
                {clientsQ.data && clientsQ.data.items.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No clients yet — win a deal first.</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-number">Invoice number *</Label>
                <Input
                  id="inv-number"
                  value={form.number}
                  onChange={(e) => { setForm((f) => ({ ...f, number: e.target.value })); clearError('number') }}
                  className="font-mono"
                  aria-invalid={!!errors.number}
                  aria-describedby={errors.number ? 'inv-number-error' : undefined}
                />
                {errors.number && <p id="inv-number-error" className="text-xs text-destructive" role="alert">{errors.number}</p>}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-issue" className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden /> Issue date
                </Label>
                <Input
                  id="inv-issue"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => { setForm((f) => ({ ...f, issueDate: e.target.value })); clearError('issueDate') }}
                  aria-invalid={!!errors.issueDate}
                  aria-describedby={errors.issueDate ? 'inv-issue-error' : undefined}
                />
                {errors.issueDate && <p id="inv-issue-error" className="text-xs text-destructive" role="alert">{errors.issueDate}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-due" className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden /> Due date *
                </Label>
                <Input
                  id="inv-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => { setForm((f) => ({ ...f, dueDate: e.target.value })); clearError('dueDate') }}
                  aria-invalid={!!errors.dueDate}
                  aria-describedby={errors.dueDate ? 'inv-due-error' : undefined}
                />
                {errors.dueDate && <p id="inv-due-error" className="text-xs text-destructive" role="alert">{errors.dueDate}</p>}
              </div>
            </div>

            {/* line items */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label aria-describedby={errors.items ? 'inv-items-error' : undefined}>Line items *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setForm((f) => ({ ...f, items: [...f.items, { description: '', qty: '1', rate: '' }] })); clearError('items') }}
                >
                  <Plus className="size-4" aria-hidden /> Add item
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {form.items.map((line, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={line.description}
                        onChange={(e) => setLine(idx, { description: e.target.value })}
                        placeholder="Description of work or product"
                        aria-label={`Line ${idx + 1} description`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); clearError('items') }}
                        disabled={form.items.length === 1}
                        aria-label={`Remove line ${idx + 1}`}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number" min="0" value={line.qty}
                        onChange={(e) => setLine(idx, { qty: e.target.value })}
                        placeholder="Qty"
                        aria-label={`Line ${idx + 1} quantity`}
                      />
                      <Input
                        type="number" min="0" value={line.rate}
                        onChange={(e) => setLine(idx, { rate: e.target.value })}
                        placeholder={`Rate (${currencySymbol(cur)})`}
                        aria-label={`Line ${idx + 1} rate`}
                      />
                    </div>
                    <p className="text-right text-xs text-muted-foreground tabular-nums">
                      Amount: {money((Number(line.qty) || 0) * (Number(line.rate) || 0), cur)}
                    </p>
                  </div>
                ))}
              </div>
              {errors.items && <p id="inv-items-error" className="text-xs text-destructive" role="alert">{errors.items}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-tax">Tax rate (%)</Label>
                <Input
                  id="inv-tax"
                  type="number"
                  min="0"
                  value={form.taxRate}
                  onChange={(e) => { setForm((f) => ({ ...f, taxRate: e.target.value })); clearError('taxRate') }}
                  aria-invalid={!!errors.taxRate}
                  aria-describedby={errors.taxRate ? 'inv-tax-error' : undefined}
                />
                {errors.taxRate && <p id="inv-tax-error" className="text-xs text-destructive" role="alert">{errors.taxRate}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-discount">Discount ({currencySymbol(cur)})</Label>
                <Input
                  id="inv-discount"
                  type="number"
                  min="0"
                  value={form.discount}
                  onChange={(e) => { setForm((f) => ({ ...f, discount: e.target.value })); clearError('discount') }}
                  aria-invalid={!!errors.discount}
                  aria-describedby={errors.discount ? 'inv-discount-error' : undefined}
                />
                {errors.discount && <p id="inv-discount-error" className="text-xs text-destructive" role="alert">{errors.discount}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea
                id="inv-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => { setForm((f) => ({ ...f, notes: e.target.value })); clearError('notes') }}
                placeholder="Payment terms, bank details…"
                aria-invalid={!!errors.notes}
                aria-describedby={errors.notes ? 'inv-notes-error' : undefined}
              />
              {errors.notes && <p id="inv-notes-error" className="text-xs text-destructive" role="alert">{errors.notes}</p>}
            </div>

            {/* live totals preview */}
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{money(liveTotals.subtotal, cur)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax ({Number(form.taxRate) || 0}%)</span><span className="tabular-nums">{money(liveTotals.taxAmount, cur)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="tabular-nums">−{money(Number(form.discount) || 0, cur)}</span></div>
                <Separator className="my-1.5" />
                <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(liveTotals.total, cur)}</span></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void submitInvoice()} disabled={saving}>
              {saving
                ? formMode === 'edit' ? 'Saving…' : 'Creating…'
                : formMode === 'edit' ? 'Save changes' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- cancel / delete confirmations ---------- */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirming.kind === 'cancel' ? 'Cancel this invoice?' : 'Delete this invoice?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirming.kind === 'cancel'
                    ? `${confirming.inv.number} will be marked cancelled and removed from outstanding balances.`
                    : `${confirming.inv.number} (${money(confirming.inv.total, cur)}) will be permanently removed. This cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => void runConfirm()} className="bg-destructive text-white hover:bg-destructive/90">
                  {confirming.kind === 'cancel' ? 'Cancel invoice' : 'Delete invoice'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
