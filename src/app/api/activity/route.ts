import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

/**
 * GET /api/activity?entityType=&entityId=&limit=
 * Org-scoped activity feed with optional entity filters.
 */
export async function GET(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'reports', 'view')
    if (denied) return denied

    const sp = req.nextUrl.searchParams
    const entityType = sp.get('entityType')
    const entityId = sp.get('entityId')
    const limitRaw = Number.parseInt(sp.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30

    const rows = await db.activityLog.findMany({
      where: {
        orgId: org.id,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { user: { select: { name: true } } } } },
    })

    return ok({
      items: rows.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        message: a.message,
        createdAt: a.createdAt,
        actorName: a.actor?.user.name ?? null,
      })),
    })
  })(req)
}
