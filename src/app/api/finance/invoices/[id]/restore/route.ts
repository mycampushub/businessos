import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { INVOICE_ROLES } from '@/lib/roles'

// POST /api/finance/invoices/[id]/restore — undo a soft-delete (M15-fe)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'full')
    if (denied) return denied
    requireRole(ctx, [...INVOICE_ROLES])

    const invoice = await db.invoice.findFirst({
      where: { id, orgId: org.id, deletedAt: { not: null } },
      select: { id: true, number: true },
    })
    if (!invoice) return fail('Deleted invoice not found', 404)

    await db.invoice.update({ where: { id: invoice.id }, data: { deletedAt: null } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'invoice.restored',
      entityType: 'INVOICE',
      entityId: invoice.id,
      message: `Invoice #${invoice.number} restored`,
    })

    return ok({ id: invoice.id, restored: true })
  })(req)
}
