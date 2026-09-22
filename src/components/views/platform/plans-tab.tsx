'use client'

/**
 * Plans & Pricing — the SaaS plan catalog manager (platform console tab).
 * KPI chips over /api/platform/plans, a sortable-free catalog table (server
 * orders by sortOrder) and a create/edit dialog (code immutable after
 * creation), activate/deactivate confirmation and gated deletion (409 while
 * subscriptions reference the plan). Contracts frozen in the T6-a worklog.
 */

import { useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { toast } from '@/hooks/use-toast'
import { fmtMoney } from './money'
import { EmptyState } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Layers, CreditCard, Wallet, Star, Pencil, Trash2, Plus, X, Check, CircleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------- local types (T6-a frozen response shapes) ----------

interface PlanItem {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  currency: string
  seatLimit: number
  projectLimit: number
  storageGb: number
  features: string[] | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  subscriptionCount: number
}

// ---------- helpers ----------

/** same slug the server derives from a raw code (uppercase, non-alnum → _) */
function slugCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function numberOk(value: string, min: number): boolean {
  return value !== '' && Number.isFinite(Number(value)) && Number(value) >= min
}

const CHIP_TONES: Record<string, string> = {
  teal: 'bg-teal-600/12 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
  emerald: 'bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  sky: 'bg-sky-600/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
}

/** compact inline stat chip (lighter than StatCard — tab-scoped KPIs) */
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

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  )
}

