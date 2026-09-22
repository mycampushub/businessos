import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, optNum, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { money } from '../../deals/deal-helpers'

const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'AD', 'OUTREACH', 'EVENT', 'IMPORT', 'MANUAL'] as const
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'] as const

async function ownerName(orgId: string, ownerMembershipId: string | null): Promise<string | null> {
  if (!ownerMembershipId) return null
  const m = await db.membership.findFirst({
    where: { id: ownerMembershipId, orgId },
    select: { user: { select: { name: true } } },
  })
  return m?.user.name ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-leads', 'full')
    if (denied) return denied
    const existing = await db.lead.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Lead not found', 404)

    const b = await body(req)

    const name = b.name !== undefined ? str(b.name, 'name', { max: 200 }) : undefined
    const company = b.company !== undefined ? str(b.company, 'company', { required: false, max: 200 }) || null : undefined
    const email = b.email !== undefined ? str(b.email, 'email', { required: false, max: 200 }) || null : undefined
    const phone = b.phone !== undefined ? str(b.phone, 'phone', { required: false, max: 50 }) || null : undefined
    const source = b.source !== undefined ? oneOf(b.source, LEAD_SOURCES) : undefined
    const status = b.status !== undefined ? oneOf(b.status, LEAD_STATUSES) : undefined
    const value = b.value !== undefined ? optNum(b.value) ?? null : undefined
    const notes = b.notes !== undefined ? (b.notes === null ? null : str(b.notes, 'notes', { required: false }) || null) : undefined

    // On conversion, optionally link the company the lead became.
    let convertedCompanyId: string | null | undefined
    if (b.companyId !== undefined && (status ?? existing.status) === 'CONVERTED') {
      if (b.companyId === null) {
        convertedCompanyId = null
      } else {
        const c = await db.company.findFirst({ where: { id: String(b.companyId), orgId: org.id } })
        if (!c) return fail('Invalid companyId', 422)
        convertedCompanyId = c.id
      }
    }

    const lead = await db.lead.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(company !== undefined && { company }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(source !== undefined && { source }),
        ...(status !== undefined && { status }),
        ...(value !== undefined && { value }),
        ...(notes !== undefined && { notes }),
        ...(convertedCompanyId !== undefined && { convertedCompanyId }),
      },
    })

    // ----- Lead → Deal conversion (company linkage is already persisted above) -----
    // On the CONVERTED transition, optionally open a pipeline deal for the lead:
    // first stage of the org's pipeline (a sensible default stage set is created
    // when the org has NO stages at all), valued from dealValue ?? lead.value ?? 0.
    let createdDeal: { id: string; name: string; value: number; stageName: string | null } | null = null
    const converting = status === 'CONVERTED' && existing.status !== 'CONVERTED'
    if (converting && b.createDeal === true) {
      let stage = await db.pipelineStage.findFirst({
        where: { orgId: org.id },
        orderBy: { order: 'asc' },
        select: { id: true, name: true },
      })
      if (!stage) {
        await db.pipelineStage.createMany({
          data: [
            { orgId: org.id, name: 'New', order: 0 },
            { orgId: org.id, name: 'Qualified', order: 1 },
            { orgId: org.id, name: 'Proposed', order: 2 },
            { orgId: org.id, name: 'Won', order: 3, isTerminalWon: true },
            { orgId: org.id, name: 'Lost', order: 4, isTerminalLost: true },
          ],
        })
        stage = await db.pipelineStage.findFirst({
          where: { orgId: org.id },
          orderBy: { order: 'asc' },
          select: { id: true, name: true },
        })
      }
      if (stage) {
        const dealValue = optNum(b.dealValue)
        const deal = await db.deal.create({
          data: {
            orgId: org.id,
            name: lead.company?.trim() || lead.name,
            value: dealValue !== undefined ? Math.max(0, dealValue) : (lead.value ?? 0),
            companyId: lead.convertedCompanyId,
            stageId: stage.id,
            probability: 20,
            ownerMembershipId: membership.id,
            status: 'OPEN',
          },
          select: { id: true, name: true, value: true, stage: { select: { name: true } } },
        })
        createdDeal = { id: deal.id, name: deal.name, value: deal.value, stageName: deal.stage?.name ?? null }
        await logActivity({
          orgId: org.id,
          actorMembershipId: membership.id,
          action: 'deal.created',
          entityType: 'DEAL',
          entityId: deal.id,
          message: `Deal "${deal.name}" created from lead "${lead.name}" (${money(deal.value)})`,
        })
      }
    }

    if (status === 'CONVERTED' && existing.status !== 'CONVERTED') {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'lead.converted',
        entityType: 'LEAD',
        entityId: lead.id,
        message: `Lead "${lead.name}" converted${lead.convertedCompanyId ? ' to company' : ''}${createdDeal ? ` — deal "${createdDeal.name}" created in pipeline` : ''}`,
      })
    } else if (
      name !== undefined || company !== undefined || email !== undefined || phone !== undefined ||
      source !== undefined || status !== undefined || value !== undefined || notes !== undefined
    ) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'lead.updated',
        entityType: 'LEAD',
        entityId: lead.id,
        message:
          status !== undefined && status !== existing.status
            ? `Lead "${lead.name}" marked ${status}`
            : `Lead "${lead.name}" updated`,
      })
    }

    return ok({ ...lead, ownerName: await ownerName(org.id, lead.ownerMembershipId), deal: createdDeal })
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-leads', 'full')
    if (denied) return denied
    const existing = await db.lead.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Lead not found', 404)
    await db.lead.delete({ where: { id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'lead.deleted',
      entityType: 'LEAD',
      entityId: id,
      message: `Lead "${existing.name}" deleted`,
    })
    return ok({})
  })(req)
}
