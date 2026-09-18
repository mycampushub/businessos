import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail } from '@/lib/server/api'
import type { AuthCtx } from '@/lib/server/api'

// ---------- T3 RBAC: module access matrix ----------
// Contract (worklog "T3 FROZEN CONTRACTS"):
//   type AccessLevel = 'FULL' | 'VIEW' | 'HIDDEN'
//   getAccessMap(orgId, role) — 60s in-memory cache, OWNER → all FULL, ModuleAccess rows override defaults
//   getAccess(ctx) — access map for the ctx's active org+role ({} when no active org)
//   requireAccess(ctx, module, 'view'|'full') — sync guard reading ctx.access (attached by getSessionUser)
//   accessForUser(user, membership) — attaches the map to SessionInfo

export type AccessLevel = 'FULL' | 'VIEW' | 'HIDDEN'

const ACCESS_LEVELS = ['FULL', 'VIEW', 'HIDDEN'] as const

export const ACCESS_MODULES = [
  'dashboard',
  'reports',
  'projects',
  'tasks',
  'crm-leads',
  'crm-deals',
  'crm-contacts',
  'hr-employees',
  'hr-attendance',
  'hr-leave',
  'org-structure',
  'recruit-jobs',
  'recruit-candidates',
  'finance-invoices',
  'finance-expenses',
  'finance-payroll',
  'documents',
  'announcements',
  'meetings',
] as const

export type AccessModule = (typeof ACCESS_MODULES)[number]

/** Roles whose access can be edited in the matrix (OWNER is locked to FULL everywhere). */
export const EDITABLE_ROLES = ['ADMIN', 'MANAGER', 'HR', 'FINANCE', 'EMPLOYEE', 'CONTRACTOR', 'INTERN'] as const
export type EditableRole = (typeof EDITABLE_ROLES)[number]

export function isAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === 'string' && (ACCESS_LEVELS as readonly string[]).includes(v)
}

export function isAccessModule(v: unknown): v is AccessModule {
  return typeof v === 'string' && (ACCESS_MODULES as readonly string[]).includes(v)
}

export function isEditableRole(v: unknown): v is EditableRole {
  return typeof v === 'string' && (EDITABLE_ROLES as readonly string[]).includes(v)
}

const allFull = (): Record<string, AccessLevel> =>
  Object.fromEntries(ACCESS_MODULES.map((m) => [m as string, 'FULL' as AccessLevel]))

const allHidden = (): Record<string, AccessLevel> =>
  Object.fromEntries(ACCESS_MODULES.map((m) => [m as string, 'HIDDEN' as AccessLevel]))

/** EMPLOYEE baseline — CONTRACTOR and INTERN default to the same map. */
const EMPLOYEE_DEFAULT: Record<string, AccessLevel> = {
  dashboard: 'HIDDEN',
  reports: 'HIDDEN',
  projects: 'VIEW',
  tasks: 'VIEW',
  'crm-leads': 'HIDDEN',
  'crm-deals': 'HIDDEN',
  'crm-contacts': 'HIDDEN',
  'hr-employees': 'VIEW',
  'hr-attendance': 'HIDDEN',
  'hr-leave': 'FULL',
  'org-structure': 'VIEW',
  'recruit-jobs': 'HIDDEN',
  'recruit-candidates': 'HIDDEN',
  'finance-invoices': 'HIDDEN',
  'finance-expenses': 'HIDDEN',
  'finance-payroll': 'HIDDEN',
  documents: 'VIEW',
  announcements: 'VIEW',
  meetings: 'VIEW',
}

/**
 * Default access matrix (used when no ModuleAccess row exists for org+module+role).
 * OWNER is not listed — always FULL everywhere, locked.
 */
