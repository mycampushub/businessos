import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

const contactInclude = { company: { select: { id: true, name: true } } }

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'view')
    if (denied) return denied
    const contacts = await db.contact.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      include: contactInclude,
    })
    return ok({
      items: contacts.map((c) => ({ ...c, companyName: c.company?.name ?? null })),
    })
})

export const POST = withAuth(async (req: NextRequest, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'full')
    if (denied) return denied
    const b = await body(req)

    let companyId: string | null = null
    if (typeof b.companyId === 'string' && b.companyId.trim()) {
      const c = await db.company.findFirst({ where: { id: b.companyId.trim(), orgId: org.id } })
      if (!c) return fail('Invalid companyId', 422)
      companyId = c.id
    }

    const contact = await db.contact.create({
      data: {
        orgId: org.id,
        name: str(b.name, 'name', { max: 200 }),
        position: str(b.position, 'position', { required: false, max: 120 }) || null,
        email: str(b.email, 'email', { required: false, max: 200 }) || null,
        phone: str(b.phone, 'phone', { required: false, max: 50 }) || null,
        companyId,
        notes: str(b.notes, 'notes', { required: false }) || null,
      },
      include: contactInclude,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'contact.created',
      entityType: 'CONTACT',
      entityId: contact.id,
      message: `Contact "${contact.name}" created${contact.company ? ` at ${contact.company.name}` : ''}`,
    })

    return ok({ ...contact, companyName: contact.company?.name ?? null }, 201)
})
