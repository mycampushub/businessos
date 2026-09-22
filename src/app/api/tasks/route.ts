import { NextRequest } from 'next/server'
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
import { requireAccess, getAccess } from '@/lib/server/access'
import { visibleTaskWhere } from '@/lib/server/projects-access'
import { getTaskColumns, doneKeys, statusOrderMap } from '@/lib/server/columns'
import { recomputeProjectProgress, syncMilestoneStatus, taskWindowError } from '@/lib/server/task-flows'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

const taskInclude = Prisma.validator<Prisma.TaskInclude>()({
  project: { select: { id: true, name: true, color: true, status: true } },
  milestone: { select: { id: true, title: true } },
  subtasks: { select: { id: true, title: true, status: true, assigneeMembershipId: true } },
  dependencies: { select: { dependsOnTask: { select: { id: true, title: true, status: true } } } },
  dependents: { select: { task: { select: { id: true, title: true, status: true } } } },
  _count: { select: { dependencies: true, comments: true } },
})

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

const membershipUserSelect = {
  id: true,
  role: true,
  title: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const

type MemberLite = { id: string; role: string; title: string | null; user: { id: string; name: string; avatarUrl: string | null } }

/** task item shape: assignee/creator resolved + dependsOn/dependents flattened to {id, title} */
function shapeTask(t: TaskWithRelations) {
  const { dependencies, dependents, ...rest } = t
  return {
    ...rest,
    dependsOn: dependencies.map((d) => d.dependsOnTask),
    dependents: dependents.map((d) => d.task),
  }
}

/** attach assignee/creator membership→user objects to tasks (no direct Prisma relation exists) */
async function enrichTasks(orgId: string, tasks: TaskWithRelations[]) {
  const ids = new Set<string>()
  for (const t of tasks) {
    if (t.assigneeMembershipId) ids.add(t.assigneeMembershipId)
    if (t.creatorMembershipId) ids.add(t.creatorMembershipId)
    for (const s of t.subtasks) if (s.assigneeMembershipId) ids.add(s.assigneeMembershipId)
  }
  const members: MemberLite[] = ids.size
    ? await db.membership.findMany({ where: { orgId, id: { in: [...ids] } }, select: membershipUserSelect })
    : []
  const map = new Map(members.map((m) => [m.id, m]))
  return tasks.map((t) => {
    const shaped = shapeTask(t)
    const assignee = t.assigneeMembershipId ? map.get(t.assigneeMembershipId) ?? null : null
    const creator = t.creatorMembershipId ? map.get(t.creatorMembershipId) ?? null : null
    return {
      ...shaped,
      assignee,
      assigneeName: assignee?.user.name ?? null,
      creator,
      creatorName: creator?.user.name ?? null,
      subtaskCount: t.subtasks.length,
      subtasks: t.subtasks.map((s) => {
        const sa = s.assigneeMembershipId ? map.get(s.assigneeMembershipId) ?? null : null
        return { ...s, assignee: sa, assigneeName: sa?.user.name ?? null }
      }),
    }
  })
}

/** validate dependency ids: each must be an existing task in the org (and not the task itself when given) */
async function validateDependencies(
  orgId: string,
  raw: unknown[],
  selfId?: string
): Promise<{ ids: string[]; error?: 'unknown' | 'self' }> {
  const ids: string[] = []
  for (const v of raw) {
    const id = typeof v === 'string' ? v : String(v ?? '')
    const dep = id ? await db.task.findFirst({ where: { id, orgId }, select: { id: true } }) : null
    if (!dep) return { ids, error: 'unknown' }
    if (selfId && dep.id === selfId) return { ids, error: 'self' }
    if (!ids.includes(dep.id)) ids.push(dep.id)
  }
  return { ids }
}

/** GET /api/tasks — list org tasks with filters (statuses are org TASK board columns) */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const url = new URL(req.url)

  const projectIdParam = url.searchParams.get('projectId')?.trim() || undefined
  const assigneeParam = url.searchParams.get('assignee')?.trim() || 'all'
  const statusParam = url.searchParams.get('status')?.trim() || undefined
  const q = url.searchParams.get('q')?.trim() || undefined
  const view = url.searchParams.get('view')?.trim() || undefined
  // pagination: limit default 200 (hard cap 500), offset default 0
  const limit = Math.max(1, Math.min(500, optNum(url.searchParams.get('limit')) ?? 200))
  const offset = Math.max(0, optNum(url.searchParams.get('offset')) ?? 0)

  // self-service: own tasks never require module access (my-tasks module)
  const selfOnly = view === 'mine' || assigneeParam === 'me'
  if (!selfOnly) {
    const denied = requireAccess(ctx, 'tasks', 'view')
    if (denied) return denied
  }

  const columns = await getTaskColumns(org.id)
  const columnKeys = columns.map((c) => c.key)
  const notDoneKeys = doneKeys(columns)
  const orderMap = statusOrderMap(columns)

  // assignment scoping (projects-route pattern): tasks FULL → all org tasks;
  // otherwise only tasks the caller can see (standalone, assigned/created by them,
  // or inside projects they manage / are staffed on)
  const access = await getAccess(ctx)
  const tasksFull = membership.role === 'OWNER' || access['tasks'] === 'FULL'
  const where: Prisma.TaskWhereInput = tasksFull
    ? { orgId: org.id }
    : visibleTaskWhere(org.id, membership.id, membership.role)

  if (projectIdParam) {
    const project = await db.project.findFirst({
      where: { id: projectIdParam, orgId: org.id },
      select: { id: true },
    })
    if (!project) return fail('Project not found', 404)
    where.projectId = project.id
  }
  if (statusParam) {
    if (!columnKeys.includes(statusParam)) return fail('Unknown status', 422)
    where.status = statusParam
  }
  if (q) where.title = { contains: q }

  if (view === 'mine') {
    where.assigneeMembershipId = membership.id
    if (!where.status) where.status = { notIn: notDoneKeys }
  } else if (assigneeParam === 'me') {
    where.assigneeMembershipId = membership.id
  } else if (assigneeParam !== 'all' && assigneeParam !== '') {
    const target = await db.membership.findFirst({
      where: { id: assigneeParam, orgId: org.id },
      select: { id: true },
    })
    if (!target) return fail('Assignee membership not found in this organization', 404)
    where.assigneeMembershipId = target.id
  }

  const tasks = await db.task.findMany({ where, include: taskInclude })

  // sort: TASK column order (unknown/legacy statuses last), then dueDate asc, nulls last
  const sorted = [...tasks].sort((a, b) => {
    const s = (orderMap[a.status] ?? 999) - (orderMap[b.status] ?? 999)
    if (s !== 0) return s
    if (a.dueDate === null && b.dueDate === null) return 0
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  })

  const items = await enrichTasks(org.id, sorted.slice(offset, offset + limit))
  return ok({ items })
})