export const DEFAULT_ACCESS: Record<string, Record<string, AccessLevel>> = {
  ADMIN: allFull(),
  MANAGER: {
    ...allFull(),
    'hr-employees': 'VIEW',
    'hr-attendance': 'VIEW',
    'org-structure': 'VIEW',
    'finance-invoices': 'VIEW',
    'finance-expenses': 'VIEW',
    'finance-payroll': 'VIEW',
  },
  HR: {
    ...allFull(),
    reports: 'VIEW',
    projects: 'VIEW',
    tasks: 'VIEW',
    'crm-leads': 'VIEW',
    'crm-deals': 'VIEW',
    'crm-contacts': 'VIEW',
    'finance-invoices': 'VIEW',
    'finance-expenses': 'VIEW',
    'finance-payroll': 'VIEW',
    meetings: 'FULL',
  },
  FINANCE: {
    ...allFull(),
    projects: 'VIEW',
    tasks: 'VIEW',
    'crm-leads': 'VIEW',
    'crm-deals': 'VIEW',
    'crm-contacts': 'VIEW',
    'hr-employees': 'VIEW',
    'hr-attendance': 'HIDDEN',
    'hr-leave': 'VIEW',
    'org-structure': 'VIEW',
    'recruit-jobs': 'HIDDEN',
    'recruit-candidates': 'HIDDEN',
    documents: 'VIEW',
    meetings: 'VIEW',
  },
  EMPLOYEE: EMPLOYEE_DEFAULT,
  CONTRACTOR: { ...EMPLOYEE_DEFAULT },
  INTERN: { ...EMPLOYEE_DEFAULT },
}

// ---------- 60s in-memory cache (per orgId+role) ----------

const CACHE_TTL_MS = 60_000
const accessCache = new Map<string, { map: Record<string, AccessLevel>; expires: number }>()

/** Drops all cached access maps for an org (call after ModuleAccess writes). */
export function invalidateAccessCache(orgId: string): void {
  const prefix = `${orgId}:`
  for (const key of accessCache.keys()) {
    if (key.startsWith(prefix)) accessCache.delete(key)
  }
}

/** Effective access map for a role in an org: ModuleAccess rows over DEFAULT_ACCESS. OWNER → all FULL. */
export async function getAccessMap(orgId: string, role: string): Promise<Record<string, AccessLevel>> {
  if (role === 'OWNER') return allFull()
  const cacheKey = `${orgId}:${role}`
  const hit = accessCache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return hit.map

  const rows = await db.moduleAccess.findMany({
    where: { orgId, role },
    select: { module: true, level: true },
  })
  const map: Record<string, AccessLevel> = { ...(DEFAULT_ACCESS[role] ?? allHidden()) }
  for (const row of rows) map[row.module] = isAccessLevel(row.level) ? row.level : 'HIDDEN'
  accessCache.set(cacheKey, { map, expires: Date.now() + CACHE_TTL_MS })
  return map
}

/** Access map for the ctx's active org+role. No active org → {} (org-less ctx handled gracefully). */
export async function getAccess(ctx: AuthCtx): Promise<Record<string, AccessLevel>> {
  if (!ctx.org || !ctx.membership) return {}
  return getAccessMap(ctx.org.id, ctx.membership.role)
}

/**
 * Sync route guard — reads ctx.access (attached to SessionInfo by getSessionUser).
 * Returns a NextResponse (fail) when denied, or null when allowed:
 *   const denied = requireAccess(ctx, 'tasks', 'view'); if (denied) return denied
 * view: VIEW|FULL pass, HIDDEN → 403 'You do not have access to this module'
 * full: FULL required, VIEW → 403 'You only have view access to this module'
 */
export function requireAccess(ctx: AuthCtx, module: string, need: 'view' | 'full'): NextResponse | null {
  let level: AccessLevel | undefined
  if (ctx.membership?.role === 'OWNER') {
    level = 'FULL' // OWNER is locked to FULL everywhere
  } else if (ctx.access && typeof ctx.access[module] === 'string') {
    level = ctx.access[module]
  } else if (ctx.membership) {
    level = DEFAULT_ACCESS[ctx.membership.role]?.[module]
  }
  if (level !== 'FULL' && level !== 'VIEW' && level !== 'HIDDEN') level = 'HIDDEN'

  if (need === 'full') {
    if (level === 'FULL') return null
    if (level === 'VIEW') return fail('You only have view access to this module', 403)
    return fail('You do not have access to this module', 403)
  }
  if (level === 'FULL' || level === 'VIEW') return null
  return fail('You do not have access to this module', 403)
}

/** Attaches the access map to SessionInfo: map for the active org's membership, {} when none. */
export async function accessForUser(
  user: { id: string },
  membership: { orgId: string; role: string } | null
): Promise<Record<string, AccessLevel>> {
  if (!membership) return {}
  return getAccessMap(membership.orgId, membership.role)
}
