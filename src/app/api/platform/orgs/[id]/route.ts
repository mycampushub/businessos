import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, oneOf, notifyUsers, logActivity } from '@/lib/server/api'
import { requirePlatform, platformAudit, orgItem, PLAN_SET } from '../../guard'

const ORG_ACTIONS = ['suspend', 'activate'] as const

// PATCH /api/platform/orgs/[id] — { action: 'suspend' | 'activate' } OR { plan }
// Suspend/activate: org moderation (owner notified on suspend; sessions are NOT killed —
// getSessionUser already nulls activeOrgId/access for suspended orgs). Plan: billing tier.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
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
      if (typeof b.plan !== 'string' || !PLAN_SET.has(b.plan)) return fail('Unknown plan', 422)
      const plan = b.plan

      await db.organization.update({ where: { id: org.id }, data: { plan } })
      await notifyUsers({
        orgId: org.id,
        userIds: [org.ownerId],
        type: 'SYSTEM',
        title: `Your plan changed to ${plan}`,
      })
      await platformAudit({
        orgId: org.id,
        action: 'org.plan_changed',
        entity: 'Organization',
        entityId: org.id,
        oldValues: { plan: org.plan },
        newValues: { plan },
      })
      await logActivity({
        orgId: org.id,
        actorMembershipId: null,
        action: 'org.plan_changed',
        entityType: 'ORGANIZATION',
        entityId: org.id,
        message: `Platform administration changed the plan to ${plan}`,
      })
    } else {
      return fail('Provide an action or a plan', 422)
    }

    const updated = await db.organization.findUnique({ where: { id: org.id } })
    return ok(updated ? await orgItem(updated) : null)
  })(req)
}