/** POST /api/tasks — create task (tasks module view-minimum: VIEW roles can create, HIDDEN cannot) */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'tasks', 'view')
  if (denied) return denied
  const data = await body(req)

  const title = str(data.title, 'title', { max: 300 })
  const description = data.description
    ? str(data.description, 'description', { required: false, max: 8000 })
    : null

  const columns = await getTaskColumns(org.id)
  const columnKeys = columns.map((c) => c.key)
  const doneKeySet = new Set(doneKeys(columns))

  let projectId: string | null = null
  if (data.projectId) {
    const project = await db.project.findFirst({
      where: { id: String(data.projectId), orgId: org.id },
      select: { id: true },
    })
    if (!project) return fail('Project not found in this organization', 404)
    projectId = project.id
  }

  let milestoneId: string | null = null
  if (data.milestoneId) {
    const milestone = await db.milestone.findFirst({
      where: { id: String(data.milestoneId), project: { orgId: org.id } },
      select: { id: true, projectId: true },
    })
    if (!milestone) return fail('Milestone not found in this organization', 404)
    if (projectId && milestone.projectId !== projectId) {
      return fail('Milestone does not belong to this project', 422)
    }
    milestoneId = milestone.id
    if (!projectId) projectId = milestone.projectId
  }

  let assigneeMembershipId: string | null = membership.id
  if (data.assigneeMembershipId) {
    const m = await db.membership.findFirst({
      where: { id: String(data.assigneeMembershipId), orgId: org.id },
      select: { id: true },
    })
    if (!m) return fail('Assignee membership not found in this organization', 404)
    assigneeMembershipId = m.id
  } else if (data.assigneeMembershipId === null) {
    assigneeMembershipId = null
  }

  let parentTaskId: string | null = null
  if (data.parentTaskId) {
    const parent = await db.task.findFirst({
      where: { id: String(data.parentTaskId), orgId: org.id },
      select: { id: true },
    })
    if (!parent) return fail('Parent task not found in this organization', 404)
    parentTaskId = parent.id
  }

  const priority = oneOf(data.priority, PRIORITIES, 'MEDIUM')

  // status is validated against the org's TASK columns; default TODO (first column if TODO was removed)
  let status: string
  if (data.status !== undefined && data.status !== null && data.status !== '') {
    status = String(data.status)
    if (!columnKeys.includes(status)) return fail('Unknown status', 422)
  } else {
    status = columnKeys.includes('TODO') ? 'TODO' : (columns[0]?.key ?? 'TODO')
  }

  const startDate = optDate(data.startDate) ?? null
  const dueDate = optDate(data.dueDate) ?? null

  // task date sanity: due can never precede start
  if (startDate && dueDate && startOfDayVal(dueDate) < startOfDayVal(startDate)) {
    return fail('Due date cannot be before the start date', 422)
  }
  // task dates must respect the project window (when the project defines one)
  const windowError = await taskWindowError(projectId, startDate, dueDate)
  if (windowError) return fail(windowError, 422)

  const estimatedHours = optNum(data.estimatedHours)
  const tags = data.tags ? str(data.tags, 'tags', { required: false, max: 500 }) : null
  const order = optNum(data.order)

  // dependencies (FS): each must exist in the org (the new task cannot reference itself — its id doesn't exist yet)
  const depRaw = data.dependsOnTaskIds
  if (depRaw !== undefined && depRaw !== null && !Array.isArray(depRaw)) {
    return fail('dependsOnTaskIds must be an array', 422)
  }
  const depResult =
    depRaw !== undefined && depRaw !== null
      ? await validateDependencies(org.id, depRaw as unknown[])
      : { ids: [] as string[] }
  if (depResult.error === 'unknown') return fail('Unknown dependency task', 422)
  if (depResult.error === 'self') return fail('Unknown dependency task', 422)
  const dependsOnTaskIds = depResult.ids

  const created = await db.task.create({
    data: {
      orgId: org.id,
      projectId,
      milestoneId,
      title,
      description,
      assigneeMembershipId,
      creatorMembershipId: membership.id,
      priority,
      status,
      startDate,
      dueDate,
      estimatedHours,
      tags,
      parentTaskId,
      order: order !== undefined ? Math.round(order) : 0,
      completedAt: doneKeySet.has(status) ? new Date() : null,
    },
    include: taskInclude,
  })

  if (dependsOnTaskIds.length) {
    await db.taskDependency.createMany({
      data: dependsOnTaskIds.map((dependsOnTaskId) => ({
        taskId: created.id,
        dependsOnTaskId,
        type: 'FS',
      })),
    })
  }

  // keep the project↔task graph in sync: progress rollup + milestone auto-status
  const doneStatuses = doneKeys(columns)
  if (projectId) await recomputeProjectProgress(projectId, doneStatuses)
  if (milestoneId) await syncMilestoneStatus(milestoneId, doneStatuses, {
    orgId: org.id,
    membershipId: membership.id,
    userName: ctx.user.name,
    userId: ctx.user.id,
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'task.created',
    entityType: 'TASK',
    entityId: created.id,
    message: `${ctx.user.name} created "${title}"${projectId ? '' : ' (internal)'}${parentTaskId ? ' as subtask' : ''}`,
  })

  if (assigneeMembershipId) {
    const assignee = await db.membership.findUnique({
      where: { id: assigneeMembershipId },
      select: { userId: true },
    })
    if (assignee && assignee.userId !== ctx.user.id) {
      await notifyUsers({
        orgId: org.id,
        userIds: [assignee.userId],
        type: 'TASK',
        title: `New task assigned: ${title}`,
        module: 'my-tasks',
      })
    }
  }

  // re-fetch so dependsOn/dependents reflect the rows created above
  const fresh = dependsOnTaskIds.length
    ? await db.task.findUnique({ where: { id: created.id }, include: taskInclude })
    : created
  const [enriched] = await enrichTasks(org.id, [fresh ?? created])
  return ok(enriched, 201)
})

/** local-midnight value (task dates are whole days) */
function startOfDayVal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
