import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireAccess, logActivity } from '@/lib/server/api'

// POST /api/documents/[id]/restore — undo a soft-delete (M15-fe)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'documents', 'full')
    if (denied) return denied

    const doc = await db.document.findFirst({
      where: { id, orgId: org.id, deletedAt: { not: null } },
      select: { id: true, name: true },
    })
    if (!doc) return fail('Deleted document not found', 404)

    await db.document.update({ where: { id: doc.id }, data: { deletedAt: null } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'document.restored',
      entityType: 'DOCUMENT',
      entityId: doc.id,
      message: `Document "${doc.name}" restored`,
    })

    return ok({ id: doc.id, restored: true })
  })(req)
}
