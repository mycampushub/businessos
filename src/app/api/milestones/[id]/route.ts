import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, optDate, oneOf, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'] as const

type RouteParams = { params: Promise<{ id: string }> }

async function loadMilestone(id: string, orgId: string) {
  return db.milestone.findFirst({
    where: { id, project: { orgId } },
    include: { project: { select: { id: true, name: true, managerMembershipId: true } } },
  })
}

/** PATCH /api/milestones/[id] — update milestone (OWNER/ADMIN/MANAGER or project manager; projects FULL) */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'full')
    if (denied) return denied

    const milestone = await loadMilestone(id, org.id)
    if (!milestone) return fail('Milestone not found', 404)

    if (milestone.project.managerMembershipId !== membership.id) {
      requireRole(ctx, ['ADMIN', 'MANAGER'])
    }

    const data = await body(req)
    const update: Record<string, unknown> = {}

    if (data.title !== undefined) update.title = str(data.title, 'title', { max: 200 })
    if (data.description !== undefined)
      update.description = data.description === null ? null : str(data.description, 'description', { required: false, max: 4000 })
    if (data.dueDate !== undefined) update.dueDate = data.dueDate === null ? null : optDate(data.dueDate)

    let completedNow = false
    if (data.status !== undefined) {
      const status = oneOf(data.status, MILESTONE_STATUSES)
      update.status = status
      if (status === 'COMPLETED') {
        completedNow = true
        update.completedAt = new Date()
      } else if (milestone.status === 'COMPLETED') {
        update.completedAt = null
      }
    }

    if (Object.keys(update).length === 0) return fail('No valid fields to update', 422)

    const updated = await db.milestone.update({ where: { id: milestone.id }, data: update })

    if (completedNow) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'milestone.completed',
        entityType: 'MILESTONE',
        entityId: milestone.id,
        message: `Milestone "${updated.title}" completed for ${milestone.project.name}`,
      })
      const manager = milestone.project.managerMembershipId
        ? await db.membership.findUnique({
            where: { id: milestone.project.managerMembershipId },
            select: { userId: true },
          })
        : null
      if (manager && manager.userId !== ctx.user.id) {
        await notifyUsers({
          orgId: org.id,
          userIds: [manager.userId],
          type: 'PROJECT',
          title: `Milestone completed: ${updated.title}`,
          body: `Project "${milestone.project.name}"`,
          module: 'projects',
        })
      }
    } else {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'milestone.updated',
        entityType: 'MILESTONE',
        entityId: milestone.id,
        message: `Milestone "${updated.title}" updated`,
      })
    }

    return ok(updated)
  })(req)
}

/** DELETE /api/milestones/[id] (projects FULL) */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'full')
    if (denied) return denied

    const milestone = await loadMilestone(id, org.id)
    if (!milestone) return fail('Milestone not found', 404)

    if (milestone.project.managerMembershipId !== membership.id) {
      requireRole(ctx, ['ADMIN', 'MANAGER'])
    }

    await db.milestone.delete({ where: { id: milestone.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'milestone.deleted',
      entityType: 'MILESTONE',
      entityId: milestone.id,
      message: `Milestone "${milestone.title}" deleted from ${milestone.project.name}`,
    })

    return ok({})
  })(req)
}
