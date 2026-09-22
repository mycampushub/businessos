'use client'

/**
 * Requests — tenant-initiated plan requests (BillingRequest) for the SaaS
 * platform console tab. KPI chips (pending / approved / rejected / pending
 * value), status filter, and the decision actions on PENDING rows: Approve
 * (payment received → assignSubscription activates the plan) and Reject
 * (with a reason). Both are confirmed, toasted and followed by a refresh.
 * Data: GET /api/platform/billing-requests; POST /api/platform/billing-requests/[id].
 */

import { useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { toast } from '@/hooks/use-toast'
import { fmtDate, type BadgeTone } from '@/lib/format'
import { fmtMoney } from '@/components/views/platform/money'
import { EmptyState } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Inbox, CircleCheck, CircleX, Hourglass, Banknote, Check, X, type LucideIcon,
} from 'lucide-react'

interface RequestItem {
  id: string
  orgId: string
  orgName: string
  planId: string
  planCode: string
  planName: string
  billingCycle: string
  seats: number
  amount: number
  note: string | null
  status: string // PENDING | APPROVED | REJECTED
  requestedByName: string | null
  decidedAt: string | null
  createdAt: string
}

interface RequestsData {
  items: RequestItem[]
}

const REQ_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' }
const REQ_STATUS_TONE: Record<string, BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'destructive' }
const CYCLE_LABELS: Record<string, string> = { MONTHLY: 'Monthly', YEARLY: 'Yearly' }

const CHIP_TONES: Record<string, string> = {
  amber: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  rose: 'bg-rose-500/12 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  teal: 'bg-teal-600/12 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
}

