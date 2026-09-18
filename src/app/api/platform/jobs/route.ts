import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, oneOf } from '@/lib/server/api'
import { requirePlatform } from '../guard'

const JOB_STATUS_FILTERS = ['OPEN', 'PAUSED', 'CLOSED'] as const

// GET /api/platform/jobs?q=&status= — platform-wide job moderation list. Includes ALL
// jobs across ALL orgs (visibility PUBLIC/PLATFORM/PRIVATE alike — unlike /api/jobs/public).
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim() ?? ''
  const statusRaw = sp.get('status')?.trim() ?? ''
  const status = statusRaw ? oneOf(statusRaw, JOB_STATUS_FILTERS) : undefined

  const jobs = await db.job.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { org: { name: { contains: q } } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      org: { select: { id: true, name: true } },
      department: { select: { name: true } },
      _count: { select: { applications: true } },
    },
  })

  return ok({
    items: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      orgId: j.orgId,
      orgName: j.org.name,
      departmentName: j.department?.name ?? null,
      status: j.status,
      visibility: j.visibility,
      openings: j.openings,
      applicationCount: j._count.applications,
      createdAt: j.createdAt,
      deadline: j.deadline,
    })),
  })
})
