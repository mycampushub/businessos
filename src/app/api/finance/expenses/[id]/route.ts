import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok, fail, withAuth, requireOrg, body, str, num, optDate, oneOf, logActivity, notifyUsers, isManagement, audit,
} from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { toCents, fromCents0 } from '@/lib/server/money'

const ACTIONS = ['approve', 'reject', 'pay'] as const
const EXPENSE_CATEGORIES = ['GENERAL', 'TRAVEL', 'MEALS', 'SOFTWARE', 'EQUIPMENT', 'MARKETING', 'OFFICE', 'TRAINING'] as const
/** Editable body fields — used to detect "edit mode" vs the legacy action-only PATCH. */
const EDITABLE_KEYS = ['title', 'amount', 'category', 'date', 'description', 'notes'] as const
/** Statuses under which the submitter (or OWNER/ADMIN) can still edit the claim. */
const EDITABLE_STATUSES = ['SUBMITTED', 'PENDING']

// C7 fix: expense.amount is stored in cents. `money` is for log messages and must
// convert from cents → dollars before formatting.
const money = (n: number) => `৳${Math.round(fromCents0(n)).toLocaleString('en-US')}`

async function decorateExpense(
  orgId: string,
  expense: { projectId: string | null; membership: { user: { name: string } } } & Record<string, unknown>
) {
  let projectName: string | null = null
  if (expense.projectId) {
    const p = await db.project.findFirst({ where: { id: expense.projectId, orgId }, select: { name: true } })
    projectName = p?.name ?? null
  }
  return {
    ...expense,
    // C7 fix: convert amount from cents → dollars for the API response.
    amount: fromCents0(expense.amount as number),
    userName: expense.membership?.user?.name ?? null,
    projectName,
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const expense = await db.expense.findFirst({
      where: { id, orgId: org.id },
      include: { membership: { select: { id: true, userId: true, user: { select: { name: true } } } } },
    })
    if (!expense) return fail('Expense not found', 404)

    const b = await body(req)

    // -------- EDIT MODE: editable fields only allowed while SUBMITTED/PENDING --------
    // Self-service exemption: the submitter can edit their own draft claim without
    // module FULL access (mirrors the POST self-service exemption for ?mine=true).
    if (EDITABLE_KEYS.some((k) => k in b)) {
      if (!EDITABLE_STATUSES.includes(expense.status)) {
        return fail(
          'Only expenses in SUBMITTED status can be edited. Approve, reject or pay actions are still available.',
          422,
        )
      }
      // Only the submitter OR OWNER/ADMIN may edit
      const isOwner = expense.membershipId === membership.id
      if (!isOwner && !isManagement(ctx)) {
        return fail('Only the expense submitter or an owner/admin can edit it', 403)
      }

      const oldValues = {
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        notes: expense.notes,
      }

      // title (max 120), amount (>0), category (enum), date (date), description/notes (max 1000, optional)
      const data: { title?: string; amount?: number; category?: string; date?: Date; notes?: string | null } = {}
      if ('title' in b) data.title = str(b.title, 'title', { max: 120 })
      if ('amount' in b) {
        const amount = num(b.amount, 'amount')
        if (amount <= 0) return fail('Amount must be greater than 0', 422)
        // C7 fix: amount arrives in dollars → convert to cents for DB storage.
        data.amount = toCents(amount)!
      }
      if ('category' in b) data.category = oneOf(b.category, EXPENSE_CATEGORIES, 'GENERAL')
      if ('date' in b) {
        const d = optDate(b.date)
        if (!d) return fail('Field "date" is required', 422)
        data.date = d
      }
      // Accept either `description` (task spec) or `notes` (existing column name) → store in `notes`.
      if ('description' in b || 'notes' in b) {
        const raw = 'description' in b ? b.description : b.notes
        data.notes = raw === null || raw === undefined ? null : str(raw, 'description', { required: false, max: 1000 }) || null
      }

      if (Object.keys(data).length === 0) {
        return fail('No editable fields provided', 422)
      }

      const updated = await db.expense.update({
        where: { id },
        data,
        include: { membership: { select: { user: { select: { name: true } } } } },
      })

      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'expense.updated',
        entityType: 'EXPENSE',
        entityId: expense.id,
        message: `Expense "${updated.title}" edited (${money(updated.amount)})`,
      })
      await audit({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'expense.updated',
        entity: 'Expense',
        entityId: expense.id,
        oldValues,
        newValues: {
          title: updated.title,
          amount: updated.amount,
          category: updated.category,
          date: updated.date,
          notes: updated.notes,
        },
        impersonatedBy: ctx.session?.impersonatedBy?.id ?? null, // MA-1 #8 fix
      })

      return ok(await decorateExpense(org.id, updated))
    }

    // -------- ACTION FLOW (existing behavior preserved) --------
    // DA-C1 fix: approve/reject are reviewer actions that MANAGER/HR should be able to do
    // even with finance-expenses VIEW access. Only the pay action (finance-level) needs FULL.
    // The module-access check is applied per-action below, not as a blanket gate here.
    const action = oneOf(b.action, ACTIONS)
    const role = membership.role // OWNER passes every role check below

    const canReview = ['MANAGER', 'HR', 'ADMIN', 'OWNER', 'FINANCE'].includes(role)
    const canFinance = ['FINANCE', 'ADMIN', 'OWNER'].includes(role)

    // DA-C1 fix: 'pay' is a finance-level action — require module FULL access.
    // 'approve'/'reject' are reviewer actions — allow with VIEW access (MANAGER/HR have VIEW by default).
    if (action === 'pay') {
      const denied = requireAccess(ctx, 'finance-expenses', 'full')
      if (denied) return denied
    }

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
