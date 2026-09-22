import { NextRequest } from 'next/server'
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
  managerUserIds,
} from '@/lib/server/api'
import { requireAccess, getAccess } from '@/lib/server/access'
import { getTaskColumns, doneKeys } from '@/lib/server/columns'
import { assertProjectLimit } from '@/lib/server/billing'

const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

/** GET /api/projects — list org projects (optional ?status=, ?mine=true).
 *  Access scoping: projects FULL → all org projects; otherwise only projects the caller
 *  manages or is a ProjectMember of (assignment scoping). */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'projects', 'view')
  if (denied) return denied

  const url = new URL(req.url)
  const status = url.searchParams.get('status')?.trim() || undefined
  const mine = url.searchParams.get('mine') === 'true'

  const access = await getAccess(ctx)
  const full = membership.role === 'OWNER' || access['projects'] === 'FULL'

  const where: { orgId: string; status?: string; OR?: object[] } = { orgId: org.id }
  if (status) where.status = status
  if (mine || !full) {
    // non-FULL callers only ever see their own projects (manager OR project member)
    where.OR = [
      { managerMembershipId: membership.id },
      { projectMembers: { some: { membershipId: membership.id } } },
    ]
  }

  const projects = await db.project.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const projectIds = projects.map((p) => p.id)
  const managerIds = projects.map((p) => p.managerMembershipId).filter((x): x is string => !!x)
  const columns = await getTaskColumns(org.id)
  const doneStatuses = { in: doneKeys(columns) }

  const [totals, dones, managers] = await Promise.all([
    db.task.groupBy({
      by: ['projectId'],
      where: { orgId: org.id, projectId: { in: projectIds } },
      _count: { _all: true },
    }),
    db.task.groupBy({
      by: ['projectId'],
      where: { orgId: org.id, projectId: { in: projectIds }, status: doneStatuses },
      _count: { _all: true },
    }),
    db.membership.findMany({
      where: { orgId: org.id, id: { in: managerIds } },
      select: { id: true, user: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  ])

  const totalMap = new Map(totals.map((t) => [t.projectId, t._count._all]))
  const doneMap = new Map(dones.map((t) => [t.projectId, t._count._all]))
  const mgrMap = new Map(managers.map((m) => [m.id, m]))

  const items = projects.map((p) => {
    const manager = p.managerMembershipId ? mgrMap.get(p.managerMembershipId) ?? null : null
    return {
      ...p,
      client: p.client ?? null,
      manager,
      managerName: manager?.user.name ?? null,
      taskStats: { total: totalMap.get(p.id) ?? 0, done: doneMap.get(p.id) ?? 0 },
    }
  })

  return ok({ items })
})

/** POST /api/projects — create project (OWNER/ADMIN/MANAGER with projects FULL) */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  requireRole(ctx, ['ADMIN', 'MANAGER'])
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'projects', 'full')
  if (denied) return denied
  const data = await body(req)

  const name = str(data.name, 'name', { max: 200 })
  const code = data.code ? str(data.code, 'code', { required: false, max: 40 }) : null
  const description = data.description ? str(data.description, 'description', { required: false, max: 4000 }) : null

  let clientId: string | null = null
  if (data.clientId) {
    const client = await db.client.findFirst({
      where: { id: String(data.clientId), orgId: org.id },
      select: { id: true },
    })
    if (!client) return fail('Client not found in this organization', 404)
    clientId = client.id
  }

  let managerMembershipId: string | null = membership.id
  if (data.managerMembershipId) {
    const m = await db.membership.findFirst({
      where: { id: String(data.managerMembershipId), orgId: org.id },
      select: { id: true },
    })
    if (!m) return fail('Manager membership not found in this organization', 404)
    managerMembershipId = m.id
  }

  const status = oneOf(data.status, PROJECT_STATUSES, 'PLANNING')
  const priority = oneOf(data.priority, PRIORITIES, 'MEDIUM')
  const budget = optNum(data.budget)
  const startDate = optDate(data.startDate) ?? new Date()
  const endDate = optDate(data.endDate)
  const color = data.color ? str(data.color, 'color', { required: false, max: 20 }) : null

  // the project window must be a valid range
  if (endDate && startOfDayVal(endDate) < startOfDayVal(startDate)) {
    return fail('End date cannot be before the start date', 422)
  }

  // plan project limit — throws ApiError(403) which withAuth renders as-is
  await assertProjectLimit(org.id)

  const project = await db.project.create({
    data: {
      orgId: org.id,
      name,
      code,
      description,
      clientId,
      managerMembershipId,
      status,
      priority,
      budget,
      startDate,
      endDate,
      color,
      progress: status === 'COMPLETED' ? 100 : 0,
    },
    include: { client: { select: { id: true, name: true } } },
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'project.created',
    entityType: 'PROJECT',
    entityId: project.id,
    message: `Project "${project.name}" created`,
  })

  const managerIds = await managerUserIds(org.id)
  await notifyUsers({
    orgId: org.id,
    userIds: managerIds.filter((id) => id !== ctx.user.id),
    type: 'PROJECT',
    title: `New project created: ${project.name}`,
    body: code ? `Project code: ${code}` : undefined,
    module: 'projects',
  })

  const manager = managerMembershipId
    ? await db.membership.findUnique({
        where: { id: managerMembershipId },
        select: { id: true, user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    : null

  return ok(
    {
      ...project,
      client: project.client ?? null,
      manager,
      managerName: manager?.user.name ?? null,
      taskStats: { total: 0, done: 0 },
    },
    201
  )
})

/** local-midnight value (project dates are whole days) */
function startOfDayVal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
