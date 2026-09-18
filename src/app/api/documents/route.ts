import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, optNum, logActivity } from '@/lib/server/api'
import { requireAccess, getAccess } from '@/lib/server/access'

const documentInclude = {
  project: { select: { id: true, name: true, color: true } },
  uploadedBy: { select: { id: true, role: true, title: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
} as const

/** GET /api/documents — list org documents (optional ?projectId=, ?folder=).
 *  Assignment scoping: documents FULL → all org documents; otherwise only rows with no
 *  project OR attached to a project the caller manages / is a ProjectMember of. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'documents', 'view')
  if (denied) return denied
  const url = new URL(req.url)

  const projectId = url.searchParams.get('projectId')?.trim() || undefined
  const folder = url.searchParams.get('folder')?.trim() || undefined

  const access = await getAccess(ctx)
  const full = membership.role === 'OWNER' || access['documents'] === 'FULL'

  // non-FULL callers: projectId null OR one of MY projects (manager OR projectMember)
  const scope: Prisma.DocumentWhereInput = full
    ? {}
    : {
        OR: [
          { projectId: null },
          {
            projectId: {
              in: (
                await db.project.findMany({
                  where: {
                    orgId: org.id,
                    OR: [
                      { managerMembershipId: membership.id },
                      { projectMembers: { some: { membershipId: membership.id } } },
                    ],
                  },
                  select: { id: true },
                })
              ).map((p) => p.id),
            },
          },
        ],
      }

  const where: Prisma.DocumentWhereInput = { orgId: org.id, ...scope }
  if (projectId) where.projectId = projectId
  if (folder) where.folder = folder

  const [documents, folderRows] = await Promise.all([
    db.document.findMany({ where, include: documentInclude, orderBy: [{ folder: 'asc' }, { name: 'asc' }] }),
    db.document.findMany({ where: { orgId: org.id, ...scope }, select: { folder: true }, distinct: ['folder'] }),
  ])

  const items = documents.map((d) => ({ ...d, uploadedByName: d.uploadedBy?.user.name ?? null }))
  const folders = folderRows.map((f) => f.folder).sort((a, b) => a.localeCompare(b))

  return ok({ items, folders })
})

/** POST /api/documents — register document metadata (any org member with documents FULL) */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'documents', 'full')
  if (denied) return denied
  const data = await body(req)

  const name = str(data.name, 'name', { max: 250 })
  const folder = data.folder ? str(data.folder, 'folder', { required: false, max: 80 }) : 'General'

  let projectId: string | null = null
  if (data.projectId) {
    const project = await db.project.findFirst({
      where: { id: String(data.projectId), orgId: org.id },
      select: { id: true, name: true },
    })
    if (!project) return fail('Project not found in this organization', 404)
    projectId = project.id
  }

  const mimeType = data.mimeType ? str(data.mimeType, 'mimeType', { required: false, max: 120 }) : null
  const size = optNum(data.size) !== undefined ? Math.round(optNum(data.size) as number) : null
  const version = optNum(data.version) !== undefined ? Math.max(1, Math.round(optNum(data.version) as number)) : 1

  const document = await db.document.create({
    data: {
      orgId: org.id,
      projectId,
      folder,
      name,
      mimeType,
      size,
      version,
      uploadedById: membership.id,
      // production: R2 object key — sandbox stores metadata only
      storageKey: `local:${org.slug}/${folder}/${name}`,
    },
    include: documentInclude,
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'document.uploaded',
    entityType: 'DOCUMENT',
    entityId: document.id,
    message: `${ctx.user.name} uploaded "${name}" to ${folder}`,
  })

  return ok({ ...document, uploadedByName: document.uploadedBy?.user.name ?? null }, 201)
})
