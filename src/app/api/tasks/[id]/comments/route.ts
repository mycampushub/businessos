import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { canAccessTask } from '@/lib/server/projects-access'

type RouteParams = { params: Promise<{ id: string }> }

/** task fields needed by canAccessTask (assignment scoping) + comment creation */
const taskAccessSelect = {
  id: true,
  title: true,
  orgId: true,
  projectId: true,
  assigneeMembershipId: true,
  creatorMembershipId: true,
  project: { select: { managerMembershipId: true, projectMembers: { select: { membershipId: true } } } },
} as const

const commentInclude = {
  author: { select: { id: true, role: true, title: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
} as const

/** GET /api/tasks/[id]/comments — list task comments (asc) */
export async function GET(_req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_r, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied

    const task = await db.task.findFirst({ where: { id, orgId: org.id }, select: taskAccessSelect })
    if (!task || !canAccessTask(org.id, membership.id, membership.role, task)) {
      return fail('Task not found', 404)
    }

    const comments = await db.comment.findMany({
      where: { orgId: org.id, entityType: 'TASK', entityId: task.id },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    })

    const items = comments.map((c) => ({
      ...c,
      authorName: c.author?.user.name ?? null,
    }))
    return ok({ items })
  })(_req)
}

/** POST /api/tasks/[id]/comments — add a comment (tasks module view-min, task must be visible) */
export async function POST(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_r, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied

    const task = await db.task.findFirst({ where: { id, orgId: org.id }, select: taskAccessSelect })
    if (!task || !canAccessTask(org.id, membership.id, membership.role, task)) {
      return fail('Task not found', 404)
    }

    const data = await body(req)
    const text = str(data.body, 'body', { max: 8000 })

    const comment = await db.comment.create({
      data: {
        orgId: org.id,
        entityType: 'TASK',
        entityId: task.id,
        taskId: task.id,
        authorMembershipId: membership.id,
        body: text,
      },
      include: commentInclude,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'comment.created',
      entityType: 'TASK',
      entityId: task.id,
      message: `${ctx.user.name} commented on "${task.title}"`,
    })

    let assigneeUserId: string | null = null
    if (task.assigneeMembershipId) {
      const assignee = await db.membership.findUnique({
        where: { id: task.assigneeMembershipId },
        select: { userId: true },
      })
      if (assignee) assigneeUserId = assignee.userId
      if (assignee && assignee.userId !== ctx.user.id) {
        await notifyUsers({
          orgId: org.id,
          userIds: [assignee.userId],
          type: 'TASK',
          title: `New comment on ${task.title}`,
          body: `${ctx.user.name}: ${text.slice(0, 120)}`,
          module: 'my-tasks',
        })
      }
    }

    // T4-c @mentions: notify org members matched by @tokens in the comment text
    // (token matches user.name prefix, first word of the name, or email local-part).
    // Commenter + already-notified assignee are excluded; max 10 notifications.
    const mentionTokens = [
      ...new Set((text.match(/@([A-Za-z0-9_.-]{2,30})/g) ?? []).map((t) => t.slice(1).toLowerCase())),
    ].slice(0, 10)
    if (mentionTokens.length) {
      const members = await db.membership.findMany({
        where: { orgId: org.id },
        select: { user: { select: { id: true, name: true, email: true } } },
      })
      const matchedUserIds = new Set<string>()
      for (const token of mentionTokens) {
        for (const m of members) {
          const name = m.user.name.toLowerCase()
          const firstWord = name.split(/\s+/)[0] ?? ''
          const emailLocal = m.user.email.split('@')[0]?.toLowerCase() ?? ''
          if (name.startsWith(token) || firstWord === token || emailLocal === token) {
            matchedUserIds.add(m.user.id)
          }
        }
      }
      matchedUserIds.delete(ctx.user.id)
      if (assigneeUserId) matchedUserIds.delete(assigneeUserId)
      const mentionTargets = [...matchedUserIds].slice(0, 10)
      if (mentionTargets.length) {
        const excerpt = text.length > 120 ? `${text.slice(0, 120)}…` : text
        await notifyUsers({
          orgId: org.id,
          userIds: mentionTargets,
          type: 'SYSTEM',
          title: `You were mentioned in "${task.title}"`,
          body: excerpt,
          module: 'my-tasks',
        })
      }
    }

    return ok({ ...comment, authorName: comment.author?.user.name ?? null }, 201)
  })(req)
}
