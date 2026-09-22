import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { requirePlatform, PLANS } from '../guard'
import { mrr } from '@/lib/server/billing'

// Local YYYY-MM-DD helper (the sandbox runs in one timezone; matches the attendance convention)
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// GET /api/platform/overview — cross-org KPI console for the SaaS admin
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const [
    users,
    activeUsers,
    suspendedUsers,
    orgs,
    activeOrgs,
    suspendedOrgs,
    openJobs,
    totalJobs,
    projects,
    tasks,
    documents,
    storage,
    meetings,
    activeSessions,
    planGroups,
    recentUsers,
    recentAudit,
    newUsers,
    activeSubs,
    trialingSubs,
    revenue,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.user.count({ where: { status: 'SUSPENDED' } }),
    db.organization.count(),
    db.organization.count({ where: { status: 'ACTIVE' } }),
    db.organization.count({ where: { status: 'SUSPENDED' } }),
    db.job.count({ where: { status: 'OPEN' } }),
    db.job.count(),
    db.project.count(),
    db.task.count(),
    db.document.count(),
    db.document.aggregate({ _sum: { size: true } }),
    db.meeting.count(),
    // T5: live sessions (unexpired) — the "Active now" console KPI
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
    db.organization.groupBy({ by: ['plan'], _count: { _all: true } }),
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, avatarUrl: true, status: true, platformAdmin: true, createdAt: true },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        action: true,
        org: { select: { name: true } },
        actor: { select: { user: { select: { name: true } } } },
      },
    }),
    // users created within the last 14 local days (for the zero-filled signup trend)
    db.user.findMany({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0) - 13 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true },
    }),
    // T6: billing KPIs — live subscriptions + normalized monthly revenue
    db.subscription.count({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } } }),
    db.subscription.count({ where: { status: 'TRIALING' } }),
    mrr(),
  ])

  const planCount = new Map(planGroups.map((g) => [g.plan, g._count._all]))
  const plans = PLANS.map((plan) => ({ plan, count: planCount.get(plan) ?? 0 }))

  // signup trend — last 14 days INCLUDING zero-count days, ascending local dates
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days: Array<{ date: string; count: number }> = []
  const index = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const key = localDate(new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() - i))
    index.set(key, days.length)
    days.push({ date: key, count: 0 })
  }
  for (const u of newUsers) {
    const idx = index.get(localDate(u.createdAt))
    if (idx !== undefined) days[idx].count++
  }

  return ok({
    kpis: {
      users,
      activeUsers,
      suspendedUsers,
      orgs,
      activeOrgs,
      suspendedOrgs,
      openJobs,
      totalJobs,
      projects,
      tasks,
      documents,
      storageBytes: storage._sum.size ?? 0,
      meetings,
      activeSessions,
      activeSubscriptions: activeSubs,
      trialingSubscriptions: trialingSubs,
      mrr: revenue,
      arr: Math.round(revenue * 12 * 100) / 100,
    },
    plans,
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      status: u.status,
      platformAdmin: u.platformAdmin,
      createdAt: u.createdAt,
    })),
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      action: a.action,
      orgName: a.org?.name ?? null,
      actorName: a.actor?.user.name ?? null,
    })),
    signupTrend: days,
  })
})
