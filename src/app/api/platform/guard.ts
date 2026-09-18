import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, type AuthCtx } from '@/lib/server/api'

// Shared helpers for /api/platform/** routes (SaaS platform administration console).
// Platform routes NEVER call requireOrg — the SaaS admin is org-less by design.

/** 403 unless the caller is a SaaS platform administrator. */
export function requirePlatform(ctx: AuthCtx): NextResponse | null {
  if (!ctx.user?.platformAdmin) return fail('Platform administrator access required', 403)
  return null
}

export const PLANS = ['Free', 'Starter', 'Growth', 'Business', 'Enterprise'] as const
export const PLAN_SET = new Set<string>(PLANS)

// ---------- platform audit rows ----------
// Platform mutations write audit rows via db.auditLog.create directly (the audit() helper
// is org-scoped): orgId = the AFFECTED org's id, actorMembershipId = null (no membership).
// When the affected entity has NO org (e.g. an org-less user), the row is skipped —
// AuditLog.orgId is required and inventing an org id would leak — and the action is
// logged to the console instead (documented in worklog T4-b).

export async function platformAudit(opts: {
  orgId: string | null
  action: string
  entity: string
  entityId?: string | null
  oldValues?: unknown
  newValues?: unknown
}): Promise<void> {
  if (!opts.orgId) {
    console.log(`[platform-audit] (no org) ${opts.action} ${opts.entity} ${opts.entityId ?? ''}`)
    return
  }
  await db.auditLog
    .create({
      data: {
        orgId: opts.orgId,
        actorMembershipId: null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        oldValues: opts.oldValues === undefined ? null : JSON.stringify(opts.oldValues),
        newValues: opts.newValues === undefined ? null : JSON.stringify(opts.newValues),
      },
    })
    .catch((e) => console.error('[platform-audit]', e))
}

// ---------- user item shape (GET/PATCH /api/platform/users*) ----------

export type UserRow = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  status: string
  platformAdmin: boolean
  createdAt: Date
  memberships: Array<{ status: string; orgId: string; org: { name: string } }>
}

/** list item: { id, name, email, avatarUrl, status, platformAdmin, createdAt, orgCount, orgNames } */
export function userItem(u: UserRow): {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  status: string
  platformAdmin: boolean
  createdAt: Date
  orgCount: number
  orgNames: string[]
} {
  const active = u.memberships.filter((m) => m.status !== 'ALUMNI')
  const orgNames = active.slice(0, 3).map((m) => m.org.name)
  if (active.length > 3) orgNames.push(`+${active.length - 3}`)
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    status: u.status,
    platformAdmin: u.platformAdmin,
    createdAt: u.createdAt,
    orgCount: active.length,
    orgNames,
  }
}

// ---------- organization item shape (GET/PATCH /api/platform/orgs*) ----------

export type OrgRow = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  industry: string | null
  plan: string
  status: string
  currency: string
  createdAt: Date
  ownerId: string
}

/** list item: { id, name, slug, logoUrl, industry, plan, status, currency, createdAt, ownerName, memberCount, projectCount, jobCount } */
export async function orgItem(o: OrgRow): Promise<{
  id: string
  name: string
  slug: string
  logoUrl: string | null
  industry: string | null
  plan: string
  status: string
  currency: string
  createdAt: Date
  ownerName: string | null
  memberCount: number
  projectCount: number
  jobCount: number
}> {
  const [owner, memberCount, projectCount, jobCount] = await Promise.all([
    db.user.findUnique({ where: { id: o.ownerId }, select: { name: true } }),
    db.membership.count({ where: { orgId: o.id, status: { not: 'ALUMNI' } } }),
    db.project.count({ where: { orgId: o.id } }),
    db.job.count({ where: { orgId: o.id } }),
  ])
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    logoUrl: o.logoUrl,
    industry: o.industry,
    plan: o.plan,
    status: o.status,
    currency: o.currency,
    createdAt: o.createdAt,
    ownerName: owner?.name ?? null,
    memberCount,
    projectCount,
    jobCount,
  }
}
