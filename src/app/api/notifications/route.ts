import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str, withAuth } from '@/lib/server/api'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/notifications — for the current user; visible scope is
 * (orgId = null) OR (orgId = active org, when one exists).
 * Returns a plain array (the WorkspaceProvider store expects `data` to be an array).
 */
export async function GET(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const where: Prisma.NotificationWhereInput = { userId: ctx.user.id }
    if (ctx.activeOrgId) {
      where.OR = [{ orgId: null }, { orgId: ctx.activeOrgId }]
    } else {
      where.orgId = null
    }

    const rows = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 40,
    })

    return ok(
      rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        module: n.module,
        readAt: n.readAt,
        createdAt: n.createdAt,
      }))
    )
  })(req)
}

/** PATCH /api/notifications — mark one ({id}) or all ({all:true}) as read. */
export async function PATCH(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const data = await body<Record<string, unknown>>(req)
    const where: Prisma.NotificationWhereInput = {
      userId: ctx.user.id,
      readAt: null,
    }

    if (data.all === true) {
      // every unread notification of the current user
    } else {
      where.id = str(data.id, 'id')
    }

    const result = await db.notification.updateMany({
      where,
      data: { readAt: new Date() },
    })
    return ok({ updated: result.count })
  })(req)
}

/** DELETE /api/notifications — dismiss notifications.
 *  - ?id=<notificationId> — deletes a single notification (must belong to the user).
 *  - ?all=true            — deletes ALL of the user's READ notifications (readAt is not null). */
export async function DELETE(req: NextRequest) {
  return withAuth(async (rq, ctx) => {
    const sp = rq.nextUrl.searchParams
    const all = sp.get('all') === 'true'
    const singleId = sp.get('id')

    if (all) {
      // clear every read notification of the current user (unread ones are kept —
      // dismissing those would silently drop un-viewed items)
      const result = await db.notification.deleteMany({
        where: { userId: ctx.user.id, readAt: { not: null } },
      })
      return ok({ deleted: result.count })
    }

    if (!singleId) {
      return fail('Provide ?id=<notificationId> or ?all=true', 422)
    }

    // single delete — verify ownership before deleting
    const owned = await db.notification.findFirst({
      where: { id: singleId, userId: ctx.user.id },
      select: { id: true },
    })
    if (!owned) return fail('Notification not found', 404)

    await db.notification.delete({ where: { id: owned.id } })
    return ok({ deleted: 1 })
  })(req)
}
