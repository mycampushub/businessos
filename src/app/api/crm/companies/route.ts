import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'view')
    if (denied) return denied
    const companies = await db.company.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contacts: true, deals: true } } },
    })
    return ok({
      items: companies.map(({ _count, ...c }) => ({
        ...c,
        contactCount: _count.contacts,
        dealCount: _count.deals,
      })),
    })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'full')
    if (denied) return denied
    const b = await body(req)
    const company = await db.company.create({
      data: {
        orgId: org.id,
        name: str(b.name, 'name', { max: 200 }),
        industry: str(b.industry, 'industry', { required: false, max: 120 }) || null,
        website: str(b.website, 'website', { required: false, max: 200 }) || null,
        address: str(b.address, 'address', { required: false, max: 300 }) || null,
        notes: str(b.notes, 'notes', { required: false }) || null,
      },
    })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'company.created',
      entityType: 'COMPANY',
      entityId: company.id,
      message: `Company "${company.name}" created`,
    })
    return ok({ ...company, contactCount: 0, dealCount: 0 }, 201)
})
