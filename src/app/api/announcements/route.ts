import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg, requireRole, body, str, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const announcementInclude = {
  author: { select: { id: true, role: true, title: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
} as const

/** GET /api/announcements — org announcements, pinned first */
export const GET = withAuth(async (_req, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'announcements', 'view')
  if (denied) return denied

  const announcements = await db.announcement.findMany({
    where: { orgId: org.id },
    include: announcementInclude,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  const items = announcements.map((a) => ({ ...a, authorName: a.author?.user.name ?? null }))
  return ok({ items })
})

/** POST /api/announcements — publish announcement (OWNER/ADMIN/MANAGER/HR) */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  requireRole(ctx, ['ADMIN', 'MANAGER', 'HR'])
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'announcements', 'full')
  if (denied) return denied

  const data = await body(req)
  const title = str(data.title, 'title', { max: 200 })
  const text = str(data.body, 'body', { max: 20000 })
  const pinned = data.pinned === true

  const announcement = await db.announcement.create({
    data: { orgId: org.id, authorMembershipId: membership.id, title, body: text, pinned },
    include: announcementInclude,
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'announcement.created',
    entityType: 'ANNOUNCEMENT',
    entityId: announcement.id,
    message: `Announcement "${title}" published${pinned ? ' (pinned)' : ''}`,
  })

  const members = await db.membership.findMany({
    where: { orgId: org.id, status: { not: 'ALUMNI' } },
    select: { userId: true },
  })
  await notifyUsers({
    orgId: org.id,
    userIds: members.map((m) => m.userId).filter((uid) => uid !== ctx.user.id),
    type: 'SYSTEM',
    title: `New announcement: ${title}`,
    body: text.slice(0, 140),
    module: 'announcements',
  })

  return ok({ ...announcement, authorName: announcement.author?.user.name ?? null }, 201)
})
