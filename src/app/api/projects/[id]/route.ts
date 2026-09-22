import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  withAuth,
  requireOrg,
  requireRole,
  body,
  str,
  optNum,
  optDate,
  oneOf,
  logActivity,
  notifyUsers,
} from '@/lib/server/api'
import { requireAccess, getAccess } from '@/lib/server/access'
import { getTaskColumns, doneKeys, statusOrderMap } from '@/lib/server/columns'

const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

type RouteParams = { params: Promise<{ id: string }> }

const membershipSelect = {
  id: true,
  role: true,
  title: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const

function sortTasks<T extends { status: string; dueDate: Date | null }>(
  tasks: T[],
  orderMap: Record<string, number>
): T[] {
  return [...tasks].sort((a, b) => {
    const s = (orderMap[a.status] ?? 999) - (orderMap[b.status] ?? 999)
    if (s !== 0) return s
    if (a.dueDate === null && b.dueDate === null) return 0
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  })
}

/** GET /api/projects/[id] — full project detail.
 *  Existence is not leaked: callers without projects FULL who are not the project manager
 *  or a project member get 404 (same message as a missing project). */
export async function GET(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'view')
    if (denied) return denied

    const project = await db.project.findFirst({
      where: { id, orgId: org.id },
      include: {
        client: { select: { id: true, name: true, contactEmail: true } },
        milestones: true,
        tasks: {
          include: {
            project: { select: { id: true, name: true, color: true, status: true } },
            milestone: { select: { id: true, title: true } },
            dependencies: { select: { dependsOnTask: { select: { id: true, title: true, status: true } } } },
            dependents: { select: { task: { select: { id: true, title: true, status: true } } } },
            _count: { select: { subtasks: true, dependencies: true, comments: true } },
          },
        },
        projectMembers: {
          include: { membership: { select: membershipSelect } },
          orderBy: { id: 'asc' },
        },
      },
    })
    if (!project) return fail('Project not found', 404)

    // assignment scoping: FULL access sees everything; manager/members see their project; others get 404
    const access = await getAccess(ctx)
    const full = membership.role === 'OWNER' || access['projects'] === 'FULL'
    const isManager = project.managerMembershipId === membership.id
    const isMember = project.projectMembers.some((pm) => pm.membershipId === membership.id)
    if (!full && !isManager && !isMember) return fail('Project not found', 404)

    // dynamic TASK columns: order for sorting, isDone columns for done counting
    const taskColumns = await getTaskColumns(org.id)
    const orderMap = statusOrderMap(taskColumns)
    const doneSet = new Set(doneKeys(taskColumns))

    const membershipIds = new Set<string>()
    if (project.managerMembershipId) membershipIds.add(project.managerMembershipId)
    for (const t of project.tasks) {
      if (t.assigneeMembershipId) membershipIds.add(t.assigneeMembershipId)
      if (t.creatorMembershipId) membershipIds.add(t.creatorMembershipId)
    }

    const [memberships, activity, invoiceAgg] = await Promise.all([
      db.membership.findMany({
        where: { orgId: org.id, id: { in: [...membershipIds] } },
        select: membershipSelect,
      }),
      db.activityLog.findMany({
        where: { orgId: org.id, entityType: 'PROJECT', entityId: project.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { actor: { select: { user: { select: { name: true } } } } },
      }),
      db.invoice.aggregate({
        where: { orgId: org.id, projectId: project.id },
        _sum: { total: true },
      }),
    ])
    const memberMap = new Map(memberships.map((m) => [m.id, m]))

    const manager = project.managerMembershipId
      ? memberMap.get(project.managerMembershipId) ?? null
      : null

    // milestone stats from this project's tasks (done = status ∈ done columns)
    const msTotal = new Map<string, number>()
    const msDone = new Map<string, number>()
    for (const t of project.tasks) {
      if (!t.milestoneId) continue
      msTotal.set(t.milestoneId, (msTotal.get(t.milestoneId) ?? 0) + 1)
      if (doneSet.has(t.status)) msDone.set(t.milestoneId, (msDone.get(t.milestoneId) ?? 0) + 1)
    }

    const milestones = [...project.milestones]
      .sort((a, b) => {
        if (a.dueDate === null && b.dueDate === null) return 0
        if (a.dueDate === null) return 1
        if (b.dueDate === null) return -1
        return a.dueDate.getTime() - b.dueDate.getTime()
      })
      .map((m) => ({
        ...m,
        taskCount: msTotal.get(m.id) ?? 0,
        doneTaskCount: msDone.get(m.id) ?? 0,
      }))

    const now = Date.now()
    const tasks = sortTasks(project.tasks, orderMap).map((t) => {
      const assignee = t.assigneeMembershipId ? memberMap.get(t.assigneeMembershipId) ?? null : null
      const creator = t.creatorMembershipId ? memberMap.get(t.creatorMembershipId) ?? null : null
      const { dependencies, dependents, ...rest } = t
      return {
        ...rest,
        dependsOn: dependencies.map((d) => d.dependsOnTask),
        dependents: dependents.map((d) => d.task),
        assignee,
        assigneeName: assignee?.user.name ?? null,
        creator,
        creatorName: creator?.user.name ?? null,
        subtaskCount: t._count.subtasks,
      }
    })

    const done = tasks.filter((t) => doneSet.has(t.status)).length
    const overdue = tasks.filter(
      (t) => !doneSet.has(t.status) && t.dueDate !== null && t.dueDate.getTime() < now
    ).length

    const members = project.projectMembers.map((pm) => ({
      id: pm.id,
      projectId: pm.projectId,
      membershipId: pm.membershipId,
      role: pm.role,
      membership: pm.membership,
      user: pm.membership.user,
    }))
    const { projectMembers: _pm, ...projectFields } = project

    return ok({
      ...projectFields,
      client: project.client ?? null,
      manager,
      managerName: manager?.user.name ?? null,
      milestones,
      tasks,
      members,
      activity: activity.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        message: a.message,
        createdAt: a.createdAt,
        actorMembershipId: a.actorMembershipId,
        actorName: a.actor?.user.name ?? null,
      })),
      invoiceTotal: invoiceAgg._sum.total ?? 0,
      taskStats: { total: tasks.length, done, overdue },
    })
  })(req)
}

