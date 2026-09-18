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
      id: tm.id,
      membershipId: tm.membershipId,
      name: tm.membership.user.name,
      avatarUrl: tm.membership.user.avatarUrl,
      role: tm.role,
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

async function validMemberIds(orgId: string, raw: unknown): Promise<string[] | null> {
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

// PATCH /api/teams/[id] — update team; memberIds replaces the whole member set
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const team = await db.team.findFirst({ where: { id, orgId: org.id }, include: INCLUDE })
    if (!team) return fail('Team not found', 404)

    const b = await body(req)
    const data: { name?: string; description?: string | null; departmentId?: string | null } = {}

    if (b.name !== undefined) data.name = str(b.name, 'name', { max: 80 })
    if (b.description !== undefined) {
      data.description =
        b.description === null ? null : String(b.description).trim().slice(0, 500) || null
    }
    if (b.departmentId !== undefined) {
      if (b.departmentId === null || b.departmentId === '') {
        data.departmentId = null
      } else {
        const dept = await db.department.findFirst({
          where: { id: String(b.departmentId), orgId: org.id },
          select: { id: true },
        })
        if (!dept) return fail('Department not found', 404)
        data.departmentId = dept.id
      }
    }

    let newMemberIds: string[] | null = null
    if (b.memberIds !== undefined) {
      newMemberIds = await validMemberIds(org.id, b.memberIds)
      if (newMemberIds === null) return fail('One or more member ids are invalid', 422)
    }

    if (!Object.keys(data).length && newMemberIds === null) return fail('No fields to update', 422)

    const updated = await db.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.team.update({ where: { id: team.id }, data })
      }
      if (newMemberIds !== null) {
        await tx.teamMember.deleteMany({ where: { teamId: team.id } })
        if (newMemberIds.length) {
          await tx.teamMember.createMany({
            data: newMemberIds.map((membershipId) => ({ teamId: team.id, membershipId })),
          })
        }
      }
      return tx.team.findUnique({ where: { id: team.id }, include: INCLUDE })
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'team.updated',
      entityType: 'TEAM',
      entityId: team.id,
      message: `${ctx.user.name} updated the ${updated?.name ?? team.name} team`,
    })

    return ok(updated ? mapTeam(updated) : null)
  })(req)
}

// DELETE /api/teams/[id] — remove a team (team members cascade)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'org-structure', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const team = await db.team.findFirst({ where: { id, orgId: org.id } })
    if (!team) return fail('Team not found', 404)

    await db.team.delete({ where: { id: team.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'team.deleted',
      entityType: 'TEAM',
      entityId: team.id,
      message: `${ctx.user.name} deleted the ${team.name} team`,
    })

    return ok({ id: team.id })
  })(req)
}
