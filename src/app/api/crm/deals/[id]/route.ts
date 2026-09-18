import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, num, optNum, optDate, oneOf, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { dealInclude, decorateDeals, money, clampProb } from '../deal-helpers'

const DEAL_STATUSES = ['OPEN', 'WON', 'LOST'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-deals', 'full')
    if (denied) return denied
    const existing = await db.deal.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Deal not found', 404)

    const b = await body(req)

    const name = b.name !== undefined ? str(b.name, 'name', { max: 200 }) : undefined
    const value = b.value !== undefined ? num(b.value, 'value', { required: false, min: 0 }) : undefined
    const probability =
      b.probability !== undefined ? clampProb(optNum(b.probability) ?? 20) : undefined
    const expectedCloseDate =
      b.expectedCloseDate !== undefined ? optDate(b.expectedCloseDate) ?? null : undefined
    const notes =
      b.notes !== undefined ? (b.notes === null ? null : str(b.notes, 'notes', { required: false }) || null) : undefined
    const status = b.status !== undefined ? oneOf(b.status, DEAL_STATUSES) : undefined

    let companyId: string | null | undefined
    if (b.companyId !== undefined) {
      if (b.companyId === null) companyId = null
      else {
        const c = await db.company.findFirst({ where: { id: String(b.companyId).trim(), orgId: org.id } })
        if (!c) return fail('Invalid companyId', 422)
        companyId = c.id
      }
    }
    let contactId: string | null | undefined
    if (b.contactId !== undefined) {
      if (b.contactId === null) contactId = null
      else {
        const c = await db.contact.findFirst({ where: { id: String(b.contactId).trim(), orgId: org.id } })
        if (!c) return fail('Invalid contactId', 422)
        contactId = c.id
      }
    }
    let stageId: string | undefined
    let newStageName: string | null = null
    if (b.stageId !== undefined && b.stageId !== null && String(b.stageId).trim()) {
      const st = await db.pipelineStage.findFirst({ where: { id: String(b.stageId).trim(), orgId: org.id } })
      if (!st) return fail('Invalid stageId', 422)
      stageId = st.id
      newStageName = st.name
    }

    const isWon = status === 'WON'
    const isLost = status === 'LOST'

    // WON: link (or create) a Client record when the deal has a company but no client yet.
    let clientId: string | undefined
    if (isWon && !existing.clientId) {
      const effCompanyId = companyId !== undefined ? companyId : existing.companyId
      if (effCompanyId) {
        const company = await db.company.findFirst({ where: { id: effCompanyId, orgId: org.id } })
        if (company) {
          const effContactId = contactId !== undefined ? contactId : existing.contactId
          const contact = effContactId
            ? await db.contact.findFirst({ where: { id: effContactId, orgId: org.id } })
            : null
          let client = await db.client.findFirst({ where: { companyId: company.id, orgId: org.id } })
          if (!client) {
            client = await db.client.create({
              data: {
                orgId: org.id,
                name: company.name,
                companyId: company.id,
                contactEmail: contact?.email ?? null,
                status: 'ACTIVE',
              },
            })
          }
          clientId = client.id
        }
      }
    }

    const deal = await db.deal.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(value !== undefined && { value }),
        ...(probability !== undefined && { probability }),
        ...(expectedCloseDate !== undefined && { expectedCloseDate }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
        ...(companyId !== undefined && { companyId }),
        ...(contactId !== undefined && { contactId }),
        ...(stageId !== undefined && { stageId }),
        ...(clientId !== undefined && { clientId }),
        ...(isWon && { wonAt: new Date(), probability: 100 }),
        ...(isLost && { probability: 0 }),
      },
      include: dealInclude,
    })

    let logged = false
    if (newStageName && stageId !== existing.stageId) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'deal.stage_changed',
        entityType: 'DEAL',
        entityId: deal.id,
        message: `Deal "${deal.name}" moved to ${newStageName}`,
      })
      logged = true
    }
    if (isWon) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'deal.won',
        entityType: 'DEAL',
        entityId: deal.id,
        message: `Deal "${deal.name}" won (${money(deal.value)})`,
      })
      logged = true
      const ownerUserId = deal.ownerMembershipId
        ? (
            await db.membership.findUnique({
              where: { id: deal.ownerMembershipId },
              select: { userId: true, orgId: true },
            })
          )?.userId
        : null
      await notifyUsers({
        orgId: org.id,
        userIds: [...(await managerUserIds(org.id)), ownerUserId ?? ''],
        type: 'CRM',
        title: `Deal won: ${deal.name}`,
        body: `${money(deal.value)}${deal.clientId ? ' — client linked' : ''}`,
        module: 'crm-deals',
      })
    }
    if (isLost) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'deal.lost',
        entityType: 'DEAL',
        entityId: deal.id,
        message: `Deal "${deal.name}" marked lost`,
      })
      logged = true
    }
    if (
      !logged &&
      (name !== undefined || value !== undefined || probability !== undefined || expectedCloseDate !== undefined ||
        notes !== undefined || status !== undefined || companyId !== undefined || contactId !== undefined || stageId !== undefined)
    ) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'deal.updated',
        entityType: 'DEAL',
        entityId: deal.id,
        message: `Deal "${deal.name}" updated`,
      })
    }

    const [decorated] = await decorateDeals(org.id, [deal])
    return ok(decorated)
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-deals', 'full')
    if (denied) return denied
    const existing = await db.deal.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Deal not found', 404)
    await db.deal.delete({ where: { id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'deal.deleted',
      entityType: 'DEAL',
      entityId: id,
      message: `Deal "${existing.name}" deleted`,
    })
    return ok({})
  })(req)
}
