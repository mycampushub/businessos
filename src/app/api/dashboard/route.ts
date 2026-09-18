import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { getTaskColumns, doneKeys } from '@/lib/server/columns'

const round = (n: number) => Math.round(n * 100) / 100

/** GET /api/dashboard — one aggregated payload for the workspace home screen. */
export async function GET(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const orgId = org.id

    const denied = requireAccess(ctx, 'dashboard', 'view')
    if (denied) return denied

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // dynamic TASK board columns: order drives taskStatus, isDone columns count as done
    const taskColumns = await getTaskColumns(orgId)
    const notDone = { notIn: doneKeys(taskColumns) }

    // ---------- KPIs ----------
    const [
      invoiceAgg,
      expenseAgg,
      dealAgg,
      activeProjects,
      overdueTasks,
      employeeCount,
      todayPresent,
      pendingLeaves,
      pendingExpenses,
    ] = await Promise.all([
      db.invoice.aggregate({ where: { orgId, status: { in: ['PAID', 'PARTIALLY_PAID'] } }, _sum: { total: true } }),
      db.expense.aggregate({ where: { orgId, status: { in: ['PAID', 'FINANCE_APPROVED'] } }, _sum: { amount: true } }),
      db.deal.aggregate({ where: { orgId, status: 'OPEN' }, _sum: { value: true }, _count: true }),
      db.project.count({ where: { orgId, status: 'ACTIVE' } }),
      db.task.count({ where: { orgId, status: notDone, dueDate: { lt: startOfToday } } }),
      db.membership.count({ where: { orgId, status: 'ACTIVE' } }),
      db.attendance.count({ where: { orgId, date: today, status: { in: ['PRESENT', 'LATE'] } } }),
      db.leaveRequest.count({ where: { orgId, status: 'PENDING' } }),
      db.expense.count({ where: { orgId, status: { in: ['SUBMITTED', 'MANAGER_APPROVED'] } } }),
    ])

    // ---------- revenue / expense trend (last 6 months) ----------
    const [trendInvoices, trendExpenses] = await Promise.all([
      db.invoice.findMany({
        where: { orgId, status: { in: ['PAID', 'PARTIALLY_PAID'] } },
        select: { issueDate: true, total: true },
      }),
      db.expense.findMany({
        where: { orgId, status: { in: ['PAID', 'FINANCE_APPROVED'] } },
        select: { date: true, amount: true },
      }),
    ])
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const revByMonth = new Map<string, number>()
    for (const inv of trendInvoices) {
      const k = monthKey(inv.issueDate)
      revByMonth.set(k, (revByMonth.get(k) ?? 0) + inv.total)
    }
    const expByMonth = new Map<string, number>()
    for (const exp of trendExpenses) {
      const k = monthKey(exp.date)
      expByMonth.set(k, (expByMonth.get(k) ?? 0) + exp.amount)
    }
    const revenueTrend: Array<{ month: string; revenue: number; expenses: number }> = []
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const k = monthKey(m)
      revenueTrend.push({
        month: m.toLocaleDateString('en-GB', { month: 'short' }),
        revenue: round(revByMonth.get(k) ?? 0),
        expenses: round(expByMonth.get(k) ?? 0),
      })
    }

    // ---------- pipeline (open deals grouped by stage, ordered by stage.order) ----------
    const [stages, openDeals] = await Promise.all([
      db.pipelineStage.findMany({ where: { orgId }, orderBy: { order: 'asc' }, select: { id: true, name: true } }),
      db.deal.findMany({ where: { orgId, status: 'OPEN' }, select: { stageId: true, value: true } }),
    ])
    const stageAgg = new Map<string, { count: number; value: number }>()
    for (const d of openDeals) {
      const cur = stageAgg.get(d.stageId) ?? { count: 0, value: 0 }
      cur.count += 1
      cur.value += d.value
      stageAgg.set(d.stageId, cur)
    }
    const pipeline = stages.map((s) => ({
      stage: s.name,
      count: stageAgg.get(s.id)?.count ?? 0,
      value: round(stageAgg.get(s.id)?.value ?? 0),
    }))

    // ---------- task status distribution (all TASK columns incl. zero) ----------
    const statusCounts = await db.task.groupBy({ by: ['status'], where: { orgId }, _count: { _all: true } })
    const statusMap = new Map(statusCounts.map((r) => [r.status, r._count._all]))
    const taskStatus = taskColumns.map((c) => ({
      status: c.key,
      label: c.label,
      count: statusMap.get(c.key) ?? 0,
    }))

    // ---------- attendance trend (last 10 distinct dates with rows, ascending) ----------
    const attRows = await db.attendance.findMany({ where: { orgId }, select: { date: true, status: true } })
    const attByDate = new Map<string, { present: number; late: number; leave: number; absent: number }>()
    for (const r of attRows) {
      const b = attByDate.get(r.date) ?? { present: 0, late: 0, leave: 0, absent: 0 }
      if (r.status === 'PRESENT') b.present += 1
      else if (r.status === 'LATE') b.late += 1
      else if (r.status === 'LEAVE') b.leave += 1
      else if (r.status === 'ABSENT') b.absent += 1
      attByDate.set(r.date, b)
    }
    const attendanceTrend = [...attByDate.keys()].sort().slice(-10).map((date) => ({ date, ...attByDate.get(date)! }))

    // ---------- recent activity (8) ----------
    const activities = await db.activityLog.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { actor: { select: { user: { select: { name: true } } } } },
    })
    const recentActivities = activities.map((a) => ({
      id: a.id,
      message: a.message,
      action: a.action,
      createdAt: a.createdAt,
      actorName: a.actor?.user.name ?? null,
    }))

    // ---------- my open tasks (6, earliest due first; nulls last) ----------
    const myTaskRows = await db.task.findMany({
      where: { orgId, assigneeMembershipId: membership.id, status: notDone },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true,
        project: { select: { name: true } },
      },
      take: 60,
    })
    myTaskRows.sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
    const myTasks = myTaskRows.slice(0, 6).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      projectName: t.project?.name ?? null,
    }))

    // ---------- upcoming deadlines (tasks + milestones + invoices, ascending, 8) ----------
    const [taskDeadlines, milestoneDeadlines, invoiceDeadlines] = await Promise.all([
      db.task.findMany({
        where: { orgId, status: notDone },
        select: { title: true, dueDate: true, project: { select: { name: true } } },
        take: 100,
      }),
      db.milestone.findMany({
        where: { project: { orgId }, status: { not: 'COMPLETED' } },
        select: { title: true, dueDate: true, project: { select: { name: true } } },
        take: 100,
      }),
      db.invoice.findMany({
        where: { orgId, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } },
        select: { number: true, dueDate: true, client: { select: { name: true } } },
        take: 100,
      }),
    ])
    const upcomingDeadlines = [
      ...taskDeadlines.filter((t) => t.dueDate !== null).map((t) => ({
        type: 'TASK' as const, title: t.title, dueDate: t.dueDate, context: t.project?.name ?? null,
      })),
      ...milestoneDeadlines.filter((m) => m.dueDate !== null).map((m) => ({
        type: 'MILESTONE' as const, title: m.title, dueDate: m.dueDate, context: m.project?.name ?? null,
      })),
      ...invoiceDeadlines.map((i) => ({
        type: 'INVOICE' as const, title: `Invoice ${i.number}`, dueDate: i.dueDate, context: i.client?.name ?? null,
      })),
    ]
      .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
      .slice(0, 8)

    // ---------- top clients by paid revenue ----------
    const clientRows = await db.client.findMany({
      where: { orgId },
      select: {
        name: true,
        invoices: { where: { status: { in: ['PAID', 'PARTIALLY_PAID'] } }, select: { total: true } },
        _count: { select: { projects: true } },
      },
    })
    const clients = clientRows
      .map((c) => ({
        name: c.name,
        revenue: round(c.invoices.reduce((s, i) => s + i.total, 0)),
        projectCount: c._count.projects,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4)

    return ok({
      kpis: {
        revenue: round(invoiceAgg._sum.total ?? 0),
        expenses: round(expenseAgg._sum.amount ?? 0),
        openDealsValue: round(dealAgg._sum.value ?? 0),
        openDealsCount: dealAgg._count,
        activeProjects,
        overdueTasks,
        employeeCount,
        todayPresent,
        todayTotal: employeeCount,
        pendingApprovals: pendingLeaves + pendingExpenses,
      },
      revenueTrend,
      pipeline,
      taskStatus,
      attendanceTrend,
      recentActivities,
      myTasks,
      upcomingDeadlines,
      clients,
    })
  })(req)
}
