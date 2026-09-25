import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, num, optNum, optDate, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { INVOICE_ROLES } from '@/lib/roles'
import { toCents, fromCents0 } from '@/lib/server/money'

type InvoiceItem = { description: string; qty: number; rate: number }

const invoiceInclude = { client: { select: { id: true, name: true } } }

// C7 fix: invoice money columns (subtotal/taxAmount/discount/total) are stored in
// cents. `money` is used for log messages and must convert from cents → dollars.
const money = (n: number) => `৳${Math.round(fromCents0(n)).toLocaleString('en-US')}`

function parseItems(s: string): InvoiceItem[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as InvoiceItem[]) : []
  } catch {
    return []
  }
}

// C7 fix: convert every money field from cents → dollars on the way out. The items
// JSON stores `rate` in cents, so map each line too. taxRate is a percentage and
// is NOT money — it passes through unchanged.
function mapInvoice<T extends { items: string; client: { name: string } | null; subtotal: number; taxAmount: number; discount: number; total: number }>(inv: T) {
  const { items, client, subtotal, taxAmount, discount, total, ...rest } = inv
  return {
    ...rest,
    items: parseItems(items).map((it) => ({ ...it, rate: fromCents0(it.rate) })),
    clientName: client?.name ?? null,
    subtotal: fromCents0(subtotal),
    taxAmount: fromCents0(taxAmount),
    discount: fromCents0(discount),
    total: fromCents0(total),
  }
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'view')
    if (denied) return denied
    // H6-fe: optional pagination — defaults to a single page of 50 so the
    // invoices view can implement a "Load more" pattern. Callers that omit
    // both params still get a sensible default instead of every record.
    const url = new URL(req.url)
    const limit = Math.max(1, Math.min(500, optNum(url.searchParams.get('limit')) ?? 50))
    const offset = Math.max(0, optNum(url.searchParams.get('offset')) ?? 0)
    const invoices = await db.invoice.findMany({
      where: { orgId: org.id },
      orderBy: { issueDate: 'desc' },
      include: invoiceInclude,
      take: limit,
      skip: offset,
    })
    return ok({ items: invoices.map(mapInvoice) })
})

// POST /api/finance/invoices — create invoice (finance-invoices FULL + INVOICE_ROLES,
// matching PATCH/DELETE on /api/finance/invoices/[id])
export const POST = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-invoices', 'full')
    if (denied) return denied
    requireRole(ctx, [...INVOICE_ROLES])
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
    // C7 fix: items[].rate arrives in dollars → convert to cents for DB storage
    // (the items JSON stores rate in cents; mapInvoice converts back on read).
    const items: InvoiceItem[] = (b.items as unknown[]).map((raw) => {
      const it = raw as Record<string, unknown>
      return {
        description: str(it.description, 'items[].description', { max: 300 }),
        qty: num(it.qty, 'items[].qty', { required: false, min: 0 }),
        rate: toCents(num(it.rate, 'items[].rate', { required: false, min: 0 }))!,
      }
    })

    const dueDate = optDate(b.dueDate)
    if (!dueDate) return fail('Field "dueDate" is required', 422)

    // C7 fix: taxRate is a percentage (0–100) and stays a float — NOT money.
    // discount arrives in dollars → convert to cents. All derived totals are
    // computed and stored in cents (integer).
    const taxRate = optNum(b.taxRate) ?? 0
    const discount = toCents(optNum(b.discount) ?? 0)!
    const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
    const taxAmount = Math.round((subtotal * taxRate) / 100)
    const total = subtotal + taxAmount - discount

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
