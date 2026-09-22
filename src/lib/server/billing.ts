import { db } from '@/lib/db'
import { notifyUsers, logActivity, ApiError } from '@/lib/server/api'
import { platformAudit } from '@/app/api/platform/guard'

// ---------- SaaS platform billing (T6) ----------
// Shared by /api/platform/plans*, /api/platform/subscriptions*,
// /api/platform/orgs/[id] (plan changes) and /api/platform/overview (MRR).

export const BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

export const SUB_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const
export type SubStatus = (typeof SUB_STATUSES)[number]

/** statuses that count as a "live" (currently provisioned) subscription */
export const LIVE_SUB_STATUSES: SubStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE']

// ---------- item shapes (frozen contract for the platform console UI) ----------

export interface PlanItem {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  currency: string
  seatLimit: number
  projectLimit: number
  storageGb: number
  features: string[] | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  /** subscriptions currently on this plan (TRIALING/ACTIVE/PAST_DUE) */
  subscriptionCount: number
}

export interface SubItem {
  id: string
  orgId: string
  orgName: string
  orgSlug: string
  orgStatus: string
  planId: string
  planCode: string
  planName: string
  billingCycle: string
  status: string
  seats: number
  amountMonthly: number
  startedAt: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelledAt: string | null
  createdAt: string
}

// ---------- mappers ----------

type PlanRow = {
  id: string; code: string; name: string; description: string | null
  priceMonthly: number; priceYearly: number; currency: string
  seatLimit: number; projectLimit: number; storageGb: number
  features: string | null; isActive: boolean; sortOrder: number; createdAt: Date
}

/** decode the JSON features column → string[] (null-safe) */
export function parseFeatures(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return null
    return v.filter((x): x is string => typeof x === 'string').slice(0, 12)
  } catch {
    return null
  }
}

export function encodeFeatures(list: unknown): string | null {
  if (!Array.isArray(list)) return null
  const clean = list
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 12)
  return clean.length ? JSON.stringify(clean) : null
}

export function planItem(p: PlanRow, subscriptionCount: number): PlanItem {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly,
    currency: p.currency,
    seatLimit: p.seatLimit,
    projectLimit: p.projectLimit,
    storageGb: p.storageGb,
    features: parseFeatures(p.features),
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
    subscriptionCount,
  }
}

type SubRow = {
  id: string
  orgId: string
  org: { id: string; name: string; slug: string; status: string }
  planId: string
  plan: { id: string; code: string; name: string; priceMonthly: number; priceYearly: number }
  billingCycle: string
  status: string
  seats: number
  amountMonthly: number
  startedAt: Date
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelledAt: Date | null
  createdAt: Date
}

export const subInclude = {
  org: { select: { id: true, name: true, slug: true, status: true } },
  plan: { select: { id: true, code: true, name: true, priceMonthly: true, priceYearly: true } },
} as const

export function subItem(s: SubRow): SubItem {
  return {
    id: s.id,
    orgId: s.orgId,
    orgName: s.org.name,
    orgSlug: s.org.slug,
    orgStatus: s.org.status,
    planId: s.planId,
    planCode: s.plan.code,
    planName: s.plan.name,
    billingCycle: s.billingCycle,
    status: s.status,
    seats: s.seats,
    amountMonthly: s.amountMonthly,
    startedAt: s.startedAt.toISOString(),
    currentPeriodStart: s.currentPeriodStart.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }
}

// ---------- billing math ----------

/** normalized monthly amount for a plan + cycle (yearly price ÷ 12) */
export function monthlyAmount(priceMonthly: number, priceYearly: number, cycle: string): number {
  return cycle === 'YEARLY' ? Math.round((priceYearly / 12) * 100) / 100 : priceMonthly
}

/** next period end for a cycle (MONTHLY → +1 month, YEARLY → +1 year) */
export function nextPeriodEnd(cycle: string, from: Date = new Date()): Date {
  const d = new Date(from)
  if (cycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

/** live subscription counts per plan id (for the plans catalog) */
export async function planSubscriptionCounts(): Promise<Map<string, number>> {
  const rows = await db.subscription.groupBy({
    by: ['planId'],
    where: { status: { in: LIVE_SUB_STATUSES } },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.planId, r._count._all]))
}

/** MRR = sum of normalized monthly amounts across ACTIVE/PAST_DUE subscriptions */
export async function mrr(): Promise<number> {
  const rows = await db.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
    select: { amountMonthly: true },
  })
  return Math.round(rows.reduce((sum, r) => sum + r.amountMonthly, 0) * 100) / 100
}

// ---------- mutations (shared by routes) ----------

/** Assign a plan to an org: cancels any live subscription, creates the new one,
 *  syncs Organization.plan (denormalized display), notifies the owner, audits. */
