import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, optNum } from '@/lib/server/api'
import { requirePlatform } from '../guard'
import { fromCents0 } from '@/lib/server/money'

// Audit rows store JSON as strings — parse for the client, null-safe.
function parseJson(v: string | null): unknown {
  if (!v) return null
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

// MA-1 #11 fix: AuditLog oldValues/newValues store raw DB values (cents for money fields).
// Convert known money fields from cents → taka for display. Keys are matched by name.
const MONEY_KEYS = new Set([
  'baseSalary', 'amount', 'value', 'budget', 'subtotal', 'taxAmount', 'discount', 'total',
  'gross', 'net', 'allowances', 'deductions', 'unpaidLeaveAmount', 'priceMonthly', 'priceYearly',
  'amountMonthly', 'latePenaltyAmount', 'salaryMin', 'salaryMax',
])
function convertMoneyFields(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (MONEY_KEYS.has(k) && typeof v === 'number') {
      result[k] = fromCents0(v)
    } else {
      result[k] = v
    }
  }
  return result
}

// GET /api/platform/audit?limit= — cross-org audit trail (limit 1..100, default 50)
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const limit = Math.min(100, Math.max(1, optNum(req.nextUrl.searchParams.get('limit')) ?? 50))

  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      org: { select: { id: true, name: true } },
      actor: { select: { user: { select: { name: true } } } },
    },
  })

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actorName: r.actor?.user.name ?? null,
      orgId: r.orgId,
      orgName: r.org?.name ?? null,
      oldValues: convertMoneyFields(parseJson(r.oldValues)),
      newValues: convertMoneyFields(parseJson(r.newValues)),
    })),
  })
})
