import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, optNum } from '@/lib/server/api'
import { requirePlatform } from '../guard'

// Audit rows store JSON as strings — parse for the client, null-safe.
function parseJson(v: string | null): unknown {
  if (!v) return null
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
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
      oldValues: parseJson(r.oldValues),
      newValues: parseJson(r.newValues),
    })),
  })
})
