import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { deleteObject } from '@/lib/server/storage'

type RouteParams = { params: Promise<{ id: string }> }

/** DELETE /api/documents/[id] — uploader or OWNER/ADMIN (documents FULL) */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'documents', 'full')
    if (denied) return denied

    const document = await db.document.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, name: true, folder: true, uploadedById: true, storageKey: true },
    })
    if (!document) return fail('Document not found', 404)

    if (document.uploadedById !== membership.id) {
      requireRole(ctx, ['ADMIN'])
    }

    await db.document.delete({ where: { id: document.id } })

    // best-effort object cleanup (local disk / R2) — never throws
    await deleteObject(document.storageKey)

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'document.deleted',
      entityType: 'DOCUMENT',
      entityId: document.id,
      message: `Document "${document.name}" deleted from ${document.folder}`,
    })

    return ok({})
  })(req)
}
