import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, optDate, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const ENTITY_TYPES = ['LEAD', 'DEAL', 'CONTACT', 'CLIENT', 'COMPANY'] as const
const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'FOLLOWUP', 'TASK'] as const

/** H10 fix: verify that a CRM entity exists in the org before attaching an activity to it. */
async function verifyCrmEntityExists(entityType: string, entityId: string, orgId: string): Promise<boolean> {
  switch (entityType) {
    case 'LEAD':
      return !!(await db.lead.findFirst({ where: { id: entityId, orgId }, select: { id: true } }))
    case 'DEAL':
      return !!(await db.deal.findFirst({ where: { id: entityId, orgId }, select: { id: true } }))
    case 'CONTACT':
      return !!(await db.contact.findFirst({ where: { id: entityId, orgId }, select: { id: true } }))
    case 'CLIENT':
      return !!(await db.client.findFirst({ where: { id: entityId, orgId }, select: { id: true } }))
    case 'COMPANY':
      return !!(await db.company.findFirst({ where: { id: entityId, orgId }, select: { id: true } }))
    default:
      return false
  }
}

const activityInclude = {
  createdBy: { select: { user: { select: { name: true } } } },
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-deals', 'view')
    if (denied) return denied
    const sp = req.nextUrl.searchParams
    const entityType = sp.get('entityType')?.trim().toUpperCase() || undefined
    const entityId = sp.get('entityId')?.trim() || undefined
    const filter = sp.get('filter')?.trim() || undefined

    const activities = await db.crmActivity.findMany({
      where: {
        orgId: org.id,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(filter
          ? { OR: [{ subject: { contains: filter } }, { notes: { contains: filter } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: activityInclude,
    })

    return ok({
      items: activities.map((a) => ({ ...a, createdByName: a.createdBy?.user?.name ?? null })),
    })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-deals', 'full')
    if (denied) return denied
    const b = await body(req)

    const entityType = oneOf(
      typeof b.entityType === 'string' ? b.entityType.trim().toUpperCase() : b.entityType,
      ENTITY_TYPES
    )
    const entityId = str(b.entityId, 'entityId')
    const type = oneOf(b.type, ACTIVITY_TYPES, 'NOTE')

    // H10 fix: verify the referenced entity actually exists in this org before creating the activity.
    // Prevents bogus activity rows referencing nonexistent or cross-tenant entity IDs.
    const entityExists = await verifyCrmEntityExists(entityType, entityId, org.id)
    if (!entityExists) return fail('Referenced entity not found in this organization', 404)

    const activity = await db.crmActivity.create({
      data: {
        orgId: org.id,
        entityType,
        entityId,
        type,
        subject: str(b.subject, 'subject', { required: false, max: 200 }) || null,
        notes: str(b.notes, 'notes', { required: false }) || null,
        dueDate: optDate(b.dueDate) ?? null,
        createdById: membership.id,
      },
      include: activityInclude,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'crm_activity.created',
      entityType,
      entityId,
      message: `${type.charAt(0) + type.slice(1).toLowerCase()} logged${activity.subject ? `: ${activity.subject}` : ''}`,
    })

    return ok({ ...activity, createdByName: activity.createdBy?.user?.name ?? null }, 201)
})