/** compact inline stat chip (tab-scoped KPIs) */
function StatChip({ label, value, sub, icon: Icon, tone }: {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  tone: keyof typeof CHIP_TONES
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 sm:p-4">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${CHIP_TONES[tone]}`}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tracking-tight tabular-nums">{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  )
}

export default function BillingRequestsTab() {
  const [status, setStatus] = useState('pending')
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status.toUpperCase())
  const { data, loading, error, refresh } = useData<RequestsData>(`/api/platform/billing-requests?${params.toString()}`)

  const items = data?.items ?? []
  const pending = items.filter((r) => r.status === 'PENDING')
  const pendingValue = pending.reduce((sum, r) => sum + r.amount, 0)

  // decision dialogs
  const [approving, setApproving] = useState<RequestItem | null>(null)
  const [rejecting, setRejecting] = useState<RequestItem | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function approve() {
    if (!approving) return
    const target = approving
    setApproving(null)
    setBusy(true)
    try {
      await api<RequestItem>(`/api/platform/billing-requests/${target.id}`, {
        method: 'POST',
        body: { action: 'approve' },
      })
      toast({
        title: 'Request approved',
        description: `${target.orgName} is now on ${target.planName} — the owner was notified and the period restarted.`,
      })
      refresh()
    } catch {
      // 409 already-decided etc. auto-toasted by api()
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (!rejecting) return
    const target = rejecting
    setBusy(true)
    try {
      await api<RequestItem>(`/api/platform/billing-requests/${target.id}`, {
        method: 'POST',
        body: { action: 'reject', reason: reason.trim() || undefined },
      })
      toast({
        title: 'Request rejected',
        description: `${target.orgName}'s ${target.planName} request was declined${reason.trim() ? ' with your reason' : ''} — the owner was notified.`,
      })
      setRejecting(null)
      setReason('')
      refresh()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI chips */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatChip label="Pending" value={pending.length} sub="awaiting payment + decision" icon={Hourglass} tone="amber" />
        <StatChip label="Pending value" value={fmtMoney(pendingValue)} sub="sum of open request amounts" icon={Banknote} tone="teal" />
        <StatChip
          label="Approved"
          value={items.filter((r) => r.status === 'APPROVED').length}
          sub="in this view"
          icon={CircleCheck}
          tone="emerald"
        />
        <StatChip
          label="Rejected"
          value={items.filter((r) => r.status === 'REJECTED').length}
          sub="in this view"
          icon={CircleX}
          tone="rose"
        />
      </div>

      {/* status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11 w-40" aria-label="Filter requests by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Tenant plan requests, newest first (up to 200). Approving confirms the bKash/Nagad payment was received.
        </p>
      </div>

      {/* table */}
      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <EmptyState icon={Inbox} title="Couldn't load plan requests" description={error} action={
          <Button variant="outline" className="h-11" onClick={refresh}>Try again</Button>
        } />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'pending' ? 'No pending requests' : 'No plan requests yet'}
          description="Tenants request plan upgrades from their Billing & Plan page — they arrive here for payment confirmation."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Organization</TableHead>
                  <TableHead className="min-w-32">Plan</TableHead>
                  <TableHead className="min-w-20">Cycle</TableHead>
                  <TableHead className="min-w-16 text-right">Seats</TableHead>
                  <TableHead className="min-w-28 text-right">Amount</TableHead>
                  <TableHead className="min-w-32">Requester</TableHead>
                  <TableHead className="min-w-48">Note</TableHead>
                  <TableHead className="min-w-24">Status</TableHead>
                  <TableHead className="min-w-28">Requested</TableHead>
                  <TableHead className="w-40"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} className={busy ? 'opacity-60' : undefined}>
                    <TableCell className="font-medium">{r.orgName}</TableCell>
                    <TableCell>
                      <p className="font-medium">{r.planName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{r.planCode}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{CYCLE_LABELS[r.billingCycle] ?? r.billingCycle}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.seats}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtMoney(r.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.requestedByName ?? '—'}</TableCell>
                    <TableCell className="max-w-56">
                      {r.note ? <p className="truncate text-xs text-muted-foreground" title={r.note}>{r.note}</p> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={REQ_STATUS_LABELS[r.status] ?? r.status} tone={REQ_STATUS_TONE[r.status]} />
                      {r.decidedAt && <p className="mt-0.5 text-xs text-muted-foreground">decided {fmtDate(r.decidedAt)}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{fmtDate(r.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">{r.createdAt.slice(11, 16)} UTC</p>
                    </TableCell>
                    <TableCell>
                      {r.status === 'PENDING' ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800 dark:text-emerald-400"
                            aria-label={`Approve the ${r.planName} plan request for ${r.orgName}`}
                            onClick={() => setApproving(r)}
                          >
                            <Check className="size-4" aria-hidden /> Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 border-rose-600/40 text-rose-600 hover:bg-rose-600/10 hover:text-rose-700 dark:text-rose-400"
                            aria-label={`Reject the ${r.planName} plan request for ${r.orgName}`}
                            onClick={() => { setReason(''); setRejecting(r) }}
                          >
                            <X className="size-4" aria-hidden /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">decided</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ---------- approve confirmation ---------- */}
      <AlertDialog open={!!approving} onOpenChange={(o) => { if (!o) setApproving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this plan request?</AlertDialogTitle>
            <AlertDialogDescription>
              {approving && `Confirms payment received and activates the ${approving.planName} plan for ${approving.orgName} (${CYCLE_LABELS[approving.billingCycle]?.toLowerCase() ?? approving.billingCycle.toLowerCase()}, ${approving.seats} seats, ${fmtMoney(approving.amount)}). The current live subscription is replaced, the billing period restarts today and the organization owner is notified.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void approve()}
            >
              Confirm payment & activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- reject reason prompt ---------- */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null) }}>
        <DialogContent className="sm:max-w-md">
          {rejecting && (
            <>
              <DialogHeader>
                <DialogTitle>Reject this plan request?</DialogTitle>
                <DialogDescription>
                  Declines the {rejecting.planName} plan request from {rejecting.orgName}. The owner is notified
                  {reason.trim() ? ' with your reason' : ''} and can submit a new request from Billing & Plan.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reject-reason">Reason (optional)</Label>
                <Input
                  id="reject-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Payment not received yet"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  Shared with the organization owner in the rejection notification.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejecting(null)}>Keep pending</Button>
                <Button
                  variant="destructive"
                  className="h-11"
                  onClick={() => void reject()}
                  disabled={busy}
                >
                  {busy ? 'Rejecting…' : 'Reject request'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
