import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess, getAccess } from '@/lib/server/access'
import { getObject } from '@/lib/server/storage'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * GET /api/documents/[id]/download — stream the stored file.
 * Tenant-safe: the document must belong to the caller's active org and follow
 * the same documents-module FULL / project-assignment scoping as the document
 * list route. Documents registered without stored bytes (metadata-only or
 * seeded demo rows) return 404 "File not stored for this document".
 */
export async function GET(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    // module access gate (Documents module; a project's Documents tab also downloads)
    const denied = requireAccess(ctx, 'documents', 'view')
    if (denied) return denied

    const document = await db.document.findFirst({
      where: { id, orgId: org.id },
      select: {
        id: true, name: true, mimeType: true, size: true,
        storageKey: true, projectId: true, uploadedById: true,
      },
    })
    if (!document) return fail('Document not found', 404)

    // documents-module FULL check — same convention as the list route: non-FULL
    // callers only reach unscoped documents or docs of their own projects
    const access = await getAccess(ctx)
    const full = membership.role === 'OWNER' || access['documents'] === 'FULL'
    if (!full && document.projectId) {
      const project = await db.project.findFirst({
        where: {
          id: document.projectId,
          orgId: org.id,
          OR: [
            { managerMembershipId: membership.id },
            { projectMembers: { some: { membershipId: membership.id } } },
          ],
        },
        select: { id: true },
      })
      if (!project && document.uploadedById !== membership.id) {
        return fail('You do not have access to this document', 403)
      }
    }

    if (!document.storageKey) return fail('File not stored for this document', 404)
    const object = await getObject(document.storageKey)
    if (!object) return fail('File not stored for this document', 404)

    const asciiFallback = document.name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').slice(0, 100) || 'download'
    return new NextResponse(object.bytes, {
      status: 200,
      headers: {
        'content-type': document.mimeType ?? 'application/octet-stream',
        'content-length': String(object.bytes.byteLength),
        'content-disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        'cache-control': 'private, no-store',
      },
    })
  })(req)
}
