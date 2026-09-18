'use client'

import { useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import {
  money, currencySymbol, fmtDate, todayStr, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS, EXPENSE_STATUS_TONE,
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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Banknote, CalendarDays, CheckCircle2, Clock, MoreHorizontal, Plus, Receipt, Trash2, Wallet, XCircle,
} from 'lucide-react'

// ---------- local types ----------

interface ExpenseItem {
  id: string
  membershipId: string
  userName: string | null
  projectName: string | null
  title: string
  category: string
  amount: number
  date: string
  status: string
  notes: string | null
  approvedById: string | null
  createdAt: string
}

interface SummaryShape {
  expenses: { paid: { count: number; value: number }; pending: { count: number; value: number } }
  monthly: Array<{ month: string; income: number; expenses: number }>
}

interface ProjectLite { id: string; name: string }

interface ExpenseForm {
  title: string
  category: string
  amount: string
  date: string
  projectId: string
  notes: string
}

type ExpenseAction = 'approve' | 'reject' | 'pay'

const EMPTY_FORM: ExpenseForm = { title: '', category: 'GENERAL', amount: '', date: '', projectId: '', notes: '' }

const REJECTABLE = ['SUBMITTED', 'MANAGER_APPROVED', 'FINANCE_APPROVED']

export default function FinanceExpensesView() {
  const { org, role, membership } = useWorkspace()
  const cur = org?.currency ?? 'BDT'

  // role matrix (mirrors backend rules)
  const isSubmitApprover = ['MANAGER', 'HR', 'ADMIN', 'OWNER'].includes(role)
  const isFinance = ['FINANCE', 'ADMIN', 'OWNER'].includes(role)
  const isReviewer = isSubmitApprover || role === 'FINANCE'
  const canDeleteAny = role === 'OWNER' || role === 'ADMIN'

  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const { data, loading, error, refresh } = useData<{ items: ExpenseItem[] }>(
    `/api/finance/expenses${tab === 'mine' ? '?mine=true' : ''}`
  )
  const summaryQ = useData<SummaryShape>('/api/finance/summary')
  const items = data?.items ?? []

  // this month spend (summary monthly's last bucket is the current month)
  const thisMonth = summaryQ.data?.monthly?.at(-1)?.month === todayStr().slice(0, 7)
    ? (summaryQ.data.monthly.at(-1)?.expenses ?? 0)
    : 0

  // submit dialog
  const [formOpen, setFormOpen] = useState(false)
  const projectsQ = useData<{ items: ProjectLite[] }>(formOpen ? '/api/projects' : null)
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // action confirmations
  const [confirming, setConfirming] = useState<{ action: ExpenseAction; expense: ExpenseItem } | null>(null)
  const [deleting, setDeleting] = useState<ExpenseItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  /** which actions the current user may take on a given expense */
  function actionsFor(e: ExpenseItem): { approve: boolean; pay: boolean; reject: boolean; del: boolean } {
    return {
      approve:
        (e.status === 'SUBMITTED' && isSubmitApprover) ||
        (e.status === 'MANAGER_APPROVED' && isFinance),
      pay: isFinance && e.status === 'FINANCE_APPROVED',
      reject: isReviewer && REJECTABLE.includes(e.status),
      del: e.membershipId === membership?.id || canDeleteAny,
    }
  }

  function openSubmit() {
    setForm({ ...EMPTY_FORM, date: todayStr() })
    setFormOpen(true)
  }

  async function submitExpense() {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', description: 'Describe the expense.', variant: 'destructive' })
      return
    }
    const amount = Number(form.amount)
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', description: 'Amount must be greater than zero.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/finance/expenses', {
        method: 'POST',
        body: {
          title: form.title,
          category: form.category,
          amount,
          date: form.date || undefined,
          projectId: form.projectId || undefined,
          notes: form.notes,
        },
      })
      toast({ title: 'Expense submitted', description: `"${form.title}" is awaiting approval.` })
      setFormOpen(false)
      refresh()
      summaryQ.refresh()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function runAction() {
    if (!confirming) return
    const { action, expense } = confirming
    setConfirming(null)
    setBusyId(expense.id)
    try {
      await api(`/api/finance/expenses/${expense.id}`, { method: 'PATCH', body: { action } })
      const titles: Record<ExpenseAction, string> = { approve: 'Expense approved', reject: 'Expense rejected', pay: 'Expense paid' }
      const descs: Record<ExpenseAction, string> = {
        approve: expense.status === 'SUBMITTED'
          ? `"${expense.title}" now needs finance approval.`
          : `"${expense.title}" is finance approved and ready to pay.`,
        reject: `"${expense.title}" was rejected.`,
        pay: `${money(expense.amount, cur)} paid out for "${expense.title}".`,
      }
      toast({ title: titles[action], description: descs[action] })
      refresh()
      summaryQ.refresh()
    } catch {
    } finally {
      setBusyId(null)
    }
  }

  async function deleteExpense() {
    if (!deleting) return
    const expense = deleting
    setDeleting(null)
    try {
      await api(`/api/finance/expenses/${expense.id}`, { method: 'DELETE' })
      toast({ title: 'Expense deleted', description: `"${expense.title}" was removed.` })
      refresh()
      summaryQ.refresh()
    } catch {
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Wallet}
        title="Expenses"
        description="Submit, review and pay team expenses."
        actions={
          <Button onClick={openSubmit}>
            <Plus className="size-4" aria-hidden /> Submit expense
          </Button>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="This month spend" value={money(thisMonth, cur, true)} icon={CalendarDays} sub="Excludes rejected" loading={summaryQ.loading} />
        <StatCard
          label="Pending approvals"
          value={summaryQ.data?.expenses.pending.count ?? 0}
          sub={`${money(summaryQ.data?.expenses.pending.value ?? 0, cur, true)} awaiting review`}
          icon={Clock}
          tone="warning"
          loading={summaryQ.loading}
        />
        <StatCard
          label="Paid total"
          value={money(summaryQ.data?.expenses.paid.value ?? 0, cur, true)}
          sub={`${summaryQ.data?.expenses.paid.count ?? 0} expenses paid`}
          icon={Banknote}
          tone="success"
          loading={summaryQ.loading}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v === 'mine' ? 'mine' : 'all')}>
        <TabsList>
          <TabsTrigger value="all">All expenses</TabsTrigger>
          <TabsTrigger value="mine">My expenses</TabsTrigger>
        </TabsList>

        {(['all', 'mine'] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {loading ? (
              <Card className="py-0">
                <CardContent className="flex flex-col gap-3 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="size-9 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : error ? (
              <EmptyState icon={Receipt} title="Couldn't load expenses" description={error} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={t === 'mine' ? 'You have no expenses' : 'No expenses yet'}
                description={t === 'mine' ? 'Submit your first expense claim to get reimbursed.' : 'Team expense claims will appear here for review.'}
                action={<Button variant="outline" onClick={openSubmit}><Plus className="size-4" aria-hidden /> Submit expense</Button>}
              />
            ) : (
              <Card className="py-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-40">Employee</TableHead>
                        <TableHead className="min-w-48">Expense</TableHead>
                        <TableHead className="min-w-32">Category</TableHead>
                        <TableHead className="min-w-40">Project</TableHead>
                        <TableHead className="min-w-28 text-right">Amount</TableHead>
                        <TableHead className="min-w-28">Date</TableHead>
                        <TableHead className="min-w-44">Status</TableHead>
                        <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((e) => {
                        const acts = actionsFor(e)
                        const hasAny = acts.approve || acts.pay || acts.reject || acts.del
                        return (
                          <TableRow key={e.id} className={busyId === e.id ? 'opacity-50' : undefined}>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <UserAvatar name={e.userName} size="xs" />
                                <span className="truncate text-sm">{e.userName ?? 'Unknown'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="truncate text-sm font-medium">{e.title}</p>
                              {e.notes && <p className="max-w-64 truncate text-xs text-muted-foreground">{e.notes}</p>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {e.projectName
                                ? <span className="truncate text-sm">{e.projectName}</span>
                                : <span className="text-sm text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold tabular-nums">{money(e.amount, cur)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtDate(e.date)}</TableCell>
                            <TableCell>
                              <StatusBadge label={EXPENSE_STATUS_LABELS[e.status] ?? e.status} tone={EXPENSE_STATUS_TONE[e.status]} />
                            </TableCell>
                            <TableCell>
                              {hasAny && (
                                <div className="flex items-center gap-1">
                                  {acts.approve && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1 border-emerald-600/30 text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400"
                                      onClick={() => setConfirming({ action: 'approve', expense: e })}
                                      aria-label={`Approve ${e.title}`}
                                    >
                                      <CheckCircle2 className="size-3.5" aria-hidden /> Approve
                                    </Button>
                                  )}
                                  {acts.pay && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1 border-teal-600/30 text-teal-700 hover:bg-teal-600/10 dark:text-teal-300"
                                      onClick={() => setConfirming({ action: 'pay', expense: e })}
                                      aria-label={`Pay ${e.title}`}
                                    >
                                      <Banknote className="size-3.5" aria-hidden /> Pay
                                    </Button>
                                  )}
                                  {(acts.reject || acts.del) && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${e.title}`}>
                                          <MoreHorizontal className="size-4" aria-hidden />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {acts.reject && (
                                          <DropdownMenuItem variant="destructive" onClick={() => setConfirming({ action: 'reject', expense: e })}>
                                            <XCircle className="size-4" aria-hidden /> Reject
                                          </DropdownMenuItem>
                                        )}
                                        {acts.reject && acts.del && <DropdownMenuSeparator />}
                                        {acts.del && (
                                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(e)}>
                                            <Trash2 className="size-4" aria-hidden /> Delete
                                          </DropdownMenuItem>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                  {items.length} expense{items.length === 1 ? '' : 's'} {t === 'mine' ? 'submitted by you' : 'across the org'}
                </div>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ---------- submit dialog ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit expense</DialogTitle>
            <DialogDescription>Claims go to your manager for approval before finance pays out.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="exp-title">Title *</Label>
              <Input id="exp-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Client visit transport" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="exp-category">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger id="exp-category" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="exp-amount">Amount ({currencySymbol(cur)}) *</Label>
                <Input id="exp-amount" type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="exp-date" className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden /> Date
                </Label>
                <Input id="exp-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="exp-project">Project (optional)</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === '__none' ? '' : v }))}>
                  <SelectTrigger id="exp-project" className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No project</SelectItem>
                    {(projectsQ.data?.items ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="exp-notes">Notes</Label>
              <Textarea id="exp-notes" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Context, receipts, attendees…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void submitExpense()} disabled={saving}>{saving ? 'Submitting…' : 'Submit expense'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- approve / reject / pay confirmations ---------- */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirming.action === 'approve'
                    ? 'Approve this expense?'
                    : confirming.action === 'pay'
                      ? 'Mark this expense as paid?'
                      : 'Reject this expense?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirming.action === 'approve' && confirming.expense.status === 'SUBMITTED'
                    ? `"${confirming.expense.title}" (${money(confirming.expense.amount, cur)}) moves to finance approval.`
                    : confirming.action === 'approve'
                      ? `"${confirming.expense.title}" (${money(confirming.expense.amount, cur)}) becomes finance approved and ready to pay.`
                      : confirming.action === 'pay'
                        ? `${money(confirming.expense.amount, cur)} will be recorded as paid out for "${confirming.expense.title}".`
                        : `"${confirming.expense.title}" (${money(confirming.expense.amount, cur)}) will be marked rejected. The submitter is notified.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runAction()}
                  className={
                    confirming.action === 'approve'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : confirming.action === 'pay'
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'bg-destructive text-white hover:bg-destructive/90'
                  }
                >
                  {confirming.action === 'approve' ? 'Approve' : confirming.action === 'pay' ? 'Pay' : 'Reject'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- delete confirmation ---------- */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}”{deleting ? ` (${money(deleting.amount, cur)})` : ''} will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteExpense()} className="bg-destructive text-white hover:bg-destructive/90">
              Delete expense
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
