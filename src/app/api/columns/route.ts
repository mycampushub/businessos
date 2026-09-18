import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { invalidateColumnCache } from '@/lib/server/columns'

const SURFACES = ['TASK', 'HIRING'] as const

type ColumnRow = {
  id: string
  surface: string
  key: string
  label: string
  order: number
  isDone: boolean
  isRejected: boolean
  color: string | null
}

function mapItem(c: ColumnRow) {
  return {
    id: c.id,
    surface: c.surface,
    key: c.key,
    label: c.label,
    order: c.order,
    isDone: c.isDone,
    isRejected: c.isRejected,
    color: c.color,
  }
}

/** HIRING columns drive the candidates board → recruit-candidates module. */
function moduleFor(surface: string): 'tasks' | 'recruit-candidates' {
  return surface === 'HIRING' ? 'recruit-candidates' : 'tasks'
}

function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'column'
}

/** key = slugified label, unique per org+surface, numeric suffix on collision. */
async function uniqueColumnKey(orgId: string, surface: string, label: string): Promise<string> {
  const base = slugify(label)
  const existing = new Set(
    (await db.boardColumn.findMany({ where: { orgId, surface }, select: { key: true } })).map((c) => c.key)
  )
  if (!existing.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!existing.has(candidate)) return candidate
  }
}

function optColor(v: unknown): string | null | 'invalid' | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return 'invalid'
  const s = v.trim()
  return s === '' ? null : s.slice(0, 20)
}

function optBool(v: unknown, fallback = false): boolean | 'invalid' | undefined {
  if (v === undefined) return undefined
  if (v === null) return fallback
  return typeof v === 'boolean' ? v : 'invalid'
}

/** GET /api/columns?surface=TASK|HIRING — { items } (order asc; tasks / recruit-candidates view). */
export const GET = withAuth(async (req, ctx) => {
  const { org } = requireOrg(ctx)
  const surface = oneOf(new URL(req.url).searchParams.get('surface') ?? 'TASK', SURFACES, 'TASK')
  const denied = requireAccess(ctx, moduleFor(surface), 'view')
  if (denied) return denied

  const rows = await db.boardColumn.findMany({
    where: { orgId: org.id, surface },
    orderBy: { order: 'asc' },
  })
  return ok({ items: rows.map(mapItem) })
})

/** POST /api/columns — {surface?, label*, color?, isDone?, isRejected?} (module full; OWNER/ADMIN/MANAGER). */
export const POST = withAuth(async (req, ctx) => {
  const { org, membership } = requireOrg(ctx)
  const b = await body<Record<string, unknown>>(req)
  const surface = oneOf(b.surface, SURFACES, 'TASK')

  const denied = requireAccess(ctx, moduleFor(surface), 'full')
  if (denied) return denied
  requireRole(ctx, ['ADMIN', 'MANAGER'])

  const label = str(b.label, 'label', { max: 40 })
  const color = optColor(b.color)
  if (color === 'invalid') return fail('color must be a string', 422)
  const isDone = optBool(b.isDone)
  if (isDone === 'invalid') return fail('isDone must be a boolean', 422)
  const isRejected = optBool(b.isRejected)
  if (isRejected === 'invalid') return fail('isRejected must be a boolean', 422)

  const key = await uniqueColumnKey(org.id, surface, label)
  const last = await db.boardColumn.findFirst({
    where: { orgId: org.id, surface },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  const col = await db.boardColumn.create({
    data: {
      orgId: org.id,
      surface,
      key,
      label,
      order: (last?.order ?? -1) + 1,
      isDone: isDone ?? false,
      isRejected: isRejected ?? false,
      color: color ?? null,
    },
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'column.created',
    entityType: 'BOARD_COLUMN',
    entityId: col.id,
    message: `${ctx.user.name} added "${label}" column to the ${surface === 'TASK' ? 'task' : 'hiring'} board`,
  })

  if (surface === 'TASK') invalidateColumnCache(org.id) // T3-d: dynamic task statuses read this cache

  return ok(mapItem(col), 201)
})
