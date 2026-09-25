import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok, fail, withAuth, requireOrg, requireRole, body, str, num, oneOf, optDate, logActivity, notifyUsers, audit,
} from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { INVOICE_ROLES } from '@/lib/roles'
import { toCents, fromCents0 } from '@/lib/server/money'

const INVOICE_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const
const invoiceInclude = { client: { select: { id: true, name: true } } }

type InvoiceItem = { description: string; qty: number; rate: number }

// C7 fix: invoice money columns are stored in cents. `money` is for log messages
// and must convert from cents → dollars before formatting.
const money = (n: number) => `৳${Math.round(fromCents0(n)).toLocaleString('en-US')}`

/** Editable body fields — used to detect "edit mode" vs the legacy status-only PATCH. */
const EDITABLE_KEYS = ['number', 'clientId', 'issueDate', 'dueDate', 'taxRate', 'discount', 'items'] as const

function safeParseItems(s: string): InvoiceItem[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as InvoiceItem[]) : []
  } catch {
    return []
  }
}

// C7 fix: convert every money field from cents → dollars on the way out. The items
// JSON stores `rate` in cents, so map each line too. taxRate is a percentage and
// is NOT money — it passes through unchanged inside `...rest`.
function invoiceResponse<
  T extends { items: string; client: { name: string } | null; subtotal: number; taxAmount: number; discount: number; total: number }
