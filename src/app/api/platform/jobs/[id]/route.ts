import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, notifyUsers, logActivity } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../../guard'

// DELETE /api/platform/jobs/[id] — remove a job posting by platform moderation.
// Applications cascade via the schema FK; the org owner is notified.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const job = await db.job.findUnique({
      where: { id },
      include: { org: { select: { id: true, name: true, ownerId: true } } },
    })
    if (!job) return fail('Job not found', 404)

    await db.job.delete({ where: { id: job.id } })

    await notifyUsers({
      orgId: job.orgId,
      userIds: [job.org.ownerId],
      type: 'RECRUITMENT',
      title: 'Job removed by platform moderation',
      body: `"${job.title}" was removed by platform administrators.`,
      module: 'recruit-jobs',
    })
    await platformAudit({
      orgId: job.orgId,
      action: 'job.removed',
      entity: 'Job',
      entityId: job.id,
    })
    await logActivity({
      orgId: job.orgId,
      actorMembershipId: null,
      action: 'job.removed',
      entityType: 'JOB',
      entityId: job.id,
      message: `Platform administration removed the ${job.title} job posting`,
    })

    return ok({ id: job.id })
  })(req)
}
