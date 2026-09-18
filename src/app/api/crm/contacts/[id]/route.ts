import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'full')
    if (denied) return denied
    const existing = await db.contact.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Contact not found', 404)

    const b = await body(req)

    const name = b.name !== undefined ? str(b.name, 'name', { max: 200 }) : undefined
    const position = b.position !== undefined ? str(b.position, 'position', { required: false, max: 120 }) || null : undefined
    const email = b.email !== undefined ? str(b.email, 'email', { required: false, max: 200 }) || null : undefined
    const phone = b.phone !== undefined ? str(b.phone, 'phone', { required: false, max: 50 }) || null : undefined
    const notes = b.notes !== undefined ? (b.notes === null ? null : str(b.notes, 'notes', { required: false }) || null) : undefined

    let companyId: string | null | undefined
    if (b.companyId !== undefined) {
      if (b.companyId === null) companyId = null
      else {
        const c = await db.company.findFirst({ where: { id: String(b.companyId).trim(), orgId: org.id } })
        if (!c) return fail('Invalid companyId', 422)
        companyId = c.id
      }
    }

    const contact = await db.contact.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(position !== undefined && { position }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(companyId !== undefined && { companyId }),
        ...(notes !== undefined && { notes }),
      },
      include: { company: { select: { id: true, name: true } } },
    })

    if (name !== undefined || position !== undefined || email !== undefined || phone !== undefined || companyId !== undefined || notes !== undefined) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'contact.updated',
        entityType: 'CONTACT',
        entityId: contact.id,
        message: `Contact "${contact.name}" updated`,
      })
    }

    return ok({ ...contact, companyName: contact.company?.name ?? null })
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'full')
    if (denied) return denied
    const existing = await db.contact.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Contact not found', 404)
    await db.contact.delete({ where: { id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'contact.deleted',
      entityType: 'CONTACT',
      entityId: id,
      message: `Contact "${existing.name}" deleted`,
    })
    return ok({})
  })(req)
}