/** PATCH /api/projects/[id] — update editable fields (projects FULL + role/manager checks) */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'full')
    if (denied) return denied

    const project = await db.project.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, name: true, status: true, managerMembershipId: true, startDate: true, endDate: true },
    })
    if (!project) return fail('Project not found', 404)

    const isProjectManager = project.managerMembershipId === membership.id
    const canManage =
      membership.role === 'OWNER' ||
      membership.role === 'ADMIN' ||
      membership.role === 'MANAGER' ||
      isProjectManager
    if (!canManage) return fail('Insufficient permissions', 403)

    const data = await body(req)
    const update: Record<string, unknown> = {}

    if (data.name !== undefined) update.name = str(data.name, 'name', { max: 200 })
    if (data.code !== undefined) update.code = data.code === null ? null : str(data.code, 'code', { required: false, max: 40 })
    if (data.description !== undefined)
      update.description = data.description === null ? null : str(data.description, 'description', { required: false, max: 4000 })
    if (data.priority !== undefined) update.priority = oneOf(data.priority, PRIORITIES)
    if (data.budget !== undefined) update.budget = data.budget === null ? null : optNum(data.budget)
    if (data.startDate !== undefined) update.startDate = data.startDate === null ? null : optDate(data.startDate)
    if (data.endDate !== undefined) update.endDate = data.endDate === null ? null : optDate(data.endDate)
    if (data.color !== undefined) update.color = data.color === null ? null : str(data.color, 'color', { required: false, max: 20 })
    if (data.progress !== undefined) {
      const p = optNum(data.progress)
      if (p === undefined) return fail('Field "progress" must be a number', 422)
      update.progress = Math.max(0, Math.min(100, Math.round(p)))
    }

    // the project window must stay a valid range (effective values)
    const effStart = (update.startDate as Date | null | undefined) !== undefined
      ? (update.startDate as Date | null)
      : project.startDate
    const effEnd = (update.endDate as Date | null | undefined) !== undefined
      ? (update.endDate as Date | null)
      : project.endDate
    if (effStart && effEnd && dayVal(effEnd) < dayVal(effStart)) {
      return fail('End date cannot be before the start date', 422)
    }

    if (data.clientId !== undefined) {
      if (data.clientId === null || data.clientId === '') {
        update.clientId = null
      } else {
        const client = await db.client.findFirst({
          where: { id: String(data.clientId), orgId: org.id },
          select: { id: true },
        })
        if (!client) return fail('Client not found in this organization', 404)
        update.clientId = client.id
      }
    }

    if (data.managerMembershipId !== undefined) {
      if (data.managerMembershipId === null || data.managerMembershipId === '') {
        update.managerMembershipId = null
      } else {
        const m = await db.membership.findFirst({
          where: { id: String(data.managerMembershipId), orgId: org.id },
          select: { id: true },
        })
        if (!m) return fail('Manager membership not found in this organization', 404)
        update.managerMembershipId = m.id
      }
    }

    let statusChanged = false
    if (data.status !== undefined) {
      const status = oneOf(data.status, PROJECT_STATUSES)
      statusChanged = status !== project.status
      update.status = status
      if (status === 'COMPLETED') update.progress = 100
    }

    if (Object.keys(update).length === 0) return fail('No valid fields to update', 422)

    const updated = await db.project.update({
      where: { id: project.id },
      data: update,
      include: { client: { select: { id: true, name: true } } },
    })

    const managerId = (update.managerMembershipId as string | null | undefined) ?? project.managerMembershipId
    const manager = managerId
      ? await db.membership.findUnique({
          where: { id: managerId },
          select: { id: true, userId: true, user: { select: { id: true, name: true, avatarUrl: true } } },
        })
      : null

    if (statusChanged) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'project.status',
        entityType: 'PROJECT',
        entityId: project.id,
        message: `Project "${project.name}" status changed to ${updated.status}`,
      })
      if (manager && manager.userId !== ctx.user.id) {
        await notifyUsers({
          orgId: org.id,
          userIds: [manager.userId],
          type: 'PROJECT',
          title: `Project "${project.name}" is now ${updated.status}`,
          module: 'projects',
        })
      }
    } else {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'project.updated',
        entityType: 'PROJECT',
        entityId: project.id,
        message: `Project "${project.name}" updated`,
      })
    }

    return ok({ ...updated, client: updated.client ?? null, manager, managerName: manager?.user.name ?? null })
  })(req)
}

/** local-midnight value (project dates are whole days) */
function dayVal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** DELETE /api/projects/[id] — OWNER/ADMIN only (projects FULL) */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    requireRole(ctx, ['ADMIN'])
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'full')
    if (denied) return denied

    const project = await db.project.findFirst({ where: { id, orgId: org.id }, select: { id: true, name: true } })
    if (!project) return fail('Project not found', 404)

    await db.project.delete({ where: { id: project.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'project.deleted',
      entityType: 'PROJECT',
      entityId: project.id,
      message: `Project "${project.name}" deleted`,
    })

    return ok({})
  })(req)
}
