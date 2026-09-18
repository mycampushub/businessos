import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, oneOf, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const INVOICE_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const
const invoiceInclude = { client: { select: { id: true, name: true } } }

const money = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`

function safeParseItems(s: string): Array<{ description: string; qty: number; rate: number }> {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'full')
    if (denied) return denied
    const existing = await db.invoice.findFirst({ where: { id, orgId: org.id }, include: invoiceInclude })
    if (!existing) return fail('Invoice not found', 404)

    const b = await body(req)
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

    return ok({
      ...invoice,
      items: safeParseItems(invoice.items),
      clientName: invoice.client?.name ?? null,
    })
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'full')
    if (denied) return denied
    const existing = await db.invoice.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Invoice not found', 404)
    await db.invoice.delete({ where: { id } })
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