>(inv: T) {
  const { items, client, subtotal, taxAmount, discount, total, ...rest } = inv
  return {
    ...rest,
    items: safeParseItems(items).map((it) => ({ ...it, rate: fromCents0(it.rate) })),
    clientName: client?.name ?? null,
    subtotal: fromCents0(subtotal),
    taxAmount: fromCents0(taxAmount),
    discount: fromCents0(discount),
    total: fromCents0(total),
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'full')
    if (denied) return denied
    // H11 fix: add the same INVOICE_ROLES role gate that POST enforces (OWNER/ADMIN/FINANCE).
    requireRole(ctx, [...INVOICE_ROLES])
    const existing = await db.invoice.findFirst({ where: { id, orgId: org.id }, include: invoiceInclude })
    if (!existing) return fail('Invoice not found', 404)

    const b = await body(req)
    const hasEdits = EDITABLE_KEYS.some((k) => k in b)

    // -------- EDIT MODE: editable fields only allowed on DRAFT invoices --------
    if (hasEdits) {
      if (existing.status !== 'DRAFT') {
        return fail(
          'Only invoices in DRAFT status can be edited. Use the status field to advance sent/paid invoices.',
          422,
        )
      }

      // number (string, max 50) — must remain unique within the org
      const number = 'number' in b ? str(b.number, 'number', { max: 50 }) : existing.number
      if (number !== existing.number) {
        const dupe = await db.invoice.findFirst({ where: { number, orgId: org.id, NOT: { id } } })
        if (dupe) return fail(`Invoice number "${number}" already exists`, 409)
      }

      // clientId (must belong to org)
      let clientId = existing.clientId
      if ('clientId' in b) {
        const cid = str(b.clientId, 'clientId')
        const client = await db.client.findFirst({ where: { id: cid, orgId: org.id } })
        if (!client) return fail('Invalid clientId', 422)
        clientId = client.id
      }

      // items (replaces line items; recalculates subtotal/taxAmount/total)
      let items: InvoiceItem[] = safeParseItems(existing.items)
      if ('items' in b) {
        if (!Array.isArray(b.items) || b.items.length < 1) {
          return fail('At least one line item is required', 422)
        }
        // C7 fix: items[].rate arrives in dollars → convert to cents for DB storage.
        items = (b.items as unknown[]).map((raw) => {
          const it = raw as Record<string, unknown>
          return {
            description: str(it.description, 'items[].description', { max: 300 }),
            qty: num(it.qty, 'items[].qty', { required: false, min: 0 }),
            rate: toCents(num(it.rate, 'items[].rate', { required: false, min: 0 }))!,
          }
        })
      }

      // taxRate (0–100) is a percentage, NOT money — stays a float.
      // C7 fix: discount arrives in dollars → convert to cents. existing.discount
      // is already in cents (from DB), so it passes through unchanged.
      const taxRate = 'taxRate' in b ? num(b.taxRate, 'taxRate', { required: false, min: 0, max: 100 }) : existing.taxRate
      const discount = 'discount' in b ? toCents(num(b.discount, 'discount', { required: false, min: 0 }))! : existing.discount

      // dates — dueDate must be on/after issueDate
      let issueDate = existing.issueDate
      if ('issueDate' in b) {
        const d = optDate(b.issueDate)
        if (!d) return fail('Field "issueDate" is required', 422)
        issueDate = d
      }
      let dueDate = existing.dueDate
      if ('dueDate' in b) {
        const d = optDate(b.dueDate)
        if (!d) return fail('Field "dueDate" is required', 422)
        dueDate = d
      }
      if (dueDate.getTime() < issueDate.getTime()) {
        return fail('Due date must be on or after the issue date', 422)
      }

      // C7 fix: recalculate totals in cents (integer). items[].rate + discount are
      // both in cents here, so the sums are integer cents.
      const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
      const taxAmount = Math.round((subtotal * taxRate) / 100)
      const total = subtotal + taxAmount - discount

      const oldValues = {
        number: existing.number,
        clientId: existing.clientId,
        issueDate: existing.issueDate,
        dueDate: existing.dueDate,
        items: safeParseItems(existing.items),
        taxRate: existing.taxRate,
        discount: existing.discount,
        subtotal: existing.subtotal,
        taxAmount: existing.taxAmount,
        total: existing.total,
      }

      const updated = await db.invoice.update({
        where: { id },
        data: {
          number,
          clientId,
          issueDate,
          dueDate,
          items: JSON.stringify(items),
          subtotal,
          taxRate,
          taxAmount,
          discount,
          total,
        },
        include: invoiceInclude,
      })

      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'invoice.updated',
        entityType: 'INVOICE',
        entityId: updated.id,
        message: `Invoice #${updated.number} edited (total ${money(updated.total)})`,
      })
      await audit({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'invoice.updated',
        entity: 'Invoice',
        entityId: updated.id,
        oldValues,
        newValues: {
          number: updated.number,
          clientId: updated.clientId,
          issueDate: updated.issueDate,
          dueDate: updated.dueDate,
          items,
          taxRate: updated.taxRate,
          discount: updated.discount,
          subtotal: updated.subtotal,
          taxAmount: updated.taxAmount,
          total: updated.total,
        },
        // H6-auth fix: record impersonation for forensic audit trail
        impersonatedBy: ctx.session?.impersonatedBy?.id ?? null,
      })

      return ok(invoiceResponse(updated))
    }

    // -------- STATUS-ONLY UPDATE (existing behavior preserved) --------
    const status = oneOf(b.status, INVOICE_STATUSES)
    const isPaid = status === 'PAID'

    const invoice = await db.invoice.update({
      where: { id },
      data: {
        status,
        paidAt: isPaid ? new Date() : null,
      },
      include: invoiceInclude,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'invoice.status',
      entityType: 'INVOICE',
      entityId: invoice.id,
      message: `Invoice #${invoice.number} marked ${status}`,
    })

    if (isPaid) {
      // notify finance-role users + the org owner
      const financeUsers = await db.membership.findMany({
        where: { orgId: org.id, role: 'FINANCE' },
        select: { userId: true },
      })
      await notifyUsers({
        orgId: org.id,
        userIds: [...financeUsers.map((f) => f.userId), org.ownerId],
        type: 'FINANCE',
        title: `Invoice #${invoice.number} paid`,
        body: `${money(invoice.total)} from ${invoice.client?.name ?? 'client'}`,
        module: 'finance-invoices',
      })
    }

    return ok(invoiceResponse(invoice))
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'full')
    if (denied) return denied
    // H11 fix: add the same INVOICE_ROLES role gate that POST enforces (OWNER/ADMIN/FINANCE).
    requireRole(ctx, [...INVOICE_ROLES])
    const existing = await db.invoice.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Invoice not found', 404)
    await db.invoice.update({ where: { id }, data: { deletedAt: new Date() } }) // M15-fe soft-delete
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'invoice.deleted',
      entityType: 'INVOICE',
      entityId: id,
      message: `Invoice #${existing.number} deleted`,
    })
    return ok({})
  })(req)
}
