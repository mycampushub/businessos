import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, oneOf, logActivity, notifyUsers, isManagement } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const ACTIONS = ['approve', 'reject', 'pay'] as const

const money = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`

async function decorateExpense(
  orgId: string,
  expense: { projectId: string | null; membership: { user: { name: string } } } & Record<string, unknown>
) {
  let projectName: string | null = null
  if (expense.projectId) {
    const p = await db.project.findFirst({ where: { id: expense.projectId, orgId }, select: { name: true } })
    projectName = p?.name ?? null
  }
  return { ...expense, userName: expense.membership?.user?.name ?? null, projectName }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    // approve/reject/pay are reviewer actions → module full access required
    const denied = requireAccess(ctx, 'finance-expenses', 'full')
    if (denied) return denied
    const expense = await db.expense.findFirst({
      where: { id, orgId: org.id },
      include: { membership: { select: { id: true, userId: true, user: { select: { name: true } } } } },
    })
    if (!expense) return fail('Expense not found', 404)

    const b = await body(req)
    const action = oneOf(b.action, ACTIONS)
    const role = membership.role // OWNER passes every role check below

    const canReview = ['MANAGER', 'HR', 'ADMIN', 'OWNER', 'FINANCE'].includes(role)
    const canFinance = ['FINANCE', 'ADMIN', 'OWNER'].includes(role)

    let newStatus: string
    let logAction: string
    let notifyTitle: string

    if (action === 'approve') {
      if (!canReview) return fail('Insufficient permissions to approve expenses', 403)
      if (expense.status === 'SUBMITTED') {
        newStatus = 'MANAGER_APPROVED'
      } else if (expense.status === 'MANAGER_APPROVED' && canFinance) {
        newStatus = 'FINANCE_APPROVED'
      } else {
        return fail(`Cannot approve an expense in status ${expense.status}`, 403)
      }
      logAction = 'expense.approved'
      notifyTitle = `Expense approved: "${expense.title}"`
    } else if (action === 'reject') {
      if (!canReview) return fail('Insufficient permissions to reject expenses', 403)
      if (!['SUBMITTED', 'MANAGER_APPROVED', 'FINANCE_APPROVED'].includes(expense.status)) {
        return fail(`Cannot reject an expense in status ${expense.status}`, 403)
      }
      newStatus = 'REJECTED'
      logAction = 'expense.rejected'
      notifyTitle = `Expense rejected: "${expense.title}"`
    } else {
      // 'pay'
      if (!canFinance) return fail('Only finance, admin or owner can pay expenses', 403)
      if (expense.status !== 'FINANCE_APPROVED') {
        return fail(`Cannot pay an expense in status ${expense.status} (requires FINANCE_APPROVED)`, 403)
      }
      newStatus = 'PAID'
      logAction = 'expense.paid'
      notifyTitle = `Expense paid: "${expense.title}"`
    }

    const updated = await db.expense.update({
      where: { id },
      data: { status: newStatus, approvedById: membership.id },
      include: { membership: { select: { user: { select: { name: true } } } } },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: logAction,
      entityType: 'EXPENSE',
      entityId: expense.id,
      message: `Expense "${expense.title}" ${action === 'pay' ? 'paid' : action + 'd'} → ${newStatus} (${money(expense.amount)})`,
    })

    // notify the expense owner (skip self-notification)
    if (expense.membership.userId && expense.membership.userId !== ctx.user.id) {
      await notifyUsers({
        orgId: org.id,
        userIds: [expense.membership.userId],
        type: 'FINANCE',
        title: notifyTitle,
        body: `${money(expense.amount)} · by ${ctx.user.name}`,
        module: 'finance-expenses',
      })
    }

    return ok(await decorateExpense(org.id, updated))
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    // deletions are reviewer-level: finance-expenses module FULL (mirrors PATCH approve/reject/pay)
    const denied = requireAccess(ctx, 'finance-expenses', 'full')
    if (denied) return denied
    const expense = await db.expense.findFirst({ where: { id, orgId: org.id } })
    if (!expense) return fail('Expense not found', 404)
    // paid expenses are part of the financial record — reject with 409 instead of deleting
    if (expense.status === 'PAID') return fail('Paid expenses cannot be deleted', 409)
    if (expense.membershipId !== membership.id && !isManagement(ctx)) {
      return fail('Only the expense owner or management can delete it', 403)
    }
    await db.expense.delete({ where: { id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'expense.deleted',
      entityType: 'EXPENSE',
      entityId: id,
      message: `Expense "${expense.title}" deleted`,
    })
    return ok({})
  })(req)
}
