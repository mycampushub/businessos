import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireAccess, logActivity } from '@/lib/server/api'

// POST /api/crm/leads/[id]/restore — undo a soft-delete (M15-fe)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'crm-leads', 'full')
    if (denied) return denied

    const lead = await db.lead.findFirst({
      where: { id, orgId: org.id, deletedAt: { not: null } },
      select: { id: true, name: true },
    })
    if (!lead) return fail('Deleted lead not found', 404)

    await db.lead.update({ where: { id: lead.id }, data: { deletedAt: null } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'lead.restored',
      entityType: 'LEAD',
      entityId: lead.id,
      message: `Lead "${lead.name}" restored`,
    })

    return ok({ id: lead.id, restored: true })
  })(req)
}
