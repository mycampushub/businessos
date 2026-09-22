import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  withAuth,
  requireOrg,
  body,
  oneOf,
  logActivity,
  notifyUsers,
} from '@/lib/server/api'
import { getTaskColumns, doneKeys } from '@/lib/server/columns'

/**
 * /api/tasks/[id]/dependencies — manage the task's dependency links.
 *
 *  • GET    → { dependencies: [...], dependents: [...] }
 *             dependencies = tasks THIS task waits on (blocked by)
 *             dependents   = tasks that wait on THIS task (blocks)
 *  • POST   { dependsOnTaskId, type? = 'FS' } → link (409 duplicate, 422 cycle/self)
 *  • DELETE ?dependsOnTaskId=<id> → unlink
 *
 * types: FS finish-to-start · SS start-to-start · FF finish-to-finish · SF start-to-finish
 */

const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const
const DEP_TYPE_LABELS: Record<string, string> = {
  FS: 'finish → start',
  SS: 'start → start',
  FF: 'finish → finish',
  SF: 'start → finish',
}

type RouteParams = { params: Promise<{ id: string }> }

const relatedSelect = {
  id: true,
  title: true,
  status: true,
  startDate: true,
  dueDate: true,
} as const

/** GET — the task's dependency graph slice */
export async function GET(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)

    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: {
        id: true,
        title: true,
        dependencies: {
          select: {
            id: true,
            taskId: true,
            dependsOnTaskId: true,
            type: true,
            dependsOnTask: { select: relatedSelect },
          },
        },
        dependents: {
          select: {
            id: true,
            taskId: true,
            dependsOnTaskId: true,
            type: true,
            task: { select: relatedSelect },
          },
        },
      },
    })
    if (!task) return fail('Task not found', 404)

    return ok({ taskId: task.id, dependencies: task.dependencies, dependents: task.dependents })
  })(req)
}

/** POST — add a dependency ("this task waits on <dependsOnTaskId>") */
export async function POST(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const data = await body(req)

    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, title: true, assigneeMembershipId: true, creatorMembershipId: true },
    })
    if (!task) return fail('Task not found', 404)

    // only the task's creator/assignee (or OWNER/ADMIN/MANAGER) may manage its links
    const isTaskOwner =
      task.creatorMembershipId === membership.id || task.assigneeMembershipId === membership.id
    const canManage =
      isTaskOwner || membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!canManage) return fail('Insufficient permissions', 403)

    const dependsOnTaskId = data.dependsOnTaskId ? String(data.dependsOnTaskId) : ''
    if (!dependsOnTaskId) return fail('Field "dependsOnTaskId" is required', 422)

    const target = await db.task.findFirst({
      where: { id: dependsOnTaskId, orgId: org.id },
      select: { id: true, title: true, status: true },
    })
    if (!target) return fail('Dependency task not found in this organization', 404)

    if (target.id === task.id) return fail('A task cannot depend on itself', 422)

    const type = oneOf(data.type, DEP_TYPES, 'FS')

    const existing = await db.taskDependency.findFirst({
      where: { taskId: task.id, dependsOnTaskId: target.id },
      select: { id: true },
    })
    if (existing) {
      return fail('Dependency already exists', 409)
    }

    // cycle guard: adding task→target is only safe if target does not
    // (transitively) wait on task — walk target's own dependency chain.
    const stack = [target.id]
    const visited = new Set<string>()
    while (stack.length) {
      const cur = stack.pop() as string
      if (cur === task.id) {
        return fail('This link would create a circular dependency chain', 422)
      }
      if (visited.has(cur)) continue
      visited.add(cur)
      const up = await db.taskDependency.findMany({
        where: { taskId: cur },
        select: { dependsOnTaskId: true },
      })
      for (const d of up) stack.push(d.dependsOnTaskId)
    }

    let created
    try {
      created = await db.taskDependency.create({
        data: { taskId: task.id, dependsOnTaskId: target.id, type },
        select: {
          id: true,
          taskId: true,
          dependsOnTaskId: true,
          type: true,
          dependsOnTask: { select: relatedSelect },
        },
      })
    } catch (err) {
      // P2002 = unique [taskId, dependsOnTaskId] violation — now a real duplicate
      // (race with the findFirst above or a concurrent POST)
      if ((err as { code?: string }).code === 'P2002') {
        return fail('Dependency already exists', 409)
      }
      throw err
    }

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'task.dependency.added',
      entityType: 'TASK',
      entityId: task.id,
      message: `${ctx.user.name} linked "${task.title}" — ${DEP_TYPE_LABELS[type] ?? type} — "${target.title}"`,
    })

    // tell the assignee their task is now gated (when the blocker is still open)
    const depDoneKeys = doneKeys(await getTaskColumns(org.id))
    if (task.assigneeMembershipId && !depDoneKeys.includes(target.status)) {
      const assignee = await db.membership.findUnique({
        where: { id: task.assigneeMembershipId },
        select: { userId: true },
      })
      if (assignee && assignee.userId !== ctx.user.id) {
        await notifyUsers({
          orgId: org.id,
          userIds: [assignee.userId],
          type: 'TASK',
          title: `"${task.title}" is now blocked by "${target.title}"`,
          module: 'my-tasks',
        })
      }
    }

    return ok(created, 201)
  })(req)
}

/** DELETE ?dependsOnTaskId= — remove one dependency link */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const url = new URL(req.url)
    const dependsOnTaskId = url.searchParams.get('dependsOnTaskId')?.trim() || ''

    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, title: true, assigneeMembershipId: true, creatorMembershipId: true },
    })
    if (!task) return fail('Task not found', 404)

    // only the task's creator/assignee (or OWNER/ADMIN/MANAGER) may manage its links
    const isTaskOwner =
      task.creatorMembershipId === membership.id || task.assigneeMembershipId === membership.id
    const canManage =
      isTaskOwner || membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!canManage) return fail('Insufficient permissions', 403)

    if (!dependsOnTaskId) return fail('Query parameter "dependsOnTaskId" is required', 422)

    const link = await db.taskDependency.findFirst({
      where: { taskId: task.id, dependsOnTaskId },
      select: { id: true, dependsOnTask: { select: { title: true } } },
    })
    if (!link) return fail('Dependency link not found', 404)

    await db.taskDependency.delete({ where: { id: link.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'task.dependency.removed',
      entityType: 'TASK',
      entityId: task.id,
      message: `${ctx.user.name} unlinked "${task.title}" from "${link.dependsOnTask?.title ?? dependsOnTaskId}"`,
    })

    return ok({ id: link.id })
  })(req)
}
