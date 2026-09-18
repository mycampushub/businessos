import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const INCLUDE = {
  department: { select: { id: true, name: true } },
  teamMembers: {
    include: {
      membership: { select: { id: true, user: { select: { name: true, avatarUrl: true } } } },
    },
  },
} as const

type TeamRow = {
  id: string
  orgId: string
  name: string
  description: string | null
  departmentId: string | null
  createdAt: Date
  department: { id: string; name: string } | null
  teamMembers: Array<{
    id: string
    teamId: string
    membershipId: string
    role: string | null
    membership: { id: string; user: { name: string; avatarUrl: string | null } }
  }>
}

function mapTeam(t: TeamRow) {
  const members = t.teamMembers
    .slice()
    .sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || a.membership.user.name.localeCompare(b.membership.user.name))
    .map((tm) => ({
      id: tm.id, // teamMember id
      membershipId: tm.membershipId,
      name: tm.membership.user.name,
      avatarUrl: tm.membership.user.avatarUrl,
      role: tm.role, // role within the team, e.g. "Lead"
    }))
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    createdAt: t.createdAt,
    members,
    memberCount: members.length,
  }
}

/** membership ids from body, validated to belong to the org */
async function validMemberIds(orgId: string, raw: unknown): Promise<string[] | null> {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && !!x))]
  if (!ids.length) return []
  const valid = await db.membership.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true },
  })
  if (valid.length !== ids.length) return null
  return ids
}

// GET /api/teams — org teams with department + members
export async function GET(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'view')
    if (denied) return denied

    const teams = await db.team.findMany({
      where: { orgId: org.id },
      include: INCLUDE,
      orderBy: { name: 'asc' },
    })

    return ok({ items: teams.map(mapTeam) })
  })(req)
}

// POST /api/teams — create a team (OWNER/ADMIN/HR) with optional initial members
export async function POST(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const b = await body(req)
    const name = str(b.name, 'name', { max: 80 })
    const description =
      b.description !== undefined && b.description !== null
        ? String(b.description).trim().slice(0, 500) || null
        : null

    let departmentId: string | null = null
    if (b.departmentId !== undefined && b.departmentId !== null && b.departmentId !== '') {
      const dept = await db.department.findFirst({
        where: { id: String(b.departmentId), orgId: org.id },
        select: { id: true },
      })
      if (!dept) return fail('Department not found', 404)
      departmentId = dept.id
    }

    const memberIds = await validMemberIds(org.id, b.memberIds)
    if (memberIds === null) return fail('One or more member ids are invalid', 422)

    const team = await db.team.create({
      data: {
        orgId: org.id,
        name,
        description,
        departmentId,
        teamMembers: { create: memberIds.map((membershipId) => ({ membershipId })) },
      },
      include: INCLUDE,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'team.created',
      entityType: 'TEAM',
      entityId: team.id,
      message: `${ctx.user.name} created the ${name} team${memberIds.length ? ` with ${memberIds.length} member(s)` : ''}`,
    })

    return ok(mapTeam(team))
  })(req)
}
