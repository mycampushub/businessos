import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, oneOf, notifyUsers, logActivity } from '@/lib/server/api'
import { requirePlatform, platformAudit, orgItem } from '../../guard'
import { subItem, subInclude, planItem, planSubscriptionCounts, assignSubscription, LIVE_SUB_STATUSES } from '@/lib/server/billing'

const ORG_ACTIONS = ['suspend', 'activate'] as const

/**
 * GET /api/platform/orgs/[id] — full tenant profile for the drill-down dialog:
 * org details + owner, current subscription, plan catalog (for the manage
 * dialog), usage counters, member directory, recent audit + activity.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq: NextRequest, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const org = await db.organization.findUnique({ where: { id } })
    if (!org) return fail('Organization not found', 404)

    const [owner, members, subscription, plans, subCounts, counts, recentAudit, recentActivity] = await Promise.all([
      db.user.findUnique({ where: { id: org.ownerId }, select: { id: true, name: true, email: true, avatarUrl: true } }),
      db.membership.findMany({
        where: { orgId: org.id, status: { not: 'ALUMNI' } },
        select: {
          id: true, role: true, title: true, status: true, joinedAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
        take: 30,
      }),
      db.subscription.findFirst({
        where: { orgId: org.id, status: { in: LIVE_SUB_STATUSES } },
        include: subInclude,
        orderBy: { createdAt: 'desc' },
      }),
      db.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      planSubscriptionCounts(),
      Promise.all([
        db.membership.count({ where: { orgId: org.id, status: { not: 'ALUMNI' } } }),
        db.department.count({ where: { orgId: org.id } }),
        db.team.count({ where: { orgId: org.id } }),
        db.project.count({ where: { orgId: org.id } }),
        db.task.count({ where: { orgId: org.id } }),
        db.document.count({ where: { orgId: org.id } }),
        db.document.aggregate({ where: { orgId: org.id }, _sum: { size: true } }),
        db.meeting.count({ where: { orgId: org.id } }),
        db.job.count({ where: { orgId: org.id } }),
        db.application.count({ where: { job: { orgId: org.id } } }),
        db.invoice.count({ where: { orgId: org.id } }),
        db.leaveRequest.count({ where: { orgId: org.id } }),
      ]),
      db.auditLog.findMany({
        where: { orgId: org.id },
        select: { id: true, action: true, entity: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.activityLog.findMany({
        where: { orgId: org.id },
        select: { id: true, action: true, message: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    const [
      memberCount, departmentCount, teamCount, projectCount, taskCount,
      documentCount, storageAgg, meetingCount, jobCount, applicationCount, invoiceCount, leaveCount,
    ] = counts

    return ok({
      org: {
        ...(await orgItem(org)),
        description: org.description,
        orgType: org.orgType,
        website: org.website,
        country: org.country,
        timezone: org.timezone,
        foundedYear: org.foundedYear,
        createdAt: org.createdAt.toISOString(),
        ownerId: org.ownerId,
        ownerEmail: owner?.email ?? null,
        ownerAvatarUrl: owner?.avatarUrl ?? null,
      },
      subscription: subscription ? subItem(subscription) : null,
      plans: plans.map((p) => planItem(p, subCounts.get(p.id) ?? 0)),
      usage: {
        members: memberCount,
        departments: departmentCount,
        teams: teamCount,
        projects: projectCount,
        tasks: taskCount,
        documents: documentCount,
        storageBytes: storageAgg._sum.size ?? 0,
        meetings: meetingCount,
        jobs: jobCount,
        applications: applicationCount,
        invoices: invoiceCount,
        leaveRequests: leaveCount,
      },
      members: members.map((m) => ({
        id: m.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        title: m.title,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
      })),
      recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, entity: a.entity, createdAt: a.createdAt.toISOString() })),
      recentActivity: recentActivity.map((a) => ({ id: a.id, action: a.action, message: a.message, createdAt: a.createdAt.toISOString() })),
    })
  })(req)
}

// `LIVE_SUB_STATUSES` comes from the billing lib (imported at the top).

/**
 * PATCH /api/platform/orgs/[id] — { action: 'suspend' | 'activate' } OR { plan }.
 * Suspend/activate: org moderation (owner notified on suspend; sessions are NOT killed —
 * getSessionUser already nulls activeOrgId/access for suspended orgs).
 * Plan: billing tier — now delegates to the subscription engine (assigns the
 * matching plan, cancels the previous live subscription, syncs org.plan).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq: NextRequest, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const org = await db.organization.findUnique({ where: { id } })
    if (!org) return fail('Organization not found', 404)

    const b = await body<{ action?: unknown; plan?: unknown }>(req)

    if (b.action !== undefined) {
      const action = oneOf(b.action, ORG_ACTIONS)

      if (action === 'suspend') {
        await db.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } })
        await notifyUsers({
          orgId: org.id,
          userIds: [org.ownerId],
          type: 'SYSTEM',
          title: 'Your organization was suspended',
          body: `Platform administration suspended ${org.name}. Contact support.`,
        })
        await platformAudit({
          orgId: org.id,
          action: 'org.suspended',
          entity: 'Organization',
          entityId: org.id,
          newValues: { status: 'SUSPENDED' },
        })
        await logActivity({
          orgId: org.id,
          actorMembershipId: null,
          action: 'org.suspended',
          entityType: 'ORGANIZATION',
          entityId: org.id,
          message: `Platform administration suspended ${org.name}`,
        })
      } else {
        await db.organization.update({ where: { id: org.id }, data: { status: 'ACTIVE' } })
        await platformAudit({
          orgId: org.id,
          action: 'org.activated',
          entity: 'Organization',
          entityId: org.id,
          newValues: { status: 'ACTIVE' },
        })
        await logActivity({
          orgId: org.id,
          actorMembershipId: null,
          action: 'org.activated',
          entityType: 'ORGANIZATION',
          entityId: org.id,
          message: `Platform administration reactivated ${org.name}`,
        })
      }
    } else if (b.plan !== undefined) {
      if (typeof b.plan !== 'string' || !b.plan.trim()) return fail('Unknown plan', 422)
      const planName = b.plan.trim()
      const plan = await db.plan.findFirst({ where: { name: planName } })
      if (!plan) return fail(`No plan named "${planName}" exists`, 422)

      try {
        await assignSubscription({ orgId: org.id, planCode: plan.code, actorName: ctx.user.name })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not assign the subscription'
        return fail(message, 422)
      }
    } else {
      return fail('Provide an action or a plan', 422)
    }

    const updated = await db.organization.findUnique({ where: { id: org.id } })
    return ok(updated ? await orgItem(updated) : null)
  })(req)
}
