import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str, withAuth, requireOrg, requireRole, logActivity } from '@/lib/server/api'
import { setActiveOrgCookie } from '@/lib/server/auth'
import { assignSubscription } from '@/lib/server/billing'

// Server-side copy of the template map (mirrors ORG_TEMPLATES in components/app/onboarding.tsx)
const ORG_TEMPLATES: Record<string, string[]> = {
  'digital-agency': ['Management', 'Design', 'Technology', 'Marketing', 'Sales', 'Finance'],
  software: ['Management', 'Engineering', 'QA', 'Product', 'Marketing', 'Finance'],
  marketing: ['Management', 'Creative', 'Content', 'Performance Marketing', 'Client Services'],
  consulting: ['Management', 'Consulting', 'Research', 'Operations'],
  general: ['Management', 'Operations', 'Finance', 'HR'],
}

const PIPELINE_STAGES: Array<{ name: string; order: number }> = [
  { name: 'New', order: 0 },
  { name: 'Qualified', order: 1 },
  { name: 'Meeting', order: 2 },
  { name: 'Proposal', order: 3 },
  { name: 'Negotiation', order: 4 },
]

const LEAVE_TYPES: Array<{ name: string; daysPerYear: number; color: string }> = [
  { name: 'Casual Leave', daysPerYear: 10, color: '#10b981' },
  { name: 'Sick Leave', daysPerYear: 14, color: '#f43f5e' },
  { name: 'Annual Leave', daysPerYear: 20, color: '#14b8a6' },
]

function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'org'
}

function randomSuffix(len = 4): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  for (let attempt = 0; attempt < 6; attempt++) {
    const taken = await db.organization.findUnique({ where: { slug }, select: { id: true } })
    if (!taken) return slug
    slug = `${base}-${randomSuffix(4)}`
  }
  return `${base}-${Date.now().toString(36)}`
}

/** GET /api/orgs — current user's memberships. */
export async function GET(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    return ok({ memberships: ctx.memberships })
  })(req)
}

/** PATCH /api/orgs — update the active organization profile (OWNER/ADMIN). */
export async function PATCH(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const actor = requireRole(ctx, ['ADMIN']) // OWNER is always allowed by requireRole
    const { org } = requireOrg(ctx)
    const data = await body<Record<string, unknown>>(req)

    // Only fields PRESENT in the body are updated (partial PATCH semantics).
    const updates: {
      name?: string
      description?: string | null
      industry?: string | null
      orgType?: string | null
      website?: string | null
      country?: string | null
      currency?: string
      timezone?: string
    } = {}

    if (data.name !== undefined) updates.name = str(data.name, 'name', { max: 100 })
    if (data.currency !== undefined) updates.currency = str(data.currency, 'currency', { max: 8 })
    if (data.timezone !== undefined) updates.timezone = str(data.timezone, 'timezone', { max: 60 })

    const optionalText: Array<{ key: 'description' | 'industry' | 'orgType' | 'website' | 'country'; max: number }> = [
      { key: 'description', max: 500 },
      { key: 'industry', max: 100 },
      { key: 'orgType', max: 60 },
      { key: 'website', max: 200 },
      { key: 'country', max: 60 },
    ]
    for (const { key, max } of optionalText) {
      if (data[key] === undefined) continue
      // empty string clears the field
      updates[key] = str(data[key], key, { required: false, max }) || null
    }

    if (Object.keys(updates).length === 0) return fail('No changes provided', 422)

    const updated = await db.organization.update({
      where: { id: org.id },
      data: updates,
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'org.updated',
      entityType: 'ORG',
      entityId: org.id,
      message: `${ctx.user.name} updated organization settings${
        updates.name && updates.name !== org.name ? ` (renamed to "${updates.name}")` : ''
      }`,
    })

    return ok({ org: updated })
  })(req)
}

/** POST /api/orgs — create organization (with template defaults) + OWNER membership. */
export async function POST(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const data = await body<Record<string, unknown>>(req)
    const name = str(data.name, 'name', { max: 100 })
    const industry = str(data.industry, 'industry', { required: false, max: 100 })
    const orgType = str(data.orgType, 'orgType', { required: false, max: 60 })
    const country = str(data.country, 'country', { required: false, max: 60 })
    const currency = str(data.currency, 'currency', { required: false, max: 8 }) || 'BDT'
    const description = str(data.description, 'description', { required: false, max: 500 })
    const template =
      typeof data.template === 'string' && ORG_TEMPLATES[data.template] ? data.template : 'general'

    const slug = await uniqueSlug(slugify(name))

    const org = await db.organization.create({
      data: {
        name,
        slug,
        industry: industry || null,
        orgType: orgType || null,
        country: country || null,
        currency,
        description: description || null,
        plan: 'FREE', // MA-1 #7 fix: use UPPERCASE Plan.code (was Title Case 'Free')
        ownerId: ctx.user.id,
      },
    })

    const membership = await db.membership.create({
      data: {
        userId: ctx.user.id,
        orgId: org.id,
        role: 'OWNER',
        title: 'Founder',
      },
    })

    await db.department.createMany({
      data: ORG_TEMPLATES[template].map((dept) => ({ orgId: org.id, name: dept })),
    })
    await db.pipelineStage.createMany({
      data: PIPELINE_STAGES.map((s) => ({ orgId: org.id, name: s.name, order: s.order })),
    })
    await db.leaveType.createMany({
      data: LEAVE_TYPES.map((lt) => ({ orgId: org.id, name: lt.name, daysPerYear: lt.daysPerYear, color: lt.color })),
    })

    await setActiveOrgCookie(org.id)
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'org.created',
      entityType: 'ORG',
      entityId: org.id,
      message: `Organization "${org.name}" created`,
    })

    // ---- 14-day trial on the best available paid plan (F4) ----
    // GROWTH first, else STARTER, else the first active plan. Billing must NEVER
    // break org creation — the whole block is best-effort.
    try {
      const candidates = await db.plan.findMany({
        where: { isActive: true, code: { not: 'FREE' } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { code: true, seatLimit: true },
      })
      const trialPlan =
        candidates.find((p) => p.code === 'GROWTH') ?? candidates.find((p) => p.code === 'STARTER') ?? candidates[0]
      if (trialPlan) {
        const sub = await assignSubscription({
          orgId: org.id,
          planCode: trialPlan.code,
          billingCycle: 'MONTHLY',
          seats: Math.min(5, trialPlan.seatLimit),
          status: 'TRIALING',
          trialDays: 14,
          actorName: ctx.user.name,
        })
        // the trial itself is free — zero out the normalized monthly amount
        if (sub.amountMonthly !== 0) {
          await db.subscription.update({ where: { id: sub.id }, data: { amountMonthly: 0 } })
        }
      }
    } catch (err) {
      console.error('[org-trial]', err)
    }

    return ok({ org, membership })
  })(req)
}
