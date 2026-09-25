import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { Lead } from '@prisma/client'
import { ok, withAuth, requireOrg, body, str, optNum, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { toCents, fromCents } from '@/lib/server/money'

const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'AD', 'OUTREACH', 'EVENT', 'IMPORT', 'MANUAL'] as const

/** Lead.ownerMembershipId is a plain column (no Prisma relation) — resolve owner names manually. */
async function decorateLeads(orgId: string, leads: Lead[]) {
  const ownerIds = [...new Set(leads.map((l) => l.ownerMembershipId).filter((x): x is string => !!x))]
  const owners = ownerIds.length
    ? await db.membership.findMany({ where: { id: { in: ownerIds }, orgId }, select: { id: true, user: { select: { name: true } } } })
    : []
  const nameById = new Map(owners.map((o) => [o.id, o.user.name]))
  return leads.map((l) => ({
    ...l,
    // C7: Lead.value is now Int cents in the DB — convert to dollars for the API response
    value: fromCents(l.value),
    ownerName: l.ownerMembershipId ? nameById.get(l.ownerMembershipId) ?? null : null,
  }))
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-leads', 'view')
  if (denied) return denied
  const leads = await db.lead.findMany({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' } })
  return ok({ items: await decorateLeads(org.id, leads) })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-leads', 'full')
  if (denied) return denied
  const b = await body(req)
  const lead = await db.lead.create({
    data: {
      orgId: org.id,
      name: str(b.name, 'name', { max: 200 }),
      company: str(b.company, 'company', { required: false, max: 200 }) || null,
      email: str(b.email, 'email', { required: false, max: 200 }) || null,
      phone: str(b.phone, 'phone', { required: false, max: 50 }) || null,
      source: oneOf(b.source, LEAD_SOURCES, 'MANUAL'),
      // C7: client sends dollars, DB stores cents
      value: toCents(optNum(b.value)),
      notes: str(b.notes, 'notes', { required: false }) || null,
      ownerMembershipId: membership.id,
    },
  })
  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'lead.created',
    entityType: 'LEAD',
    entityId: lead.id,
    message: `Lead "${lead.name}" created${lead.company ? ` (${lead.company})` : ''}`,
  })
  const [decorated] = await decorateLeads(org.id, [lead])
  return ok(decorated, 201)
})
