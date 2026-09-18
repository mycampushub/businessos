import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, optNum, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const STAGES = ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED'] as const

/** Internal recruiting notes are only visible to these roles (recruit-candidates FULL implies mgmt). */
const NOTES_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR']

const INCLUDE = {
  job: { select: { id: true, title: true } },
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const

type ApplicationRow = {
  id: string
  jobId: string
  userId: string | null
  candidateName: string
  email: string
  phone: string | null
  resumeUrl: string | null
  coverLetter: string | null
  skills: string | null
  experienceYears: number | null
  stage: string
  rating: number | null
  notes: string | null
  source: string
  processedByMembershipId: string | null
  createdAt: Date
  decidedAt: Date | null
  job: { id: string; title: string }
  user: { id: string; name: string; avatarUrl: string | null } | null
}

function mapApplication(a: ApplicationRow, canSeeNotes: boolean) {
  const { job, user, notes, ...rest } = a
  return {
    ...rest,
    notes: canSeeNotes ? notes : null, // security strip: internal notes hidden from non-mgmt roles
    jobTitle: job.title,
    user: user ?? null, // platform user info if the candidate has an account
  }
}

// GET /api/recruitment/applications?jobId=&stage= — org applications (newest first)
export async function GET(req: NextRequest) {
  return withAuth(async (rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'recruit-candidates', 'view')
    if (denied) return denied
    const canSeeNotes = NOTES_ROLES.includes(membership.role)
    const q = rq.nextUrl.searchParams
    const jobId = q.get('jobId')
    const stage = q.get('stage')

    const rows = await db.application.findMany({
      where: {
        job: { orgId: org.id },
        ...(jobId ? { jobId } : {}),
        ...(stage ? { stage } : {}),
      },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    })

    return ok({ items: rows.map((r) => mapApplication(r, canSeeNotes)), stages: STAGES as readonly string[] })
  })(req)
}

// POST /api/recruitment/applications — authenticated user applies to a job (works without an active org)
export async function POST(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const b = await body(req)
    const jobId = str(b.jobId, 'jobId')

    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return fail('Job not found', 404)
    if (job.status !== 'OPEN') return fail('Job is not open', 400)

    const opt = (v: unknown, max: number): string | null =>
      v === undefined || v === null ? null : String(v).trim().slice(0, max) || null

    const candidateName = opt(b.candidateName, 120) ?? ctx.user.name
    const email = opt(b.email, 160) ?? ctx.user.email

    const created = await db.application.create({
      data: {
        jobId,
        userId: ctx.user.id,
        candidateName,
        email,
        phone: opt(b.phone, 40),
        resumeUrl: opt(b.resumeUrl, 500),
        coverLetter: opt(b.coverLetter, 3000),
        skills: opt(b.skills, 300),
        experienceYears: optNum(b.experienceYears) ?? null,
        stage: 'APPLIED',
        source: 'PLATFORM',
      },
      include: INCLUDE,
    })

    // notify the hiring manager + org managers (skip the applicant themselves)
    let userIds: string[] = []
    if (job.hiringManagerMembershipId) {
      const hm = await db.membership.findUnique({
        where: { id: job.hiringManagerMembershipId },
        select: { userId: true },
      })
      if (hm) userIds.push(hm.userId)
    }
    userIds.push(...(await managerUserIds(job.orgId)))
    userIds = [...new Set(userIds)].filter((uid) => uid !== ctx.user.id)
    await notifyUsers({
      orgId: job.orgId,
      userIds,
      type: 'HR',
      title: `New application for ${job.title}`,
      body: `${candidateName} applied via the platform`,
      module: 'recruit-candidates',
    })

    // activity is logged in the job's org — actor is the applicant if they belong to that org
    let actorMembershipId: string | null = null
    if (ctx.membership && ctx.membership.orgId === job.orgId) {
      actorMembershipId = ctx.membership.id
    } else {
      const m = await db.membership.findFirst({
        where: { userId: ctx.user.id, orgId: job.orgId },
        select: { id: true },
      })
      actorMembershipId = m?.id ?? null
    }
    await logActivity({
      orgId: job.orgId,
      actorMembershipId,
      action: 'application.received',
      entityType: 'APPLICATION',
      entityId: created.id,
      message: `${candidateName} applied for ${job.title}`,
    })

    return ok(mapApplication(created, true))
  })(req)
}
