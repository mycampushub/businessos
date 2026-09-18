import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, optNum, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

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

    if (status === 'CONVERTED' && existing.status !== 'CONVERTED') {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'lead.converted',
        entityType: 'LEAD',
        entityId: lead.id,
        message: `Lead "${lead.name}" converted${convertedCompanyId ? ' to company' : ''}`,
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

    return ok({ ...lead, ownerName: await ownerName(org.id, lead.ownerMembershipId) })
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
