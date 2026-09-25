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
import { recomputeProjectProgress, syncMilestoneStatus, taskWindowError } from '@/lib/server/task-flows'
import { canAccessTask } from '@/lib/server/projects-access'
import { requireAccess } from '@/lib/server/access'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const
const DEP_TYPE_LABELS: Record<string, string> = {
  FS: 'finish-to-start',
  SS: 'start-to-start',
  FF: 'finish-to-finish',
  SF: 'start-to-finish',
}

const taskInclude = Prisma.validator<Prisma.TaskInclude>()({
  project: { select: { id: true, name: true, color: true, status: true } },
  milestone: { select: { id: true, title: true } },
  subtasks: { select: { id: true, title: true, status: true, assigneeMembershipId: true } },
  dependencies: { select: { type: true, dependsOnTask: { select: { id: true, title: true, status: true } } } },
  dependents: { select: { type: true, task: { select: { id: true, title: true, status: true } } } },
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

/** GET /api/tasks/[id] — task detail (assignment-based visibility).
 *  Members whose tasks-module level is not FULL only see tasks they are assigned
 *  to / created, standalone (internal) tasks, or tasks inside a project they
 *  manage or are staffed on — same policy as the list (canAccessTask). */
export async function GET(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    // light load with the project slice canAccessTask needs (manager + members)
    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: {
        id: true,
        orgId: true,
        projectId: true,
        assigneeMembershipId: true,
        creatorMembershipId: true,
        project: { select: { managerMembershipId: true, projectMembers: { select: { membershipId: true } } } },
      },
    })
    if (!task) return fail('Task not found', 404)

    // same access-map convention as requireAccess (OWNER locked to FULL)
    const tasksFull = membership.role === 'OWNER' || ctx.access?.tasks === 'FULL'
    if (!tasksFull && !canAccessTask(org.id, membership.id, membership.role, task)) {
      return fail('Task not found', 404)
    }

    const full = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude })
    return ok(await enrichTask(org.id, full))
  })(req)
}

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
    // dependency type (FS/SS/FF/SF) rides along on every dependsOn/dependents item
    dependsOn: dependencies.map((d) => ({ ...d.dependsOnTask, type: d.type })),
    dependents: dependents.map((d) => ({ ...d.task, type: d.type })),
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

