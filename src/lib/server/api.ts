import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, SessionInfo } from './auth'

// ---------- response helpers (uniform API contract) ----------

export function ok(data: unknown = {}, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

// ---------- auth context wrapper ----------

export interface MembershipLite {
  id: string
  userId: string
  role: string
  title: string | null
  departmentId: string | null
  orgId: string
  status: string
}

export interface AuthCtx extends SessionInfo {
  /** membership of current user in the ACTIVE org (null if user has no org) */
  membership: MembershipLite | null
  org: { id: string; name: string; slug: string; currency: string; timezone: string; ownerId: string } | null
}

class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// Canonical usage (Next 16):
//   export const GET = withAuth(async (req, ctx) => { ... })            // static route
//   export async function GET(req: NextRequest, route: { params: Promise<...> }) {
//     const { id } = await route.params
//     return withAuth(async (_req, ctx) => { ... })(req)                // dynamic route
//   }
// IMPORTANT: `withAuth` returns an async wrapper function — it does NOT return a
// Response. Always export the wrapper itself (or call it with `req`).
export function withAuth(
  handler: (req: NextRequest, ctx: AuthCtx) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const session = await getSessionUser()
      if (!session) return fail('Not authenticated', 401)

      let membership: MembershipLite | null = null
      let org: AuthCtx['org'] = null
      if (session.activeOrgId) {
        membership = await db.membership.findFirst({
          where: { userId: session.user.id, orgId: session.activeOrgId },
          select: { id: true, userId: true, role: true, title: true, departmentId: true, orgId: true, status: true },
        })
        if (membership) {
          org = await db.organization.findUnique({
            where: { id: session.activeOrgId },
            select: { id: true, name: true, slug: true, currency: true, timezone: true, ownerId: true },
          })
        }
      }
      return await handler(req, { ...session, membership, org })
    } catch (err) {
      if (err instanceof ApiError) return fail(err.message, err.status)
      console.error('[api]', err)
      const message = err instanceof Error ? err.message : 'Internal server error'
      return fail(message, 500)
    }
  }
}

/** throws ApiError if there is no active organization */
export function requireOrg(ctx: AuthCtx): { membership: MembershipLite; org: NonNullable<AuthCtx['org']> } {
  if (!ctx.membership || !ctx.org) throw new ApiError('No active organization', 403)
  return { membership: ctx.membership, org: ctx.org }
}

const MGMT_ROLES = ['OWNER', 'ADMIN']
export function isManagement(ctx: AuthCtx): boolean {
  return !!ctx.membership && MGMT_ROLES.includes(ctx.membership.role)
}

/** throws unless role is in the allowed set (OWNER always allowed) */
export function requireRole(ctx: AuthCtx, roles: string[]) {
  const { membership } = requireOrg(ctx)
  if (membership.role === 'OWNER') return membership
  if (!roles.includes(membership.role)) throw new ApiError('Insufficient permissions', 403)
  return membership
}

// ---------- body parsing ----------

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError('Invalid JSON body', 400)
  }
}

export function str(v: unknown, field: string, opts: { required?: boolean; max?: number } = {}): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (opts.required !== false && !s) throw new ApiError(`Field "${field}" is required`, 422)
  if (opts.max && s.length > opts.max) return s.slice(0, opts.max)
  return s
}

export function num(v: unknown, field: string, opts: { required?: boolean; min?: number; max?: number } = {}): number {
  if (v === undefined || v === null || v === '') {
    if (opts.required === false) return 0
    throw new ApiError(`Field "${field}" is required`, 422)
  }
  const n = Number(v)
  if (Number.isNaN(n)) throw new ApiError(`Field "${field}" must be a number`, 422)
  if (opts.min !== undefined && n < opts.min) return opts.min
  if (opts.max !== undefined && n > opts.max) return opts.max
  return n
}

export function optNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

export function optDate(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback?: T): T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T
  if (fallback !== undefined) return fallback
  throw new ApiError(`Must be one of: ${allowed.join(', ')}`, 422)
}

// ---------- activity / notifications / audit ----------

export async function logActivity(opts: {
  orgId: string
  actorMembershipId?: string | null
  action: string // e.g. "task.created"
  entityType: string
  entityId?: string | null
  message: string
}) {
  await db.activityLog
    .create({
      data: {
        orgId: opts.orgId,
        actorMembershipId: opts.actorMembershipId ?? null,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId ?? null,
        message: opts.message,
      },
    })
    .catch((e) => console.error('[activity]', e))
}

export async function notifyUsers(opts: {
  orgId: string
  userIds: string[]
  type?: string
  title: string
  body?: string
  module?: string
}) {
  const ids = [...new Set(opts.userIds.filter(Boolean))]
  if (!ids.length) return
  await db.notification
    .createMany({
      data: ids.map((userId) => ({
        orgId: opts.orgId,
        userId,
        type: opts.type ?? 'SYSTEM',
        title: opts.title,
        body: opts.body ?? null,
        module: opts.module ?? null,
      })),
    })
    .catch((e) => console.error('[notify]', e))
}

export async function audit(opts: {
  orgId: string
  actorMembershipId?: string | null
  action: string
  entity: string
  entityId?: string
  oldValues?: unknown
  newValues?: unknown
}) {
  await db.auditLog
    .create({
      data: {
        orgId: opts.orgId,
        actorMembershipId: opts.actorMembershipId ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        oldValues: opts.oldValues ? JSON.stringify(opts.oldValues) : null,
        newValues: opts.newValues ? JSON.stringify(opts.newValues) : null,
      },
    })
    .catch((e) => console.error('[audit]', e))
}

/** userIds of all managers+admins in an org (for approvals etc.) */
export async function managerUserIds(orgId: string): Promise<string[]> {
  const rows = await db.membership.findMany({
    where: { orgId, role: { in: ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE'] } },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}
