import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, optNum, logActivity } from '@/lib/server/api'
import { requireAccess, getAccess } from '@/lib/server/access'
import {
  MAX_UPLOAD_BYTES,
  isAllowedMimeType,
  resolveMimeType,
  assertStorageQuota,
  putObject,
  deleteObject,
} from '@/lib/server/storage'

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

/** POST /api/documents — real multipart file upload OR metadata-only registration
 *  (any org member with documents FULL). */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'documents', 'full')
  if (denied) return denied

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    return createFromUpload(req, ctx, { membership, org })
  }
  return createFromMetadata(req, ctx, { membership, org })
})

// ---------- shared field parsing ----------

async function parseProjectId(
  orgId: string,
  raw: unknown
): Promise<{ projectId: string | null; error: NextResponse | null }> {
  if (raw === null || raw === undefined || raw === '') return { projectId: null, error: null }
  const project = await db.project.findFirst({
    where: { id: String(raw), orgId },
    select: { id: true, name: true },
  })
  if (!project) return { projectId: null, error: fail('Project not found in this organization', 404) }
  return { projectId: project.id, error: null }
}

function formString(form: FormData, field: string): string | null {
  const v = form.get(field)
  return typeof v === 'string' ? v : null
}

// ---------- multipart path: store the real bytes ----------

async function createFromUpload(
  req: NextRequest,
  ctx: { user: { name: string } },
  scope: { membership: { id: string }; org: { id: string; slug: string } }
): Promise<NextResponse> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Invalid form body', 400)
  }

  const candidate = form.get('file')
  if (!candidate || typeof candidate === 'string' || typeof (candidate as File).arrayBuffer !== 'function') {
    return fail('Field "file" is required', 422)
  }
  const file = candidate as File

  if (file.size > MAX_UPLOAD_BYTES) return fail('File exceeds 25 MB', 413)

  const mimeType = resolveMimeType(file.type, file.name)
  if (!mimeType) return fail('Unsupported file type', 415)

  const rawName = formString(form, 'name')?.trim()
  const name = str(rawName || file.name, 'name', { max: 250 })

  const rawFolder = formString(form, 'folder')?.trim()
  const folder = rawFolder ? str(rawFolder, 'folder', { required: false, max: 80 }) : 'General'

  const notes = (formString(form, 'notes') ?? '').trim().slice(0, 2000)

  const { projectId, error: projectError } = await parseProjectId(scope.org.id, formString(form, 'projectId'))
  if (projectError) return projectError

  // plan quota gate BEFORE any bytes are persisted
  await assertStorageQuota(scope.org.id, file.size)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const docId = crypto.randomUUID()
  let storageKey: string
  try {
    storageKey = await putObject(scope.org.id, docId, file.name, bytes, mimeType)
  } catch (err) {
    console.error('[documents] storing upload failed', err)
    return fail('Could not store the uploaded file', 500)
  }

  let document
  try {
    document = await db.document.create({
      data: {
        id: docId,
        orgId: scope.org.id,
        projectId,
        folder,
        name,
        mimeType,
        size: bytes.byteLength,
        storageKey,
        version: 1,
        uploadedById: scope.membership.id,
      },
      include: documentInclude,
    })
  } catch (err) {
    // roll back the orphaned object so storage and the table stay in sync
    await deleteObject(storageKey)
    throw err
  }

  await logActivity({
    orgId: scope.org.id,
    actorMembershipId: scope.membership.id,
    action: 'document.uploaded',
    entityType: 'DOCUMENT',
    entityId: document.id,
    message: `${ctx.user.name} uploaded "${name}" to ${folder}${notes ? ` — ${notes}` : ''}`,
  })

  return ok({ ...document, uploadedByName: document.uploadedBy?.user.name ?? null }, 201)
}

// ---------- JSON path: metadata-only registration (backward compatible) ----------

async function createFromMetadata(
  req: NextRequest,
  ctx: { user: { name: string } },
  scope: { membership: { id: string }; org: { id: string; slug: string } }
): Promise<NextResponse> {
  const data = await body(req)

  const name = str(data.name, 'name', { max: 250 })
  const folder = data.folder ? str(data.folder, 'folder', { required: false, max: 80 }) : 'General'

  const { projectId, error: projectError } = await parseProjectId(scope.org.id, data.projectId)
  if (projectError) return projectError

  const mimeType = data.mimeType ? str(data.mimeType, 'mimeType', { required: false, max: 120 }) : null
  if (mimeType && !isAllowedMimeType(mimeType)) return fail('Unsupported file type', 415)

  const size = optNum(data.size) !== undefined ? Math.round(optNum(data.size) as number) : null
  const version = optNum(data.version) !== undefined ? Math.max(1, Math.round(optNum(data.version) as number)) : 1

  // declared size counts against the plan quota even without stored bytes
  await assertStorageQuota(scope.org.id, size ?? 0)

  const document = await db.document.create({
    data: {
      orgId: scope.org.id,
      projectId,
      folder,
      name,
      mimeType,
      size,
      version,
      uploadedById: scope.membership.id,
      // metadata-only registration — nothing is stored until a real upload
      storageKey: null,
    },
    include: documentInclude,
  })

  await logActivity({
    orgId: scope.org.id,
    actorMembershipId: scope.membership.id,
    action: 'document.registered',
    entityType: 'DOCUMENT',
    entityId: document.id,
    message: `${ctx.user.name} registered "${name}" in ${folder} (metadata only)`,
  })

  return ok({ ...document, uploadedByName: document.uploadedBy?.user.name ?? null }, 201)
}
