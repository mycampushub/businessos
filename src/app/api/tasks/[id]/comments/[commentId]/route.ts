import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { canAccessTask } from '@/lib/server/projects-access'

type RouteParams = { params: Promise<{ id: string; commentId: string }> }

/** task fields needed by canAccessTask (assignment scoping) + comment access checks */
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

/** PATCH /api/tasks/[id]/comments/[commentId] — author edits the comment body.
 *  - tasks module view-minimum (must be able to see the task)
 *  - task must be visible to the caller (canAccessTask)
 *  - only the original author can edit (comment.authorMembershipId === ctx.membership.id)
 *  - body ≤ 8000 chars (matches the POST cap) */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id, commentId } = await route.params
  return withAuth(async (_r, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied

    const task = await db.task.findFirst({ where: { id, orgId: org.id }, select: taskAccessSelect })
    if (!task || !canAccessTask(org.id, membership.id, membership.role, task)) {
      return fail('Task not found', 404)
    }

    // M26: load the comment by id AND scope it to (orgId + entityType=TASK + entityId=task.id)
    // so a caller cannot manipulate a comment from another task by guessing its id.
    const comment = await db.comment.findFirst({
      where: { id: commentId, orgId: org.id, entityType: 'TASK', entityId: task.id },
      include: commentInclude,
    })
    if (!comment) return fail('Comment not found', 404)

    // author-only edit (authorMembershipId is nullable in the schema, but a TASK
    // comment always has an author — synthetic/platform comments don't post here).
    if (comment.authorMembershipId !== membership.id) {
      return fail('You can only edit your own comments', 403)
    }

    const data = await body(req)
    const text = str(data.body, 'body', { max: 8000 })

    const updated = await db.comment.update({
      where: { id: comment.id },
      data: { body: text },
      include: commentInclude,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'comment.updated',
      entityType: 'TASK',
      entityId: task.id,
      message: `${ctx.user.name} edited a comment on "${task.title}"`,
    })

    return ok({ ...updated, authorName: updated.author?.user.name ?? null })
  })(req)
}

/** DELETE /api/tasks/[id]/comments/[commentId] — author OR OWNER/ADMIN/MANAGER.
 *  - tasks module view-minimum (must be able to see the task)
 *  - task must be visible to the caller (canAccessTask)
 *  - comment must belong to the org (comment.orgId === org.id) — the findFirst
 *    above already enforces this, but the explicit check documents the intent. */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id, commentId } = await route.params
  return withAuth(async (_r, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied

    const task = await db.task.findFirst({ where: { id, orgId: org.id }, select: taskAccessSelect })
    if (!task || !canAccessTask(org.id, membership.id, membership.role, task)) {
      return fail('Task not found', 404)
    }

    const comment = await db.comment.findFirst({
      where: { id: commentId, orgId: org.id, entityType: 'TASK', entityId: task.id },
      select: { id: true, authorMembershipId: true, orgId: true },
    })
    if (!comment) return fail('Comment not found', 404)

    // M26: explicit org-ownership check (the findFirst already scopes by orgId, so this
    // is a defensive no-op — kept to document the contract spelled out in the audit).
    if (comment.orgId !== org.id) return fail('Comment not found', 404)

    const isAuthor = comment.authorMembershipId === membership.id
    const isManager =
      membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!isAuthor && !isManager) {
      return fail('You can only delete your own comments', 403)
    }

    await db.comment.delete({ where: { id: comment.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'comment.deleted',
      entityType: 'TASK',
      entityId: task.id,
      message: `${ctx.user.name} deleted a comment on "${task.title}"`,
    })

    return ok({ id: comment.id })
  })(req)
}
