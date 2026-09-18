import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, logActivity } from '@/lib/server/api'
import {
  ACCESS_MODULES,
  DEFAULT_ACCESS,
  EDITABLE_ROLES,
  invalidateAccessCache,
  isAccessLevel,
  isAccessModule,
  isEditableRole,
} from '@/lib/server/access'

type MatrixItem = { module: string; role: string; level: string }

/** Full effective matrix for an org (one query): OWNER rows locked FULL + rows ?? defaults. */
async function matrixItems(orgId: string): Promise<MatrixItem[]> {
  const rows = await db.moduleAccess.findMany({
    where: { orgId },
    select: { module: true, role: true, level: true },
  })
  const overrides = new Map(rows.map((r) => [`${r.module}:${r.role}`, r.level]))
  const items: MatrixItem[] = []
  for (const mod of ACCESS_MODULES) {
    for (const role of ['OWNER', ...EDITABLE_ROLES]) {
      const level =
        role === 'OWNER'
          ? 'FULL'
          : overrides.get(`${mod}:${role}`) ?? DEFAULT_ACCESS[role]?.[mod] ?? 'HIDDEN'
      items.push({ module: mod, role, level })
    }
  }
  return items
}

/** GET /api/settings/access — full access matrix (OWNER/ADMIN). */
export const GET = withAuth(async (_req, ctx) => {
  const { org } = requireOrg(ctx)
  requireRole(ctx, ['ADMIN'])
  return ok({ items: await matrixItems(org.id) })
})

/** PUT /api/settings/access — { changes: [{module, role, level}] } (OWNER/ADMIN; role OWNER ignored). */
export const PUT = withAuth(async (req, ctx) => {
  const { org, membership } = requireOrg(ctx)
  requireRole(ctx, ['ADMIN'])

  const b = await body<{ changes?: unknown }>(req)
  if (!Array.isArray(b.changes)) return fail('Field "changes" is required', 422)

  // Validate everything BEFORE applying anything (atomic).
  const updates: Array<{ module: string; role: string; level: string }> = []
  for (const raw of b.changes) {
    if (typeof raw !== 'object' || raw === null) return fail('Invalid change entry', 422)
    const c = raw as Record<string, unknown>
    if (!isAccessModule(c.module)) return fail('Invalid module', 422)
    if (c.role === 'OWNER') continue // OWNER rows are ignored (locked FULL)
    if (!isEditableRole(c.role)) return fail('Invalid role', 422)
    if (!isAccessLevel(c.level)) return fail('Invalid level', 422)
    updates.push({ module: c.module, role: c.role, level: c.level })
  }

  for (const u of updates) {
    await db.moduleAccess.upsert({
      where: { orgId_module_role: { orgId: org.id, module: u.module, role: u.role } },
      update: { level: u.level },
      create: { orgId: org.id, module: u.module, role: u.role, level: u.level },
    })
  }
  invalidateAccessCache(org.id)

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'settings.access_updated',
    entityType: 'SETTINGS',
    entityId: null,
    message: `${ctx.user.name} updated the role access matrix (${updates.length} change${updates.length === 1 ? '' : 's'})`,
  })

  return ok({ items: await matrixItems(org.id) })
})
