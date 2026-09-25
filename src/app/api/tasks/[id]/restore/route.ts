import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, logActivity } from '@/lib/server/api'

// POST /api/tasks/[id]/restore — undo a soft-delete (M15-fe)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)

    // Find the task INCLUDING soft-deleted ones (bypass the auto-filter by specifying deletedAt)
    const task = await db.task.findFirst({
      where: { id, orgId: org.id, deletedAt: { not: null } },
      select: { id: true, title: true, creatorMembershipId: true, assigneeMembershipId: true },
    })
    if (!task) return fail('Deleted task not found', 404)

    const isOwner = task.creatorMembershipId === membership.id || task.assigneeMembershipId === membership.id
    const canRestore = isOwner || membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'MANAGER'
    if (!canRestore) return fail('Insufficient permissions', 403)

    await db.task.update({ where: { id: task.id }, data: { deletedAt: null } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'task.restored',
      entityType: 'TASK',
      entityId: task.id,
      message: `Task "${task.title}" restored`,
    })

    return ok({ id: task.id, restored: true })
  })(req)
}
