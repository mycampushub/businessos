import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  withAuth,
  requireOrg,
  body,
  str,
  optNum,
  optDate,
  oneOf,
  logActivity,
  notifyUsers,
} from '@/lib/server/api'
import { getTaskColumns, doneKeys } from '@/lib/server/columns'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

const taskInclude = Prisma.validator<Prisma.TaskInclude>()({
  project: { select: { id: true, name: true, color: true, status: true } },
  milestone: { select: { id: true, title: true } },
  subtasks: { select: { id: true, title: true, status: true, assigneeMembershipId: true } },
  dependencies: { select: { dependsOnTask: { select: { id: true, title: true } } } },
  dependents: { select: { task: { select: { id: true, title: true } } } },
  _count: { select: { dependencies: true, comments: true } },
})

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

const membershipUserSelect = {
  id: true,
  role: true,
  title: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const

type RouteParams = { params: Promise<{ id: string }> }

async function enrichTask(orgId: string, task: TaskWithRelations) {
  const ids = new Set<string>()
  if (task.assigneeMembershipId) ids.add(task.assigneeMembershipId)
  if (task.creatorMembershipId) ids.add(task.creatorMembershipId)
  for (const s of task.subtasks) if (s.assigneeMembershipId) ids.add(s.assigneeMembershipId)
  const members = ids.size
    ? await db.membership.findMany({ where: { orgId, id: { in: [...ids] } }, select: membershipUserSelect })
    : []
  const map = new Map(members.map((m) => [m.id, m]))
  const assignee = task.assigneeMembershipId ? map.get(task.assigneeMembershipId) ?? null : null
  const creator = task.creatorMembershipId ? map.get(task.creatorMembershipId) ?? null : null
  const { dependencies, dependents, ...rest } = task
  return {
    ...rest,
    dependsOn: dependencies.map((d) => d.dependsOnTask),
    dependents: dependents.map((d) => d.task),
    assignee,
    assigneeName: assignee?.user.name ?? null,
    creator,
    creatorName: creator?.user.name ?? null,
    subtaskCount: task.subtasks.length,
    subtasks: task.subtasks.map((s) => {
      const sa = s.assigneeMembershipId ? map.get(s.assigneeMembershipId) ?? null : null
      return { ...s, assignee: sa, assigneeName: sa?.user.name ?? null }
    }),
  }
}

/**
 * Cycle check: BFS over task→dependsOn edges with the patched task's edges REPLACED by the
 * candidate set — a cycle exists iff the task is reachable from its own (new) dependencies.
 * A self-reference is caught by the same walk.
 */
async function wouldCreateCycle(orgId: string, taskId: string, newDependsOn: string[]): Promise<boolean> {
  const edges = await db.taskDependency.findMany({
    where: { task: { orgId } },
    select: { taskId: true, dependsOnTaskId: true },
  })
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (e.taskId === taskId) continue // old edges of the patched task are replaced
    const list = adj.get(e.taskId) ?? []
    list.push(e.dependsOnTaskId)
    adj.set(e.taskId, list)
  }
  adj.set(taskId, newDependsOn)
  const stack = [...newDependsOn]
  const seen = new Set<string>()
  while (stack.length) {
    const cur = stack.pop() as string
    if (cur === taskId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of adj.get(cur) ?? []) stack.push(next)
  }
  return false
}

