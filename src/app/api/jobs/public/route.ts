import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { fromCents } from '@/lib/server/money'

const INCLUDE = {
  org: { select: { id: true, name: true, logoUrl: true } },
  department: { select: { id: true, name: true } },
} as const

type PublicJobRow = {
  id: string
  orgId: string
  title: string
  departmentId: string | null
  description: string
  responsibilities: string | null
  requirements: string | null
  skills: string | null
  experienceLevel: string | null
  employmentType: string
  location: string | null
  workMode: string
  salaryMin: number | null
  salaryMax: number | null
  currency: string
  deadline: Date | null
  openings: number
  visibility: string
  status: string
  hiringManagerMembershipId: string | null
  createdAt: Date
  org: { id: string; name: string; logoUrl: string | null }
  department: { id: string; name: string } | null
}

function mapPublicJob(j: PublicJobRow, applicationCount: number) {
  const { department, ...rest } = j
  return {
    ...rest,
    // C7: salaryMin/salaryMax are now Int cents in the DB — convert to dollars for the API response
    salaryMin: fromCents(j.salaryMin),
    salaryMax: fromCents(j.salaryMax),
    org: { id: j.org.id, name: j.org.name, logoUrl: j.org.logoUrl },
    departmentName: department?.name ?? null,
    applicationCount,
  }
}

// GET /api/jobs/public — platform job marketplace (auth only, no active org required)
// ?mine=true → all jobs of the caller's active org (any visibility/status)
export async function GET(req: NextRequest) {
  return withAuth(async (rq, ctx) => {
    const mine = rq.nextUrl.searchParams.get('mine') === 'true'

    if (mine) {
      if (!ctx.membership || !ctx.org) return ok({ items: [] })
      const jobs = await db.job.findMany({
        where: { orgId: ctx.org.id },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
      })
      const counts = jobs.length
        ? await db.application.groupBy({ by: ['jobId'], where: { jobId: { in: jobs.map((j) => j.id) } }, _count: { _all: true } })
        : []
      const countMap = new Map(counts.map((c) => [c.jobId, c._count._all]))
      return ok({ items: jobs.map((j) => mapPublicJob(j, countMap.get(j.id) ?? 0)) })
    }

    const jobs = await db.job.findMany({
      where: { visibility: 'PUBLIC', status: 'OPEN' },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    const counts = jobs.length
      ? await db.application.groupBy({ by: ['jobId'], where: { jobId: { in: jobs.map((j) => j.id) } }, _count: { _all: true } })
      : []
    const countMap = new Map(counts.map((c) => [c.jobId, c._count._all]))

    return ok({ items: jobs.map((j) => mapPublicJob(j, countMap.get(j.id) ?? 0)) })
  })(req)
}
