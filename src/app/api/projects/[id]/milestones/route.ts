import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, optDate, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

type RouteParams = { params: Promise<{ id: string }> }

/** POST /api/projects/[id]/milestones — add milestone (OWNER/ADMIN/MANAGER or project manager; projects FULL) */
export async function POST(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'full')
    if (denied) return denied

    const project = await db.project.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, name: true, managerMembershipId: true },
    })
    if (!project) return fail('Project not found', 404)

    if (project.managerMembershipId !== membership.id) {
      requireRole(ctx, ['ADMIN', 'MANAGER'])
    }

    const data = await body(req)
    const title = str(data.title, 'title', { max: 200 })
    const description = data.description
      ? str(data.description, 'description', { required: false, max: 4000 })
      : null
    const dueDate = optDate(data.dueDate) ?? null

    const milestone = await db.milestone.create({
      data: { projectId: project.id, title, description, dueDate, status: 'PENDING' },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'milestone.created',
      entityType: 'MILESTONE',
      entityId: milestone.id,
      message: `Milestone "${title}" added to project "${project.name}"`,
    })

    return ok(milestone, 201)
  })(req)
}
