import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'

type RouteParams = { params: Promise<{ id: string }> }

const announcementInclude = {
  author: { select: { id: true, role: true, title: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
} as const

/** PATCH /api/announcements/[id] — edit title/body/pinned (publisher roles or the author) */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const announcement = await db.announcement.findFirst({
      where: { id, orgId: org.id },
    })
    if (!announcement) return fail('Announcement not found', 404)

    const role = membership.role
    const isAuthor = announcement.authorMembershipId === membership.id
    if (!['OWNER', 'ADMIN', 'MANAGER', 'HR'].includes(role) && !isAuthor) {
      return fail('Only owners, admins, managers, HR or the original author can edit announcements', 403)
    }

    const data = await body(req)
    const updates: { title?: string; body?: string; pinned?: boolean } = {}

    if (data.title !== undefined) {
      updates.title = str(data.title, 'title', { max: 200 })
    }
    if (data.body !== undefined) {
      updates.body = str(data.body, 'body', { max: 20000 })
    }
    if (data.pinned !== undefined) {
      if (typeof data.pinned !== 'boolean') return fail('Field "pinned" must be a boolean', 422)
      updates.pinned = data.pinned
    }
    if (Object.keys(updates).length === 0) {
      return fail('No updatable fields provided', 422)
    }

    const updated = await db.announcement.update({
      where: { id: announcement.id },
      data: updates,
      include: announcementInclude,
    })

    const changed = Object.keys(updates).join(', ')
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'announcement.updated',
      entityType: 'ANNOUNCEMENT',
      entityId: announcement.id,
      message: `Announcement "${updated.title}" updated (${changed})`,
    })

    return ok({ ...updated, authorName: updated.author?.user.name ?? null })
  })(req)
}

/** DELETE /api/announcements/[id] — publisher roles or the author */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const announcement = await db.announcement.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, title: true, authorMembershipId: true },
    })
    if (!announcement) return fail('Announcement not found', 404)

    const role = membership.role
    const isAuthor = announcement.authorMembershipId === membership.id
    if (!['OWNER', 'ADMIN', 'MANAGER', 'HR'].includes(role) && !isAuthor) {
      return fail('Only owners, admins, managers, HR or the original author can delete announcements', 403)
    }

    await db.announcement.delete({ where: { id: announcement.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'announcement.deleted',
      entityType: 'ANNOUNCEMENT',
      entityId: announcement.id,
      message: `Announcement "${announcement.title}" deleted`,
    })

    return ok({})
  })(req)
}
