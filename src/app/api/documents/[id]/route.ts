import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity, audit } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { deleteObject } from '@/lib/server/storage'

type RouteParams = { params: Promise<{ id: string }> }

const documentInclude = {
  project: { select: { id: true, name: true, color: true } },
  uploadedBy: { select: { id: true, role: true, title: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
} as const

/** PATCH /api/documents/[id] — rename a document and/or move it to a different
 *  project (or "unfiled" via null). Requires documents FULL access. */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'documents', 'full')
    if (denied) return denied

    const document = await db.document.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, name: true, folder: true, projectId: true, uploadedById: true, storageKey: true },
    })
    if (!document) return fail('Document not found', 404)

    const b = await body(req)
    const data: { name?: string; projectId?: string | null } = {}

    // name (string, max 255) — rename the document
    if ('name' in b) {
      const name = str(b.name, 'name', { max: 255 })
      if (!name) return fail('Name cannot be empty', 422)
      data.name = name
    }

    // projectId (string|null) — move to a different project (must belong to org) or null for "unfiled"
    if ('projectId' in b) {
      const raw = b.projectId
      if (raw === null || raw === '' || raw === 'none') {
        data.projectId = null
      } else {
        const p = await db.project.findFirst({
          where: { id: String(raw), orgId: org.id },
          select: { id: true, name: true },
        })
        if (!p) return fail('Project not found in this organization', 404)
        data.projectId = p.id
      }
    }

    if (Object.keys(data).length === 0) {
      return fail('No editable fields provided (send "name" and/or "projectId")', 422)
    }

    const oldValues = {
      name: document.name,
      projectId: document.projectId,
    }

    const updated = await db.document.update({
      where: { id: document.id },
      data,
      include: documentInclude,
    })

    const changes: string[] = []
    if (data.name !== undefined && data.name !== oldValues.name) changes.push(`renamed to "${data.name}"`)
    if ('projectId' in data) {
      const newProj = updated.project?.name ?? 'unfiled'
      changes.push(`moved to ${newProj}`)
    }

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'document.updated',
      entityType: 'DOCUMENT',
      entityId: updated.id,
      message: `Document "${oldValues.name}" ${changes.join(' · ') || 'updated'}`,
    })
    await audit({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'document.updated',
      entity: 'Document',
      entityId: updated.id,
      oldValues,
      newValues: { name: updated.name, projectId: updated.projectId },
      impersonatedBy: ctx.session?.impersonatedBy?.id ?? null, // MA-1 #8 fix
    })

    return ok({ ...updated, uploadedByName: updated.uploadedBy?.user.name ?? null })
  })(req)
}

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

    await db.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } }) // M15-fe soft-delete

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
