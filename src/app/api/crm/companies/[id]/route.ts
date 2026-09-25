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
    const existing = await db.company.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Company not found', 404)

    const b = await body(req)
    const name = b.name !== undefined ? str(b.name, 'name', { max: 200 }) : undefined
    const industry = b.industry !== undefined ? str(b.industry, 'industry', { required: false, max: 120 }) || null : undefined
    const website = b.website !== undefined ? str(b.website, 'website', { required: false, max: 200 }) || null : undefined
    const address = b.address !== undefined ? str(b.address, 'address', { required: false, max: 300 }) || null : undefined
    const notes = b.notes !== undefined ? (b.notes === null ? null : str(b.notes, 'notes', { required: false }) || null) : undefined

    const company = await db.company.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(industry !== undefined && { industry }),
        ...(website !== undefined && { website }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
      },
      include: { _count: { select: { contacts: true, deals: true } } },
    })

    if (name !== undefined || industry !== undefined || website !== undefined || address !== undefined || notes !== undefined) {
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'company.updated',
        entityType: 'COMPANY',
        entityId: company.id,
        message: `Company "${company.name}" updated`,
      })
    }

    const { _count, ...c } = company
    return ok({ ...c, contactCount: _count.contacts, dealCount: _count.deals })
  })(req)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-contacts', 'full')
    if (denied) return denied
    const existing = await db.company.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Company not found', 404)

    // M21 fix: refuse to delete a company that still has contacts, deals or clients
    // attached. The schema uses onDelete: SetNull so those rows would survive with
    // companyId = null — silently orphaning them. Force the user to reassign or
    // delete them first so the action is intentional and auditable.
    const counts = await db.company.findUnique({
      where: { id },
      select: { _count: { select: { contacts: true, deals: true, clients: true } } },
    })
    if (
      counts &&
      (counts._count.contacts > 0 || counts._count.deals > 0 || counts._count.clients > 0)
    ) {
      return fail(
        'Cannot delete a company with attached contacts, deals, or clients. Reassign or delete them first.',
        400,
      )
    }

    await db.company.delete({ where: { id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'company.deleted',
      entityType: 'COMPANY',
      entityId: id,
      message: `Company "${existing.name}" deleted`,
    })
    return ok({})
  })(req)
}
