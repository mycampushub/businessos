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
const JOB_STATUSES = ['OPEN', 'PAUSED', 'CLOSED'] as const

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

async function mapSingleJob(orgId: string, j: JobRow) {
  let hiringManagerName: string | null = null
  if (j.hiringManagerMembershipId) {
    const mgr = await db.membership.findFirst({
      where: { id: j.hiringManagerMembershipId, orgId },
      select: { user: { select: { name: true } } },
    })
    hiringManagerName = mgr?.user.name ?? null
  }
  const applicationCount = await db.application.count({ where: { jobId: j.id } })
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

// PATCH /api/recruitment/jobs/[id] — edit a job posting (OWNER/ADMIN/MANAGER/HR)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'recruit-jobs', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'MANAGER', 'HR'])

    const job = await db.job.findFirst({ where: { id, orgId: org.id }, include: INCLUDE })
    if (!job) return fail('Job not found', 404)

    const b = await body(req)
    const data: {
      title?: string
      departmentId?: string | null
      description?: string
      responsibilities?: string | null
      requirements?: string | null
      skills?: string | null
      experienceLevel?: string | null
      employmentType?: string
      location?: string | null
      workMode?: string
      salaryMin?: number | null
      salaryMax?: number | null
      currency?: string
      deadline?: Date | null
      openings?: number
      visibility?: string
      status?: string
      hiringManagerMembershipId?: string | null
    } = {}

    if (b.title !== undefined) data.title = str(b.title, 'title', { max: 120 })
    if (b.description !== undefined) data.description = str(b.description, 'description', { max: 5000 })
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

    const opt = (v: unknown, max: number): string | null =>
      v === undefined || v === null ? null : String(v).trim().slice(0, max) || null
    if (b.responsibilities !== undefined) data.responsibilities = opt(b.responsibilities, 2000)
    if (b.requirements !== undefined) data.requirements = opt(b.requirements, 2000)
    if (b.skills !== undefined) data.skills = opt(b.skills, 300)
    if (b.experienceLevel !== undefined) {
      data.experienceLevel =
        b.experienceLevel === null || b.experienceLevel === '' ? null : oneOf(b.experienceLevel, EXPERIENCE_LEVELS)
    }
    if (b.employmentType !== undefined) data.employmentType = oneOf(b.employmentType, EMPLOYMENT_TYPES)
    if (b.location !== undefined) data.location = opt(b.location, 120)
    if (b.workMode !== undefined) data.workMode = oneOf(b.workMode, WORK_MODES)
    // C7: client sends dollars, DB stores cents
    if (b.salaryMin !== undefined) data.salaryMin = toCents(optNum(b.salaryMin))
    if (b.salaryMax !== undefined) data.salaryMax = toCents(optNum(b.salaryMax))
    if (b.currency !== undefined) data.currency = opt(b.currency, 8) ?? org.currency
    if (b.deadline !== undefined) data.deadline = optDate(b.deadline) ?? null
    if (b.openings !== undefined) {
      data.openings = b.openings === null || b.openings === '' ? 1 : Math.max(1, Math.round(Number(b.openings)) || 1)
    }
    if (b.visibility !== undefined) data.visibility = oneOf(b.visibility, VISIBILITIES)
    if (b.status !== undefined) data.status = oneOf(b.status, JOB_STATUSES)
    if (b.hiringManagerMembershipId !== undefined) {
      if (b.hiringManagerMembershipId === null || b.hiringManagerMembershipId === '') {
        data.hiringManagerMembershipId = null
      } else {
        const mgr = await db.membership.findFirst({
          where: { id: String(b.hiringManagerMembershipId), orgId: org.id },
          select: { id: true },
        })
        if (!mgr) return fail('Hiring manager not found in this organization', 404)
        data.hiringManagerMembershipId = mgr.id
      }
    }

    if (!Object.keys(data).length) return fail('No fields to update', 422)

    const updated = await db.job.update({ where: { id: job.id }, data, include: INCLUDE })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'job.updated',
      entityType: 'JOB',
      entityId: job.id,
      message: `${ctx.user.name} updated the ${updated.title} job posting`,
    })

    return ok(await mapSingleJob(org.id, updated))
  })(req)
}

// DELETE /api/recruitment/jobs/[id] — remove a job (applications cascade)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'recruit-jobs', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'MANAGER', 'HR'])

    const job = await db.job.findFirst({ where: { id, orgId: org.id } })
    if (!job) return fail('Job not found', 404)

    await db.job.delete({ where: { id: job.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'job.deleted',
      entityType: 'JOB',
      entityId: job.id,
      message: `${ctx.user.name} deleted the ${job.title} job posting`,
    })

    return ok({ id: job.id })
  })(req)
}