/** PATCH /api/tasks/[id] — update task (creator, assignee, or OWNER/ADMIN/MANAGER).
 *  Supports moving the task between projects (or out to internal): the milestone
 *  is preserved only when it belongs to the target project, and both projects'
 *  progress is recomputed. */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    // DA-M2 fix: module-access gate — blocks users whose tasks access is HIDDEN
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied

    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: {
        id: true,
        title: true,
        status: true,
        assigneeMembershipId: true,
        creatorMembershipId: true,
        projectId: true,
        milestoneId: true,
        startDate: true,
        dueDate: true,
      },
    })
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

    // ----- project move (or move out to an internal task) -----
    let movedFrom: string | null = null
    let movedTo: string | null | undefined
    if (data.projectId !== undefined) {
      let nextProjectId: string | null
      if (data.projectId === null || data.projectId === '') {
        nextProjectId = null
      } else {
        const project = await db.project.findFirst({
          where: { id: String(data.projectId), orgId: org.id },
          select: { id: true, name: true },
        })
        if (!project) return fail('Project not found in this organization', 404)
        nextProjectId = project.id
      }
      if (nextProjectId !== task.projectId) {
        movedFrom = task.projectId
        movedTo = nextProjectId
        update.projectId = nextProjectId
      }
    }
    const effectiveProjectId =
      movedTo !== undefined ? movedTo : task.projectId

    if (data.milestoneId !== undefined) {
      if (data.milestoneId === null || data.milestoneId === '') {
        update.milestoneId = null
      } else {
        const milestone = await db.milestone.findFirst({
          where: { id: String(data.milestoneId), project: { orgId: org.id } },
          select: { id: true, projectId: true },
        })
        if (!milestone) return fail('Milestone not found in this organization', 404)
        if (effectiveProjectId && milestone.projectId !== effectiveProjectId) {
          return fail('Milestone does not belong to this task\'s project', 422)
        }
        update.milestoneId = milestone.id
      }
    } else if (movedTo !== undefined && task.milestoneId) {
      // moving projects — keep the milestone only when it belongs to the target project
      const milestone = await db.milestone.findUnique({
        where: { id: task.milestoneId },
        select: { projectId: true },
      })
      if (!milestone || milestone.projectId !== movedTo) update.milestoneId = null
    }

    // ----- date sanity on the EFFECTIVE values -----
    const effStart = (update.startDate as Date | null | undefined) !== undefined
      ? (update.startDate as Date | null)
      : task.startDate
    const effDue = (update.dueDate as Date | null | undefined) !== undefined
      ? (update.dueDate as Date | null)
      : task.dueDate
    if (effStart && effDue && dayVal(effDue) < dayVal(effStart)) {
      return fail('Due date cannot be before the start date', 422)
    }
    const windowError = await taskWindowError(effectiveProjectId, effStart, effDue)
    if (windowError) return fail(windowError, 422)

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

      // Dependency start-gate: a task cannot START while it waits on gateable
      // dependencies — FS (predecessor must be DONE) and SS (predecessor must
      // have started). Finishing/rewinding is always free.
      // "Start" = moving out of the intake columns (the first two non-done
      // columns — e.g. Backlog / To do) into an active column (In progress…).
      const openColumns = columns.filter((c) => !c.isDone)
      const intakeOrders = openColumns.slice(0, 2).map((c) => c.key)
      const intakeKeys = new Set<string>(intakeOrders.length ? intakeOrders : ['TODO'])
      const isStarting =
        !doneSet.has(status) &&
        !intakeKeys.has(status) &&
        intakeKeys.has(task.status)
      if (isStarting) {
        // Dependency start-gate (only FS/SS gate starts — FF/SF are stored but
        // intentionally ungated: finishing in tandem / start-driven finishes have
        // no meaningful "cannot start yet" rule):
        //   • FS finish-to-start — the predecessor must be DONE
        //   • SS start-to-start — the predecessor must have STARTED (left the
        //     intake columns: IN_PROGRESS / REVIEW / DONE with the default board)
        const startedKeys = columnKeys.filter((k) => !intakeKeys.has(k))
        const blockers = await db.taskDependency.findMany({
          where: {
            taskId: task.id,
            type: { in: ['FS', 'SS'] },
            OR: [
              { type: 'FS', dependsOnTask: { status: { notIn: [...doneSet] } } },
              { type: 'SS', dependsOnTask: { status: { notIn: startedKeys } } },
            ],
          },
          select: { type: true, dependsOnTask: { select: { title: true } } },
        })
        if (blockers.length) {
          const titles = blockers
            .map((b) => `"${b.dependsOnTask.title}" (${DEP_TYPE_LABELS[b.type] ?? b.type})`)
            .join(', ')
          return fail(
            `Blocked by unfinished ${blockers.length === 1 ? 'dependency' : 'dependencies'}: ${titles}`,
            422
          )
        }
      }

      statusChanged = status !== task.status
      update.status = status
      if (doneSet.has(status)) update.completedAt = new Date()
      else if (doneSet.has(task.status)) update.completedAt = null
    }

    // dependsOnTaskIds REPLACES the dependency set (validated: in-org, not self, no cycle).
    // Entries are plain task ids (→ FS) or { id, type } objects with the link type.
    let newDependencies: Array<{ id: string; type: string }> | undefined
    if (data.dependsOnTaskIds !== undefined) {
      if (data.dependsOnTaskIds === null || !Array.isArray(data.dependsOnTaskIds)) {
        return fail('dependsOnTaskIds must be an array', 422)
      }
      const entries: Array<{ id: string; type: string }> = []
      for (const v of data.dependsOnTaskIds) {
        const depId = typeof v === 'string' ? v : String((v as { id?: unknown })?.id ?? '')
        const dep = depId ? await db.task.findFirst({ where: { id: depId, orgId: org.id }, select: { id: true } }) : null
        if (!dep) return fail('Unknown dependency task', 422)
        if (dep.id === task.id) return fail('Circular dependency detected', 422) // self-dependency is a cycle
        const type = oneOf((v as { type?: unknown })?.type, DEP_TYPES, 'FS')
        if (!entries.some((e) => e.id === dep.id)) entries.push({ id: dep.id, type })
      }
      if (await wouldCreateCycle(org.id, task.id, entries.map((e) => e.id))) return fail('Circular dependency detected', 422)
      newDependencies = entries
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

    // replace the dependency set + log when it actually changed (ids or link types)
    let depsChanged = false
    if (newDependencies !== undefined) {
      const existing = await db.taskDependency.findMany({
        where: { taskId: task.id },
        select: { dependsOnTaskId: true, type: true },
      })
      const existingKey = existing.map((d) => `${d.dependsOnTaskId}:${d.type}`).sort().join('|')
      const newKey = newDependencies.map((d) => `${d.id}:${d.type}`).sort().join('|')
      depsChanged = existingKey !== newKey

      if (depsChanged) {
        await db.$transaction([
          db.taskDependency.deleteMany({ where: { taskId: task.id } }),
          ...(newDependencies.length
            ? [
                db.taskDependency.createMany({
                  data: newDependencies.map(({ id: dependsOnTaskId, type }) => ({
                    taskId: task.id,
                    dependsOnTaskId,
                    type,
                  })),
                }),
              ]
            : []),
        ])
      }
    }

    // ----- project↔task graph sync -----
    const doneStatuses = [...doneSet]
    if (statusChanged || movedTo !== undefined) {
      if (effectiveProjectId) await recomputeProjectProgress(effectiveProjectId, doneStatuses)
    }
    if (movedFrom && movedFrom !== effectiveProjectId) {
      await recomputeProjectProgress(movedFrom, doneStatuses)
    }
    // milestone auto-status — every milestone this task entered or left
    const affectedMilestones = new Set<string>()
    if (task.milestoneId) affectedMilestones.add(task.milestoneId)
    if (typeof update.milestoneId === 'string') affectedMilestones.add(update.milestoneId)
    for (const milestoneId of affectedMilestones) {
      await syncMilestoneStatus(milestoneId, doneStatuses, {
        orgId: org.id,
        membershipId: membership.id,
        userName: ctx.user.name,
        userId: ctx.user.id,
      })
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

    if (movedTo !== undefined) {
      const fromName = movedFrom
        ? (await db.project.findUnique({ where: { id: movedFrom }, select: { name: true } }))?.name ?? 'its project'
        : null
      const toName = movedTo
        ? (await db.project.findUnique({ where: { id: movedTo }, select: { name: true } }))?.name ?? 'another project'
        : null
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'task.moved',
        entityType: 'TASK',
        entityId: task.id,
        message: movedTo
          ? `Task "${updated.title}" moved${fromName ? ` from "${fromName}"` : ''} to "${toName}"`
          : `Task "${updated.title}" moved out of "${fromName}" to internal`,
      })
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

/** local-midnight value (task dates are whole days) */
function dayVal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** DELETE /api/tasks/[id] — creator, assignee, or OWNER/ADMIN/MANAGER */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    // DA-M2 fix: module-access gate — blocks users whose tasks access is HIDDEN
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied

    const task = await db.task.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, title: true, assigneeMembershipId: true, creatorMembershipId: true, projectId: true, milestoneId: true },
    })
    if (!task) return fail('Task not found', 404)

    const isOwner =
      task.creatorMembershipId === membership.id || task.assigneeMembershipId === membership.id
    const canDelete =
      isOwner || membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!canDelete) return fail('Insufficient permissions', 403)

    // M15-fe: soft-delete instead of hard-delete (enables undo)
    await db.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'task.deleted',
      entityType: 'TASK',
      entityId: task.id,
      message: `Task "${task.title}" deleted`,
    })

    // keep the project↔task graph in sync after removal: progress + milestone auto-status
    const columns = await getTaskColumns(org.id)
    const doneStatuses = doneKeys(columns)
    if (task.projectId) {
      await recomputeProjectProgress(task.projectId, doneStatuses).catch(() => {})
    }
    if (task.milestoneId) {
      await syncMilestoneStatus(task.milestoneId, doneStatuses, {
        orgId: org.id,
        membershipId: membership.id,
        userName: ctx.user.name,
        userId: ctx.user.id,
      }).catch(() => {})
    }

    return ok({})
  })(req)
}
