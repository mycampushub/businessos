import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, oneOf, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'

const STAGES = ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED'] as const
const ACTIONS = ['hire', 'reject'] as const

/** Internal recruiting notes are only editable/visible to these roles. */
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
    user: user ?? null,
  }
}

// PATCH /api/recruitment/applications/[id] — {stage} or {action:'hire'|'reject'} (+ optional {notes} for note roles) (OWNER/ADMIN/MANAGER/HR)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    requireRole(ctx, ['ADMIN', 'MANAGER', 'HR'])

    const app = await db.application.findUnique({ where: { id }, include: { ...INCLUDE, job: { select: { id: true, title: true, orgId: true } } } })
    if (!app || app.job.orgId !== org.id) return fail('Application not found', 404)

    const canSeeNotes = NOTES_ROLES.includes(membership.role)

    const b = await body(req)
    const now = new Date()

    // notes: only note roles may set them — the field is ignored for anyone else
    let notesUpdate: string | null | undefined
    if (b.notes !== undefined && canSeeNotes) {
      notesUpdate = b.notes === null ? null : String(b.notes).trim().slice(0, 3000) || null
    }

    let newStage: string | undefined
    let action: 'hire' | 'reject' | null = null
    if (b.action !== undefined && b.action !== null && b.action !== '') {
      action = oneOf(b.action, ACTIONS)
      newStage = action === 'hire' ? 'HIRED' : 'REJECTED'
    } else if (b.stage !== undefined && b.stage !== null && b.stage !== '') {
      newStage = oneOf(b.stage, STAGES)
    } else if (notesUpdate === undefined) {
      return fail('Provide "stage" or "action"', 422)
    }

    if (newStage !== undefined && app.stage === newStage && notesUpdate === undefined) {
      return fail('Application is already in that stage', 400)
    }

    const isTerminal = newStage === 'HIRED' || newStage === 'REJECTED'
    const updated = await db.application.update({
      where: { id: app.id },
      data: {
        ...(newStage !== undefined ? { stage: newStage, processedByMembershipId: membership.id } : {}),
        ...(isTerminal ? { decidedAt: now } : {}),
        ...(notesUpdate !== undefined ? { notes: notesUpdate } : {}),
      },
      include: INCLUDE,
    })

    const jobTitle = app.job.title

    if (action === 'hire') {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'candidate.hired',
        entityType: 'APPLICATION',
        entityId: app.id,
        message: `${app.candidateName} was hired for ${jobTitle}`,
      })
      const managerIds = (await managerUserIds(org.id)).filter((uid) => uid !== ctx.user.id)
      await notifyUsers({
        orgId: org.id,
        userIds: managerIds,
        type: 'HR',
        title: `Candidate hired: ${app.candidateName}`,
        body: `${app.candidateName} was hired for ${jobTitle}`,
        module: 'recruit-candidates',
      })

      // T4-c hire → onboarding: if the hired candidate is a platform user without a
      // membership in the job's org, create their employee membership automatically.
      // If they are already a member (any status), this step is SKIPPED silently.
      if (app.userId) {
        const job = await db.job.findUnique({
          where: { id: app.jobId },
          select: { orgId: true, title: true, departmentId: true },
        })
        if (job && job.orgId === org.id) {
          const existingMembership = await db.membership.findFirst({
            where: { userId: app.userId, orgId: job.orgId },
            select: { id: true },
          })
          if (!existingMembership) {
            // employee code: prefix = org name initials (first letter of each word,
            // uppercase, max 4 chars, fallback 'EMP') + collision-safe sequence —
            // bumped while the code already exists in the org (manual/imported codes)
            const jobOrg = await db.organization.findUnique({
              where: { id: job.orgId },
              select: { name: true },
            })
            const prefix =
              (jobOrg?.name ?? '')
                .split(/\s+/)
                .map((w) => w.match(/[A-Za-z]/)?.[0] ?? '')
                .join('')
                .toUpperCase()
                .slice(0, 4) || 'EMP'
            let seq = (await db.membership.count({ where: { orgId: job.orgId } })) + 1
            let employeeCode = `${prefix}-${String(seq).padStart(3, '0')}`
            while (
              await db.membership.findFirst({ where: { orgId: job.orgId, employeeCode }, select: { id: true } })
            ) {
              seq += 1
              employeeCode = `${prefix}-${String(seq).padStart(3, '0')}`
            }
            const newMembership = await db.membership.create({
              data: {
                orgId: job.orgId,
                userId: app.userId,
                role: 'EMPLOYEE',
                title: job.title,
                status: 'ACTIVE',
                departmentId: job.departmentId ?? null,
                joinedAt: new Date(),
                employmentType: 'FULL_TIME',
                employeeCode,
              },
            })
            await notifyUsers({
              orgId: job.orgId,
              userIds: [app.userId],
              type: 'HR',
              title: `Welcome to ${org.name} — your employee account is ready`,
              body: `You joined as ${job.title}.`,
              module: 'hr-employees',
            })
            await logActivity({
              orgId: org.id,
              actorMembershipId: membership.id,
              action: 'member.onboarded',
              entityType: 'MEMBERSHIP',
              entityId: newMembership.id,
              message: `${app.candidateName} joined as ${job.title} (hired from application)`,
            })
          }
        }
      }
    } else if (action === 'reject') {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'application.rejected',
        entityType: 'APPLICATION',
        entityId: app.id,
        message: `${ctx.user.name} rejected ${app.candidateName} for ${jobTitle}`,
      })
    } else if (newStage !== undefined) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'application.stage_changed',
        entityType: 'APPLICATION',
        entityId: app.id,
        message: `${app.candidateName} moved to ${newStage} for ${jobTitle}`,
      })
    } else {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'application.notes_updated',
        entityType: 'APPLICATION',
        entityId: app.id,
        message: `${ctx.user.name} updated notes on ${app.candidateName} (${jobTitle})`,
      })
    }

    // let the candidate know when their application reaches a terminal state
    if (isTerminal && newStage !== undefined && app.userId) {
      await notifyUsers({
        orgId: org.id,
        userIds: [app.userId],
        type: 'HR',
        title: `Your application for ${jobTitle} was ${newStage === 'HIRED' ? 'accepted' : 'rejected'}`,
        module: 'recruit-candidates',
      })
    }

    return ok(mapApplication(updated, canSeeNotes))
  })(req)
}
