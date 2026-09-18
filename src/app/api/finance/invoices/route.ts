import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, num, optNum, optDate, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

type InvoiceItem = { description: string; qty: number; rate: number }

const invoiceInclude = { client: { select: { id: true, name: true } } }

const money = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`
const round2 = (n: number) => Math.round(n * 100) / 100

function parseItems(s: string): InvoiceItem[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as InvoiceItem[]) : []
  } catch {
    return []
  }
}

function mapInvoice<T extends { items: string; client: { name: string } | null }>(inv: T) {
  const { items, client, ...rest } = inv
  return {
    ...rest,
    items: parseItems(items),
    clientName: client?.name ?? null,
  }
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'view')
    if (denied) return denied
    const invoices = await db.invoice.findMany({
      where: { orgId: org.id },
      orderBy: { issueDate: 'desc' },
      include: invoiceInclude,
    })
    return ok({ items: invoices.map(mapInvoice) })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'view')
    if (denied) return denied
    const b = await body(req)

    const number = str(b.number, 'number', { max: 60 })

    // client must belong to this org
    const clientId = str(b.clientId, 'clientId')
    const client = await db.client.findFirst({ where: { id: clientId, orgId: org.id } })
    if (!client) return fail('Invalid clientId', 422)

    // number must be unique within the org
    const dupe = await db.invoice.findFirst({ where: { number, orgId: org.id } })
    if (dupe) return fail(`Invoice number "${number}" already exists`, 409)

    // line items
    if (!Array.isArray(b.items) || b.items.length < 1) {
      return fail('At least one line item is required', 422)
    }
    const items: InvoiceItem[] = (b.items as unknown[]).map((raw) => {
      const it = raw as Record<string, unknown>
      return {
        description: str(it.description, 'items[].description', { max: 300 }),
        qty: num(it.qty, 'items[].qty', { required: false, min: 0 }),
        rate: num(it.rate, 'items[].rate', { required: false, min: 0 }),
      }
    })

    const dueDate = optDate(b.dueDate)
    if (!dueDate) return fail('Field "dueDate" is required', 422)

    const taxRate = optNum(b.taxRate) ?? 0
    const discount = optNum(b.discount) ?? 0
    const subtotal = round2(items.reduce((s, i) => s + i.qty * i.rate, 0))
    const taxAmount = round2((subtotal * taxRate) / 100)
    const total = round2(subtotal + taxAmount - discount)

    let projectId: string | null = null
    if (typeof b.projectId === 'string' && b.projectId.trim()) {
      const p = await db.project.findFirst({ where: { id: b.projectId.trim(), orgId: org.id } })
      if (!p) return fail('Invalid projectId', 422)
      projectId = p.id
    }

    const invoice = await db.invoice.create({
      data: {
        orgId: org.id,
        clientId: client.id,
        number,
        issueDate: optDate(b.issueDate) ?? new Date(),
        dueDate,
        status: 'DRAFT',
        items: JSON.stringify(items),
        subtotal,
        taxRate,
        taxAmount,
        discount,
        total,
        notes: b.notes === null || b.notes === undefined ? null : str(b.notes, 'notes', { required: false }) || null,
        projectId,
      },
      include: invoiceInclude,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'invoice.created',
      entityType: 'INVOICE',
      entityId: invoice.id,
      message: `Invoice #${invoice.number} created for ${client.name} (${money(invoice.total)})`,
    })

    return ok(mapInvoice(invoice), 201)
})