/** first two features inline + "+N more" popover with the full list */
function FeaturesCell({ features }: { features: string[] | null }) {
  const list = features ?? []
  if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-col items-start gap-1">
      {list.slice(0, 2).map((f, i) => (
        <span key={`${i}-${f}`} className="max-w-52 truncate text-xs text-muted-foreground" title={f}>{f}</span>
      ))}
      {list.length > 2 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-6 items-center rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
              aria-label={`Show all ${list.length} features`}
            >
              +{list.length - 2} more
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3">
            <p className="mb-1.5 text-xs font-semibold">All features ({list.length})</p>
            <ul className="flex flex-col gap-1">
              {list.map((f, i) => (
                <li key={`${i}-${f}`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span className="min-w-0 break-words">{f}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

// ---------- plan create/edit dialog ----------

interface PlanFormBody {
  code: string
  name: string
  description: string
  priceMonthly: number
  priceYearly: number | undefined
  seatLimit: number
  projectLimit: number
  storageGb: number
  features: string[]
  isActive: boolean
}

function PlanFormDialog({ existing, busy, onClose, onSubmit }: {
  existing: PlanItem | null
  busy: boolean
  onClose: () => void
  onSubmit: (body: PlanFormBody) => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [code, setCode] = useState(existing?.code ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [priceMonthly, setPriceMonthly] = useState(existing ? String(existing.priceMonthly) : '')
  const [priceYearly, setPriceYearly] = useState(existing ? String(existing.priceYearly) : '')
  const [yearlyTouched, setYearlyTouched] = useState(existing !== null)
  const [seatLimit, setSeatLimit] = useState(existing ? String(existing.seatLimit) : '')
  const [projectLimit, setProjectLimit] = useState(existing ? String(existing.projectLimit) : '')
  const [storageGb, setStorageGb] = useState(existing ? String(existing.storageGb) : '')
  const [features, setFeatures] = useState<string[]>(existing?.features?.length ? existing.features : [''])
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)

  const slug = slugCode(code)
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60
  const codeOk = existing !== null || slug.length >= 2
  const priceOk = numberOk(priceMonthly, 0)
  const yearlyOk = priceYearly === '' || numberOk(priceYearly, 0)
  const limitsOk = numberOk(seatLimit, 1) && numberOk(projectLimit, 1) && numberOk(storageGb, 1)
  const valid = nameOk && codeOk && priceOk && yearlyOk && limitsOk

  function monthlyChange(v: string) {
    setPriceMonthly(v)
    // auto-suggest 12× monthly until the yearly price is edited by hand
    if (!yearlyTouched) {
      const n = Number(v)
      setPriceYearly(v !== '' && Number.isFinite(n) && n >= 0 ? String(Math.round(n * 12)) : '')
    }
  }

  function submit() {
    if (!valid || busy) return
    onSubmit({
      code: existing ? existing.code : slug,
      name: name.trim(),
      description: description.trim(),
      priceMonthly: Number(priceMonthly),
      priceYearly: priceYearly === '' ? undefined : Number(priceYearly),
      seatLimit: Number(seatLimit),
      projectLimit: Number(projectLimit),
      storageGb: Number(storageGb),
      features: features.map((f) => f.trim()).filter(Boolean),
      isActive,
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {existing ? `Edit ${existing.name}` : 'New plan'}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? `Plan code ${existing.code} is immutable — pricing, limits and features can change any time.`
              : 'Create a pricing tier for the whole platform. Codes are permanent; everything else stays editable.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-name">Plan name *</Label>
            <Input
              id="pp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Growth Plus"
              aria-invalid={name !== '' && !nameOk}
            />
            {!nameOk && name !== '' && <p className="text-xs text-rose-600 dark:text-rose-400">2–60 characters.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-code">Plan code *</Label>
            <Input
              id="pp-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={40}
              placeholder="e.g. GROWTH_PLUS"
              className="font-mono uppercase"
              disabled={existing !== null}
              aria-invalid={code !== '' && !codeOk}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {existing !== null
                ? 'Immutable after creation.'
                : code
                  ? `Saved as “${slug || '…'}” — immutable after creation.`
                  : 'Uppercase letters, digits, underscores — immutable after creation.'}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="pp-description">Description (optional)</Label>
            <Textarea
              id="pp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Who is this tier for?"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-price-monthly">Monthly price (৳) *</Label>
            <Input
              id="pp-price-monthly"
              type="number"
              min={0}
              step="any"
              value={priceMonthly}
              onChange={(e) => monthlyChange(e.target.value)}
              placeholder="e.g. 4500"
              aria-invalid={priceMonthly !== '' && !priceOk}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-price-yearly">Yearly price (৳)</Label>
            <Input
              id="pp-price-yearly"
              type="number"
              min={0}
              step="any"
              value={priceYearly}
              onChange={(e) => { setYearlyTouched(true); setPriceYearly(e.target.value) }}
              placeholder="auto — 12× monthly"
              aria-invalid={priceYearly !== '' && !yearlyOk}
            />
            <p className="text-xs text-muted-foreground">Left empty it defaults to 12× the monthly price.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-seat-limit">Seat limit *</Label>
            <Input
              id="pp-seat-limit"
              type="number"
              min={1}
              step={1}
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
              placeholder="e.g. 15"
              aria-invalid={seatLimit !== '' && !numberOk(seatLimit, 1)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-project-limit">Project limit *</Label>
            <Input
              id="pp-project-limit"
              type="number"
              min={1}
              step={1}
              value={projectLimit}
              onChange={(e) => setProjectLimit(e.target.value)}
              placeholder="e.g. 10"
              aria-invalid={projectLimit !== '' && !numberOk(projectLimit, 1)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-storage">Document storage (GB) *</Label>
            <Input
              id="pp-storage"
              type="number"
              min={1}
              step={1}
              value={storageGb}
              onChange={(e) => setStorageGb(e.target.value)}
              placeholder="e.g. 10"
              aria-invalid={storageGb !== '' && !numberOk(storageGb, 1)}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Features (up to 12)</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{features.length}/12</span>
            </div>
            <div className="flex flex-col gap-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={f}
                    onChange={(e) => setFeatures((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    maxLength={80}
                    placeholder={i === 0 ? 'e.g. Advanced reports' : 'Another feature'}
                    aria-label={`Feature ${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 min-h-9 shrink-0 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                    onClick={() => setFeatures((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove feature ${i + 1}`}
                    title="Remove feature"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-fit min-h-9"
              disabled={features.length >= 12}
              onClick={() => setFeatures((prev) => [...prev, ''])}
            >
              <Plus className="size-3.5" aria-hidden /> Add feature
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 sm:col-span-2">
            <div className="min-w-0">
              <Label htmlFor="pp-active" className="text-sm">Available for new subscriptions</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Inactive tiers keep serving existing subscribers but cannot be assigned.
              </p>
            </div>
            <Switch
              id="pp-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              aria-label="Plan available for new subscriptions"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- tab ----------

export default function PlansTab() {
  const { data, loading, error, refresh } = useData<{ items: PlanItem[] }>('/api/platform/plans')
  const [editing, setEditing] = useState<{ plan: PlanItem | null } | null>(null)
  const [toggling, setToggling] = useState<PlanItem | null>(null)
  const [removing, setRemoving] = useState<PlanItem | null>(null)
  const [busy, setBusy] = useState(false)

  const items = data?.items ?? []
  const activeCount = items.filter((p) => p.isActive).length
  const liveSubs = items.reduce((sum, p) => sum + p.subscriptionCount, 0)
  const paid = items.filter((p) => p.priceMonthly > 0)
  const cheapest = paid.length ? paid.reduce((a, b) => (b.priceMonthly < a.priceMonthly ? b : a)) : null
  const popular = items.length ? items.reduce((a, b) => (b.subscriptionCount > a.subscriptionCount ? b : a)) : null
  const popularHasSubs = (popular?.subscriptionCount ?? 0) > 0

  async function savePlan(body: PlanFormBody, existing: PlanItem | null) {
    setBusy(true)
    try {
      if (existing) {
        // PATCH never sends code — the server 422s code changes.
        const updated = await api<PlanItem>(`/api/platform/plans/${existing.id}`, {
          method: 'PATCH',
          body: {
            name: body.name,
            description: body.description,
            priceMonthly: body.priceMonthly,
            priceYearly: body.priceYearly,
            seatLimit: body.seatLimit,
            projectLimit: body.projectLimit,
            storageGb: body.storageGb,
            features: body.features,
            isActive: body.isActive,
          },
        })
        toast({
          title: 'Plan updated',
          description: `${updated.name} is saved. Live subscriptions keep their current amount until reassigned.`,
        })
      } else {
        const created = await api<PlanItem>('/api/platform/plans', { method: 'POST', body })
        toast({
          title: 'Plan created',
          description: `${created.name} (${created.code}) is ready to assign to organizations.`,
        })
      }
      refresh()
      setEditing(null)
    } catch {
      // api() toasts the error (409 duplicate code, 422 validation)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    if (!toggling) return
    setBusy(true)
    try {
      const updated = await api<PlanItem>(`/api/platform/plans/${toggling.id}`, {
        method: 'PATCH',
        body: { isActive: !toggling.isActive },
      })
      if (updated.isActive) {
        toast({ title: `${updated.name} is available again`, description: 'New subscriptions can be assigned to this tier.' })
      } else {
        toast({ title: `${updated.name} deactivated`, description: 'Existing subscriptions keep running; new assignments are blocked.' })
      }
      refresh()
      setToggling(null)
    } catch {
      // api() toasts
    } finally {
      setBusy(false)
    }
  }

  async function removePlan() {
    if (!removing) return
    setBusy(true)
    try {
      await api(`/api/platform/plans/${removing.id}`, { method: 'DELETE' })
      toast({ title: 'Plan deleted', description: `${removing.name} was removed from the catalog.` })
      refresh()
      setRemoving(null)
    } catch {
      // api() toasts the 409 while subscriptions reference the plan
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={Layers}
          title="Couldn't load the plan catalog"
          description={error}
          action={<Button variant="outline" onClick={refresh}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI chips */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <section aria-label="Plan catalog KPIs" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatChip label="Active plans" value={activeCount} sub={`${items.length} in catalog`} icon={Layers} tone="teal" />
          <StatChip label="Live subscriptions" value={liveSubs} sub="across all tiers" icon={CreditCard} tone="emerald" />
          <StatChip
            label="Cheapest paid tier"
            value={cheapest ? cheapest.name : '—'}
            sub={cheapest ? `from ${fmtMoney(cheapest.priceMonthly)}/mo` : 'no paid tiers yet'}
            icon={Wallet}
            tone="amber"
          />
          <StatChip
            label="Most popular"
            value={popular && popularHasSubs ? popular.name : '—'}
            sub={popular && popularHasSubs ? `${popular.subscriptionCount} live subscription${popular.subscriptionCount === 1 ? '' : 's'}` : 'no live subscriptions'}
            icon={Star}
            tone="sky"
          />
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} plan{items.length === 1 ? '' : 's'} · prices in Bangladeshi Taka (৳)
        </p>
        <Button onClick={() => setEditing({ plan: null })} className="min-h-9">
          <Plus className="size-4" aria-hidden /> New plan
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No plans yet"
          description="Create your first pricing tier to start assigning subscriptions to organizations."
          action={<Button onClick={() => setEditing({ plan: null })}><Plus className="size-4" aria-hidden /> New plan</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">Plan</TableHead>
                <TableHead className="min-w-32">Pricing</TableHead>
                <TableHead className="min-w-40">Limits</TableHead>
                <TableHead className="min-w-52">Features</TableHead>
                <TableHead className="min-w-24 text-right">Subscriptions</TableHead>
                <TableHead className="min-w-28">Status</TableHead>
                <TableHead className="min-w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} className={p.isActive ? undefined : 'opacity-75'}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{p.name}</p>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase text-muted-foreground">{p.code}</Badge>
                      </div>
                      {p.description && (
                        <p className="max-w-72 truncate text-xs text-muted-foreground" title={p.description}>{p.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">{fmtMoney(p.priceMonthly)}/mo</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{fmtMoney(p.priceYearly)}/yr</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="tabular-nums">{p.seatLimit} seats · {p.projectLimit} projects</span>
                      <span className="tabular-nums text-muted-foreground">{p.storageGb} GB storage</span>
                    </div>
                  </TableCell>
                  <TableCell><FeaturesCell features={p.features} /></TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">{p.subscriptionCount}</TableCell>
                  <TableCell>
                    <StatusBadge label={p.isActive ? 'Active' : 'Inactive'} tone={p.isActive ? 'success' : 'muted'} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 min-h-9 text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-400 dark:hover:bg-teal-500/15"
                        title="Edit plan"
                        onClick={() => setEditing({ plan: p })}
                        aria-label={`Edit the ${p.name} plan`}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Switch
                        checked={p.isActive}
                        onCheckedChange={() => setToggling(p)}
                        title={p.isActive ? 'Deactivate plan' : 'Activate plan'}
                        aria-label={`${p.isActive ? 'Deactivate' : 'Activate'} the ${p.name} plan`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 min-h-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/15"
                        title="Delete plan"
                        onClick={() => setRemoving(p)}
                        aria-label={`Delete the ${p.name} plan`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Codes are immutable after creation. Inactive plans can&apos;t be assigned to new subscriptions — deactivate to
          retire a tier while it keeps serving existing subscribers.
        </p>
      )}

      {/* create / edit dialog */}
      {editing && (
        <PlanFormDialog
          existing={editing.plan}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={(body) => void savePlan(body, editing.plan)}
        />
      )}

      {/* activate / deactivate confirmation */}
      <AlertDialog open={!!toggling} onOpenChange={(o) => { if (!o) setToggling(null) }}>
        <AlertDialogContent>
          {toggling && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {toggling.isActive ? `Deactivate ${toggling.name}?` : `Activate ${toggling.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {toggling.isActive
                    ? 'New subscriptions can no longer be assigned to this tier. Existing subscribers keep running unchanged.'
                    : 'The tier becomes available for new subscription assignments again.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void toggleActive()}
                  disabled={busy}
                  className={toggling.isActive
                    ? 'bg-destructive text-white hover:bg-destructive/90'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'}
                >
                  {toggling.isActive ? 'Deactivate' : 'Activate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* delete confirmation */}
      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null) }}>
        <AlertDialogContent>
          {removing && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {removing.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The tier is permanently removed from the catalog.{' '}
                  {removing.subscriptionCount > 0 && (
                    <>
                      It currently has {removing.subscriptionCount} live subscription{removing.subscriptionCount === 1 ? '' : 's'} —
                      deletion is refused while any subscription (including cancelled history) references the plan.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {removing.subscriptionCount > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Move those subscriptions to another plan first.
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void removePlan()} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
                  {busy ? 'Deleting…' : 'Delete plan'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