export async function assignSubscription(opts: {
  orgId: string
  planCode: string
  billingCycle?: string
  seats?: number
  status?: 'ACTIVE' | 'TRIALING'
  trialDays?: number
  actorName: string
}): Promise<SubRow> {
  const org = await db.organization.findUnique({
    where: { id: opts.orgId },
    select: { id: true, name: true, ownerId: true, plan: true },
  })
  if (!org) throw new Error('Organization not found')

  const plan = await db.plan.findUnique({ where: { code: opts.planCode } })
  if (!plan) throw new Error('Unknown plan')
  if (!plan.isActive) throw new Error(`The ${plan.name} plan is not available for assignment`)

  const billingCycle = opts.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY'
  const seats = Math.min(Math.max(Math.round(opts.seats ?? plan.seatLimit), 1), 100000)
  const status = opts.status === 'TRIALING' ? 'TRIALING' : 'ACTIVE'

  // cancel the org's existing live subscriptions (newest assignment wins)
  await db.subscription.updateMany({
    where: { orgId: org.id, status: { in: LIVE_SUB_STATUSES } },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  })

  const now = new Date()
  const periodEnd =
    status === 'TRIALING' && opts.trialDays
      ? new Date(now.getTime() + Math.min(Math.max(Math.round(opts.trialDays), 1), 90) * 24 * 60 * 60 * 1000)
      : nextPeriodEnd(billingCycle, now)

  const created = await db.subscription.create({
    data: {
      orgId: org.id,
      planId: plan.id,
      billingCycle,
      status,
      seats,
      amountMonthly: monthlyAmount(plan.priceMonthly, plan.priceYearly, billingCycle),
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    include: subInclude,
  })

  // keep the denormalized display plan in sync
  if (org.plan !== plan.name) {
    await db.organization.update({ where: { id: org.id }, data: { plan: plan.name } })
  }

  await notifyUsers({
    orgId: org.id,
    userIds: [org.ownerId],
    type: 'SYSTEM',
    title: status === 'TRIALING' ? `Your ${plan.name} trial has started` : `Your plan changed to ${plan.name}`,
    body:
      status === 'TRIALING'
        ? `${org.name} is now trialing the ${plan.name} plan until ${periodEnd.toISOString().slice(0, 10)}.`
        : `${org.name} is now on the ${plan.name} plan (${billingCycle === 'YEARLY' ? 'yearly' : 'monthly'} billing, ${seats} seats).`,
  })
  await platformAudit({
    orgId: org.id,
    action: 'subscription.assigned',
    entity: 'Subscription',
    entityId: created.id,
    oldValues: { plan: org.plan },
    newValues: { plan: plan.name, billingCycle, seats, status },
  })
  await logActivity({
    orgId: org.id,
    actorMembershipId: null,
    action: 'subscription.assigned',
    entityType: 'SUBSCRIPTION',
    entityId: created.id,
    message: `Platform administration assigned the ${plan.name} plan to ${org.name} (${billingCycle === 'YEARLY' ? 'yearly' : 'monthly'}, ${seats} seats) — by ${opts.actorName}`,
  })

  return created as SubRow
}

// ---------- tenant plan-limit enforcement (F4) ----------

export interface OrgPlanLimits {
  seats: number
  projects: number
  storageGb: number
}

/** BillingRequest include used by both the tenant and platform list endpoints. */
export const billingRequestInclude = {
  org: { select: { id: true, name: true, slug: true } },
  plan: { select: { id: true, code: true, name: true } },
  requestedBy: { select: { user: { select: { name: true } } } },
} as const

/** BillingRequest row → client item (frozen shape shared by /api/billing and
 *  /api/platform/billing-requests — org fields only on the platform side). */
export function billingRequestItem(r: {
  id: string
  orgId: string
  planId: string
  billingCycle: string
  seats: number
  amount: number
  note: string | null
  status: string
  requestedById: string | null
  decidedAt: Date | null
  createdAt: Date
  org: { id: string; name: string; slug: string }
  plan: { id: string; code: string; name: string }
  requestedBy: { user: { name: string } } | null
}): {
  id: string
  orgId: string
  orgName: string
  planId: string
  planCode: string
  planName: string
  billingCycle: string
  seats: number
  amount: number
  note: string | null
  status: string
  requestedById: string | null
  requestedByName: string | null
  decidedAt: string | null
  createdAt: string
} {
  return {
    id: r.id,
    orgId: r.orgId,
    orgName: r.org.name,
    planId: r.planId,
    planCode: r.plan.code,
    planName: r.plan.name,
    billingCycle: r.billingCycle,
    seats: r.seats,
    amount: r.amount,
    note: r.note,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy?.user.name ?? null,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }
}

/** Free-tier defaults for orgs with no subscription row (self-serve signups). */
export const FREE_PLAN_LIMITS: OrgPlanLimits = { seats: 5, projects: 3, storageGb: 1 }

/** Effective plan limits for an org — the LATEST subscription's plan wins
 *  (any status: an EXPIRED org keeps its limits until it renews, downgrades
 *  or the platform reassigns); no subscription at all → free defaults. */
export async function getOrgPlanLimits(orgId: string): Promise<OrgPlanLimits> {
  const sub = await db.subscription.findFirst({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: { plan: { select: { seatLimit: true, projectLimit: true, storageGb: true } } },
  })
  if (!sub) return { ...FREE_PLAN_LIMITS }
  return { seats: sub.plan.seatLimit, projects: sub.plan.projectLimit, storageGb: sub.plan.storageGb }
}

/** Throws 403 when one more ACTIVE member would exceed the plan's seat limit.
 *  The message surfaces verbatim in the invite dialog toast. */
export async function assertSeatLimit(orgId: string): Promise<void> {
  const [limits, members] = await Promise.all([
    getOrgPlanLimits(orgId),
    db.membership.count({ where: { orgId, status: 'ACTIVE' } }),
  ])
  if (members + 1 > limits.seats) {
    throw new ApiError('Seat limit reached for your plan. Request an upgrade in Billing & Plan.', 403)
  }
}

/** Throws 403 when one more live project (CANCELLED/ARCHIVED excluded) would
 *  exceed the plan's project limit. */
export async function assertProjectLimit(orgId: string): Promise<void> {
  const [limits, projects] = await Promise.all([
    getOrgPlanLimits(orgId),
    db.project.count({ where: { orgId, status: { notIn: ['CANCELLED', 'ARCHIVED'] } } }),
  ])
  if (projects + 1 > limits.projects) {
    throw new ApiError('Project limit reached for your plan. Request an upgrade in Billing & Plan.', 403)
  }
}
