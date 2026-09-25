import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, num, optNum, optDate, oneOf, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { toCents, fromCents0 } from '@/lib/server/money'

const EXPENSE_CATEGORIES = ['GENERAL', 'TRAVEL', 'MEALS', 'SOFTWARE', 'EQUIPMENT', 'MARKETING', 'OFFICE', 'TRAINING'] as const

// C7 fix: expense.amount is stored in cents. `money` is for log messages and must
// convert from cents → dollars before formatting.
const money = (n: number) => `৳${Math.round(fromCents0(n)).toLocaleString('en-US')}`

/** Expense.projectId is a plain column — resolve project names manually (org-scoped). */
async function decorateExpenses(
  orgId: string,
  expenses: Array<{ projectId: string | null; membership: { user: { name: string } } } & Record<string, unknown>>
) {
  const projectIds = [...new Set(expenses.map((e) => e.projectId).filter((x): x is string => !!x))]
  const projects = projectIds.length
    ? await db.project.findMany({ where: { id: { in: projectIds }, orgId }, select: { id: true, name: true } })
    : []
  const nameById = new Map(projects.map((p) => [p.id, p.name]))
  return expenses.map((e) => ({
    ...e,
    // C7 fix: convert amount from cents → dollars for the API response.
    amount: fromCents0(e.amount as number),
    userName: e.membership?.user?.name ?? null,
    projectName: e.projectId ? nameById.get(e.projectId) ?? null : null,
  }))
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const mine = req.nextUrl.searchParams.get('mine') === 'true'
    // self-service exemption: ?mine=true (own expenses) needs no module access — only the full org list is guarded
    if (!mine) {
      const denied = requireAccess(ctx, 'finance-expenses', 'view')
      if (denied) return denied
    }
    // H6-fe: optional pagination — defaults to a single page of 50 so the
    // expenses view can implement a "Load more" pattern. Callers that omit
    // both params still get a sensible default instead of every record.
    const limit = Math.max(1, Math.min(500, optNum(req.nextUrl.searchParams.get('limit')) ?? 50))
    const offset = Math.max(0, optNum(req.nextUrl.searchParams.get('offset')) ?? 0)
    const expenses = await db.expense.findMany({
      where: { orgId: org.id, ...(mine ? { membershipId: membership.id } : {}) },
      orderBy: { date: 'desc' },
      include: { membership: { select: { user: { select: { name: true } } } } },
      take: limit,
      skip: offset,
    })
    return ok({ items: await decorateExpenses(org.id, expenses) })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    // self-service exemption: submitting your own expense needs no module access (employee self-service)
    const b = await body(req)

    const title = str(b.title, 'title', { max: 200 })
    const category = oneOf(b.category, EXPENSE_CATEGORIES, 'GENERAL')
    // C7 fix: amount arrives in dollars → convert to cents for DB storage.
    const amount = num(b.amount, 'amount')
    if (amount <= 0) return fail('Amount must be greater than 0', 422)
    const amountCents = toCents(amount)!

    let projectId: string | null = null
    if (typeof b.projectId === 'string' && b.projectId.trim()) {
      const p = await db.project.findFirst({ where: { id: b.projectId.trim(), orgId: org.id } })
      if (!p) return fail('Invalid projectId', 422)
      projectId = p.id
    }

    const expense = await db.expense.create({
      data: {
        orgId: org.id,
        membershipId: membership.id,
        title,
        category,
        amount: amountCents,
        date: optDate(b.date) ?? new Date(),
        projectId,
        notes: b.notes === null || b.notes === undefined ? null : str(b.notes, 'notes', { required: false }) || null,
        status: 'SUBMITTED',
      },
      include: { membership: { select: { user: { select: { name: true } } } } },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'expense.created',
      entityType: 'EXPENSE',
      entityId: expense.id,
      message: `Expense "${expense.title}" submitted (${money(expense.amount)})`,
    })
    await notifyUsers({
      orgId: org.id,
      userIds: await managerUserIds(org.id),
      type: 'FINANCE',
      title: 'Expense awaiting approval',
      body: `"${expense.title}" — ${money(expense.amount)} by ${ctx.user.name}`,
      module: 'finance-expenses',
    })

    const [decorated] = await decorateExpenses(org.id, [expense])
    return ok(decorated, 201)
})