/** PATCH /api/tasks/[id] — update task (creator, assignee, or OWNER/ADMIN/MANAGER) */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const task = await db.task.findFirst({ where: { id, orgId: org.id }, select: { id: true, title: true, status: true, assigneeMembershipId: true, creatorMembershipId: true, projectId: true } })
    if (!task) return fail('Task not found', 404)

    const isOwner =
      task.creatorMembershipId === membership.id || task.assigneeMembershipId === membership.id
    const canEdit =
      isOwner || membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!canEdit) return fail('Insufficient permissions', 403)

    const data = await body(req)
    const update: Record<string, unknown> = {}

    // dynamic TASK columns drive status validation / completedAt / progress
    const columns = await getTaskColumns(org.id)
    const columnKeys = columns.map((c) => c.key)
    const doneSet = new Set(doneKeys(columns))

    if (data.title !== undefined) update.title = str(data.title, 'title', { max: 300 })
    if (data.description !== undefined)
      update.description = data.description === null ? null : str(data.description, 'description', { required: false, max: 8000 })
    if (data.priority !== undefined) update.priority = oneOf(data.priority, PRIORITIES)
    if (data.startDate !== undefined) update.startDate = data.startDate === null ? null : optDate(data.startDate)
    if (data.dueDate !== undefined) update.dueDate = data.dueDate === null ? null : optDate(data.dueDate)
    if (data.estimatedHours !== undefined) update.estimatedHours = data.estimatedHours === null ? null : optNum(data.estimatedHours)
    if (data.actualHours !== undefined) update.actualHours = data.actualHours === null ? null : optNum(data.actualHours)
    if (data.tags !== undefined) update.tags = data.tags === null ? null : str(data.tags, 'tags', { required: false, max: 500 })
    if (data.order !== undefined) {
      const o = optNum(data.order)
      if (o === undefined) return fail('Field "order" must be a number', 422)
      update.order = Math.round(o)
    }

    if (data.milestoneId !== undefined) {
      if (data.milestoneId === null || data.milestoneId === '') {
        update.milestoneId = null
      } else {
        const milestone = await db.milestone.findFirst({
          where: { id: String(data.milestoneId), project: { orgId: org.id } },
          select: { id: true, projectId: true },
        })
        if (!milestone) return fail('Milestone not found in this organization', 404)
        if (task.projectId && milestone.projectId !== task.projectId) {
          return fail('Milestone does not belong to this task\'s project', 422)
        }
        update.milestoneId = milestone.id
      }
    }

    let newAssigneeId: string | null | undefined
    if (data.assigneeMembershipId !== undefined) {
      if (data.assigneeMembershipId === null || data.assigneeMembershipId === '') {
        update.assigneeMembershipId = null
        newAssigneeId = null
      } else {
        const m = await db.membership.findFirst({
          where: { id: String(data.assigneeMembershipId), orgId: org.id },
          select: { id: true, userId: true, user: { select: { name: true } } },
        })
        if (!m) return fail('Assignee membership not found in this organization', 404)
        update.assigneeMembershipId = m.id
        newAssigneeId = m.id
      }
    }

    let statusChanged = false
    if (data.status !== undefined) {
      const status = String(data.status)
      if (!columnKeys.includes(status)) return fail('Unknown status', 422)
      statusChanged = status !== task.status
      update.status = status
      if (doneSet.has(status)) update.completedAt = new Date()
      else if (doneSet.has(task.status)) update.completedAt = null
    }

    // dependsOnTaskIds REPLACES the dependency set (validated: in-org, not self, no cycle)
    let newDependencies: string[] | undefined
    if (data.dependsOnTaskIds !== undefined) {
      if (data.dependsOnTaskIds === null || !Array.isArray(data.dependsOnTaskIds)) {
        return fail('dependsOnTaskIds must be an array', 422)
      }
      const ids: string[] = []
      for (const v of data.dependsOnTaskIds) {
        const depId = typeof v === 'string' ? v : String(v ?? '')
        const dep = depId ? await db.task.findFirst({ where: { id: depId, orgId: org.id }, select: { id: true } }) : null
        if (!dep) return fail('Unknown dependency task', 422)
        if (dep.id === task.id) return fail('Circular dependency detected', 422) // self-dependency is a cycle
        if (!ids.includes(dep.id)) ids.push(dep.id)
      }
      if (await wouldCreateCycle(org.id, task.id, ids)) return fail('Circular dependency detected', 422)
      newDependencies = ids
    }

    if (Object.keys(update).length === 0 && newDependencies === undefined) {
      return fail('No valid fields to update', 422)
    }

    let updated: TaskWithRelations
    if (Object.keys(update).length) {
      updated = await db.task.update({ where: { id: task.id }, data: update, include: taskInclude })
    } else {
      updated = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude })
    }

    // replace the dependency set + log when it actually changed
    let depsChanged = false
    if (newDependencies !== undefined) {
      const existing = await db.taskDependency.findMany({
        where: { taskId: task.id },
        select: { dependsOnTaskId: true },
      })
      const existingIds = existing.map((d) => d.dependsOnTaskId).sort()
      const newIds = [...newDependencies].sort()
      depsChanged = JSON.stringify(existingIds) !== JSON.stringify(newIds)

      if (depsChanged) {
        await db.$transaction([
          db.taskDependency.deleteMany({ where: { taskId: task.id } }),
          ...(newDependencies.length
            ? [
                db.taskDependency.createMany({
                  data: newDependencies.map((dependsOnTaskId) => ({
                    taskId: task.id,
                    dependsOnTaskId,
                    type: 'FS',
                  })),
                }),
              ]
            : []),
        ])
      }
    }

    // recompute project progress after status change (done = status ∈ done columns)
    if (statusChanged && task.projectId) {
      const [total, done] = await Promise.all([
        db.task.count({ where: { projectId: task.projectId, orgId: org.id } }),
        db.task.count({ where: { projectId: task.projectId, orgId: org.id, status: { in: doneKeys(columns) } } }),
      ])
      const progress = total > 0 ? Math.round((done / total) * 100) : 0
      await db.project.update({ where: { id: task.projectId }, data: { progress } })
    }

    const effectiveAssigneeId =
      newAssigneeId !== undefined ? newAssigneeId : task.assigneeMembershipId
    let assigneeUser: { userId: string; name: string } | null = null
    if (effectiveAssigneeId) {
      const m = await db.membership.findUnique({
        where: { id: effectiveAssigneeId },
        select: { userId: true, user: { select: { name: true } } },
      })
      assigneeUser = m ? { userId: m.userId, name: m.user.name } : null
    }

    if (statusChanged) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'task.status_changed',
        entityType: 'TASK',
        entityId: task.id,
        message: `Task "${updated.title}" moved to ${updated.status}`,
      })
      if (assigneeUser && assigneeUser.userId !== ctx.user.id) {
        await notifyUsers({
          orgId: org.id,
          userIds: [assigneeUser.userId],
          type: 'TASK',
          title: `Task "${updated.title}" moved to ${updated.status}`,
          module: 'my-tasks',
        })
      }
    }

    if (newAssigneeId !== undefined && newAssigneeId !== null && newAssigneeId !== task.assigneeMembershipId) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'task.assigned',
        entityType: 'TASK',
        entityId: task.id,
        message: assigneeUser
          ? `Task "${updated.title}" assigned to ${assigneeUser.name}`
          : `Task "${updated.title}" unassigned`,
      })
      if (assigneeUser && assigneeUser.userId !== ctx.user.id) {
        await notifyUsers({
          orgId: org.id,
          userIds: [assigneeUser.userId],
          type: 'TASK',
          title: `Task assigned to you: ${updated.title}`,
          module: 'my-tasks',
        })
      }
    }

    if (depsChanged) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'task.dependencies_updated',
        entityType: 'TASK',
        entityId: task.id,
        message: `Dependencies updated on "${task.title}"`,
      })
    }

    // re-fetch so dependsOn/dependents reflect the replaced set
    const fresh = depsChanged
      ? await db.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude })
      : updated
    return ok(await enrichTask(org.id, fresh))
  })(req)
}

/** DELETE /api/tasks/[id] — creator, assignee, or OWNER/ADMIN/MANAGER */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, title: true, assigneeMembershipId: true, creatorMembershipId: true, projectId: true },
    })
    if (!task) return fail('Task not found', 404)

    const isOwner =
      task.creatorMembershipId === membership.id || task.assigneeMembershipId === membership.id
    const canDelete =
      isOwner || membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!canDelete) return fail('Insufficient permissions', 403)

    await db.task.delete({ where: { id: task.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'task.deleted',
      entityType: 'TASK',
      entityId: task.id,
      message: `Task "${task.title}" deleted`,
    })

    // keep project progress in sync after removal (done = status ∈ done columns)
    if (task.projectId) {
      const columns = await getTaskColumns(org.id)
      const [total, done] = await Promise.all([
        db.task.count({ where: { projectId: task.projectId, orgId: org.id } }),
        db.task.count({ where: { projectId: task.projectId, orgId: org.id, status: { in: doneKeys(columns) } } }),
      ])
      const progress = total > 0 ? Math.round((done / total) * 100) : 0
      await db.project.update({ where: { id: task.projectId }, data: { progress } }).catch(() => {})
    }

    return ok({})
  })(req)
}
