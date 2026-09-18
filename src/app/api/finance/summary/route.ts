import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const round2 = (n: number) => Math.round(n * 100) / 100

type InvoiceLite = { status: string; total: number; issueDate: Date; dueDate: Date; client: { name: string } | null }
type ExpenseLite = { status: string; amount: number; date: Date; category: string }

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'reports', 'view')
    if (denied) return denied
    const [invoices, expenses] = await Promise.all([
      db.invoice.findMany({
        where: { orgId: org.id },
        select: { status: true, total: true, issueDate: true, dueDate: true, client: { select: { name: true } } },
      }),
      db.expense.findMany({
        where: { orgId: org.id },
        select: { status: true, amount: true, date: true, category: true },
      }),
    ])

    const now = Date.now()
    const isActive = (i: InvoiceLite) => ['SENT', 'VIEWED', 'PARTIALLY_PAID'].includes(i.status)
    const isOverdue = (i: InvoiceLite) => i.status === 'OVERDUE' || (isActive(i) && i.dueDate.getTime() < now)

    const paidInv = invoices.filter((i) => i.status === 'PAID')
    const overdueInv = invoices.filter(isOverdue)
    const outstandingInv = invoices.filter((i) => isActive(i) && !isOverdue(i))

    const bucket = (arr: Array<{ total?: number; amount?: number }>) => ({
      count: arr.length,
      value: round2(arr.reduce((s, i) => s + (i.total ?? i.amount ?? 0), 0)),
    })

    const paidExp = expenses.filter((e) => e.status === 'PAID')
    const pendingExp = expenses.filter((e) => ['SUBMITTED', 'MANAGER_APPROVED', 'FINANCE_APPROVED'].includes(e.status))

    // last 6 months (oldest → newest), 'YYYY-MM' keys
    const monthly: Array<{ month: string; income: number; expenses: number }> = []
    const today = new Date()
    for (let k = 5; k >= 0; k--) {
      const d = new Date(today.getFullYear(), today.getMonth() - k, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const inMonth = (x: Date) => {
        const dt = new Date(x)
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` === key
      }
      const income = invoices
        .filter((i) => !['DRAFT', 'CANCELLED'].includes(i.status) && inMonth(i.issueDate))
        .reduce((s, i) => s + i.total, 0)
      const exp = expenses
        .filter((e) => e.status !== 'REJECTED' && inMonth(e.date))
        .reduce((s, e) => s + e.amount, 0)
      monthly.push({ month: key, income: round2(income), expenses: round2(exp) })
    }

    // expenses by category (excludes rejected)
    const catMap = new Map<string, number>()
    for (const e of expenses) {
      if (e.status === 'REJECTED') continue
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount)
    }
    const byCategory = [...catMap.entries()]
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)

    // top clients by billed revenue (non-draft, non-cancelled)
    const revMap = new Map<string, number>()
    for (const i of invoices) {
      if (['DRAFT', 'CANCELLED'].includes(i.status)) continue
      const name = i.client?.name ?? 'Unknown'
      revMap.set(name, (revMap.get(name) ?? 0) + i.total)
    }
    const topClients = [...revMap.entries()]
      .map(([clientName, revenue]) => ({ clientName, revenue: round2(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    return ok({
      income: {
        paid: bucket(paidInv),
        outstanding: bucket(outstandingInv),
        overdue: bucket(overdueInv),
      },
      expenses: {
        paid: bucket(paidExp),
        pending: bucket(pendingExp),
      },
      monthly,
      byCategory,
      topClients,
    })
})
