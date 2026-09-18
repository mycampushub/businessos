import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, num, optNum, optDate, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { dealInclude, decorateDeals, money, clampProb, type DealRow } from './deal-helpers'

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-deals', 'view')
  if (denied) return denied
  const [deals, stages] = await Promise.all([
    db.deal.findMany({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' }, include: dealInclude }),
    db.pipelineStage.findMany({ where: { orgId: org.id }, orderBy: { order: 'asc' } }),
  ])
  return ok({ items: await decorateDeals(org.id, deals as DealRow[]), stages })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-deals', 'full')
  if (denied) return denied
  const b = await body(req)

  const name = str(b.name, 'name', { max: 200 })
  const value = num(b.value, 'value', { required: false, min: 0 })
  const probability = clampProb(optNum(b.probability) ?? 20)

  let companyId: string | null = null
  if (typeof b.companyId === 'string' && b.companyId.trim()) {
    const c = await db.company.findFirst({ where: { id: b.companyId.trim(), orgId: org.id } })
    if (!c) return fail('Invalid companyId', 422)
    companyId = c.id
  }
  let contactId: string | null = null
  if (typeof b.contactId === 'string' && b.contactId.trim()) {
    const c = await db.contact.findFirst({ where: { id: b.contactId.trim(), orgId: org.id } })
    if (!c) return fail('Invalid contactId', 422)
    contactId = c.id
  }
  // invalid/missing stageId → default to first stage of the org pipeline
  let stageId: string | null = null
  if (typeof b.stageId === 'string' && b.stageId.trim()) {
    const st = await db.pipelineStage.findFirst({ where: { id: b.stageId.trim(), orgId: org.id } })
    if (st) stageId = st.id
  }
  if (!stageId) {
    const first = await db.pipelineStage.findFirst({ where: { orgId: org.id }, orderBy: { order: 'asc' } })
    if (!first) return fail('No pipeline stages configured for this organization', 422)
    stageId = first.id
  }

  const deal = await db.deal.create({
    data: {
      orgId: org.id,
      name,
      value,
      companyId,
      contactId,
      stageId,
      probability,
      expectedCloseDate: optDate(b.expectedCloseDate) ?? null,
      ownerMembershipId: membership.id,
      notes: b.notes === null || b.notes === undefined ? null : str(b.notes, 'notes', { required: false }) || null,
    },
    include: dealInclude,
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'deal.created',
    entityType: 'DEAL',
    entityId: deal.id,
    message: `Deal "${deal.name}" created (${money(deal.value)})`,
  })
  await notifyUsers({
    orgId: org.id,
    userIds: await managerUserIds(org.id),
    type: 'CRM',
    title: `New deal: ${deal.name}`,
    body: `${money(deal.value)} · owned by ${ctx.user.name}`,
    module: 'crm-deals',
  })

  const [decorated] = await decorateDeals(org.id, [deal as DealRow])
  return ok(decorated, 201)
})
