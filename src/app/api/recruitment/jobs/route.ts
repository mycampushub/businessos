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
} from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { toCents, fromCents } from '@/lib/server/money'

const EXPERIENCE_LEVELS = ['ENTRY', 'MID', 'SENIOR', 'LEAD'] as const
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERN', 'TEMPORARY', 'VOLUNTEER'] as const
const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const
const VISIBILITIES = ['PUBLIC', 'PLATFORM', 'PRIVATE'] as const

const INCLUDE = { department: { select: { id: true, name: true } } } as const

type JobRow = {
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
  department: { id: string; name: string } | null
}

function mapJob(j: JobRow, hiringManagerName: string | null, applicationCount: number) {
  const { department, ...rest } = j
  return {
    ...rest,
    // C7: salaryMin/salaryMax are now Int cents in the DB — convert to dollars for the API response
    salaryMin: fromCents(j.salaryMin),
    salaryMax: fromCents(j.salaryMax),
    departmentName: department?.name ?? null,
    hiringManagerName,
    applicationCount,
  }
}

/** hiringManagerMembershipId is a plain string column (no relation) — resolve names in bulk */
async function managerNamesFor(orgId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await db.membership.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, user: { select: { name: true } } },
  })
  return new Map(rows.map((r) => [r.id, r.user.name]))
}

async function applicationCountMap(jobIds: string[]): Promise<Map<string, number>> {
  if (!jobIds.length) return new Map()
  const counts = await db.application.groupBy({
    by: ['jobId'],
    where: { jobId: { in: jobIds } },
    _count: { _all: true },
  })
  return new Map(counts.map((c) => [c.jobId, c._count._all]))
}

// GET /api/recruitment/jobs — org jobs with department, hiring manager, application count
export async function GET(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'recruit-jobs', 'view')
    if (denied) return denied

    const jobs = await db.job.findMany({
      where: { orgId: org.id },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    })

    const managerIds = [...new Set(jobs.map((j) => j.hiringManagerMembershipId).filter((x): x is string => !!x))]
    const [managers, counts] = await Promise.all([
      managerNamesFor(org.id, managerIds),
      applicationCountMap(jobs.map((j) => j.id)),
    ])

    return ok({
      items: jobs.map((j) =>
        mapJob(
          j,
          j.hiringManagerMembershipId ? (managers.get(j.hiringManagerMembershipId) ?? null) : null,
          counts.get(j.id) ?? 0,
        ),
      ),
    })
  })(req)
}

// POST /api/recruitment/jobs — publish a job opening (OWNER/ADMIN/MANAGER/HR)
export async function POST(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'recruit-jobs', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'MANAGER', 'HR'])

    const b = await body(req)
    const title = str(b.title, 'title', { max: 120 })
    const description = str(b.description, 'description', { max: 5000 })

    let departmentId: string | null = null
    if (b.departmentId !== undefined && b.departmentId !== null && b.departmentId !== '') {
      const dept = await db.department.findFirst({
        where: { id: String(b.departmentId), orgId: org.id },
        select: { id: true },
      })
      if (!dept) return fail('Department not found', 404)
      departmentId = dept.id
    }

    const opt = (v: unknown, max: number): string | null =>
      v === undefined || v === null ? null : String(v).trim().slice(0, max) || null

    const job = await db.job.create({
      data: {
        orgId: org.id,
        title,
        departmentId,
        description,
        responsibilities: opt(b.responsibilities, 2000),
        requirements: opt(b.requirements, 2000),
        skills: opt(b.skills, 300),
        experienceLevel:
          b.experienceLevel !== undefined && b.experienceLevel !== null && b.experienceLevel !== ''
            ? oneOf(b.experienceLevel, EXPERIENCE_LEVELS)
            : null,
        employmentType:
          b.employmentType !== undefined && b.employmentType !== null && b.employmentType !== ''
            ? oneOf(b.employmentType, EMPLOYMENT_TYPES)
            : 'FULL_TIME',
        location: opt(b.location, 120),
        workMode:
          b.workMode !== undefined && b.workMode !== null && b.workMode !== ''
            ? oneOf(b.workMode, WORK_MODES)
            : 'ONSITE',
        // C7: client sends dollars, DB stores cents
        salaryMin: toCents(optNum(b.salaryMin)),
        salaryMax: toCents(optNum(b.salaryMax)),
        currency: opt(b.currency, 8) ?? org.currency,
        deadline: optDate(b.deadline) ?? undefined,
        openings: b.openings === undefined || b.openings === null || b.openings === '' ? 1 : Math.max(1, Math.round(Number(b.openings)) || 1),
        visibility:
          b.visibility !== undefined && b.visibility !== null && b.visibility !== ''
            ? oneOf(b.visibility, VISIBILITIES)
            : 'PUBLIC',
        hiringManagerMembershipId: membership.id,
      },
      include: INCLUDE,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'job.created',
      entityType: 'JOB',
      entityId: job.id,
      message: `${ctx.user.name} opened a new position: ${title}`,
    })

    const [managers, counts] = await Promise.all([
      managerNamesFor(org.id, [membership.id]),
      applicationCountMap([job.id]),
    ])

    return ok(
      mapJob(
        job,
        managers.get(membership.id) ?? null,
        counts.get(job.id) ?? 0,
      ),
    )
  })(req)
}
