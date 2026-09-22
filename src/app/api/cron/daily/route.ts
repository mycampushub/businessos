import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, notifyUsers, logActivity, managerUserIds, invalidateSubscriptionCache } from '@/lib/server/api'

/**
 * POST /api/cron/daily — platform maintenance sweep (Cloudflare Cron Trigger).
 *
 * Authenticated with a shared secret:
 *   Authorization: Bearer <CRON_SECRET>
 * (set via `wrangler secret put CRON_SECRET`; the trigger worker lives in
 *  cloudflare/cron-worker.ts — see cloudflare/README.md).
 *
 * Sweeps:
 *   1. Invoices  — SENT/VIEWED/PARTIALLY_PAID past due → OVERDUE (+notify finance)
 *   2. Subscriptions — dunning ladder with a 7-day grace period:
 *        ACTIVE past period end      → PAST_DUE  (+notify owner to renew)
 *        PAST_DUE past end + 7 days  → EXPIRED   (+notify owner; org read-only via api.ts)
 *        CANCELLED past period end   → EXPIRED
 *        TRIALING past period end    → PAST_DUE  (+notify owner the trial ended)
 *   3. Leave      — PENDING requests starting within 3 days → remind approvers
 *   4. Tasks      — open tasks due within 24h → remind assignees
 *   5. Sessions   — purge expired session rows
 */

function tokenMatches(provided: string): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed when no secret is configured
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !tokenMatches(token)) {
    return fail('Unauthorized cron invocation', 401)
  }

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // ---------- 1. overdue invoices ----------
  const overdueInvoices = await db.invoice.findMany({
    where: { status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID'] }, dueDate: { lt: startOfToday } },
    select: { id: true, orgId: true, number: true, total: true, dueDate: true, client: { select: { name: true } } },
  })
  for (const invoice of overdueInvoices) {
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'OVERDUE' } }).catch(() => {})
  }
  // notify each affected org's management/finance users (one digest per org)
  const invoiceByOrg = new Map<string, typeof overdueInvoices>()
  for (const inv of overdueInvoices) {
    const list = invoiceByOrg.get(inv.orgId) ?? []
    list.push(inv)
    invoiceByOrg.set(inv.orgId, list)
  }
  for (const [orgId, list] of invoiceByOrg) {
    const userIds = await managerUserIds(orgId)
    const total = list.reduce((sum, i) => sum + i.total, 0)
    await notifyUsers({
      orgId,
      userIds,
      type: 'SYSTEM',
      module: 'FINANCE',
      title: list.length === 1 ? `Invoice ${list[0].number} is overdue` : `${list.length} invoices are overdue`,
      body:
        list.length === 1
          ? `Invoice ${list[0].number} (${list[0].client.name}, ${list[0].total.toFixed(2)}) passed its due date.`
          : `Invoices past due: ${list.map((i) => i.number).join(', ')}. Total outstanding: ${total.toFixed(2)}.`,
    })
    await logActivity({
      orgId,
      action: 'invoice.overdue',
      entityType: 'INVOICE',
      message: `${list.length} invoice(s) marked overdue by the daily sweep`,
    })
  }

  // ---------- 2. subscription dunning ladder (7-day grace period) ----------
  // ACTIVE past period end → PAST_DUE (still fully usable; owner is nudged to renew)
  const pastDueSubs = await db.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
    select: { id: true, orgId: true, plan: { select: { name: true } } },
  })
  for (const sub of pastDueSubs) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } }).catch(() => {})
    const org = await db.organization.findUnique({ where: { id: sub.orgId }, select: { ownerId: true, name: true } })
    if (org) {
      await notifyUsers({
        orgId: sub.orgId,
        userIds: [org.ownerId],
        type: 'SYSTEM',
        title: 'Your subscription is past due',
        body: `The ${sub.plan.name} subscription for ${org.name} passed its period end. Renew from Billing & Plan within 7 days to keep the workspace fully active.`,
      })
    }
  }

  // PAST_DUE past end + 7 days → EXPIRED (org becomes read-only via the api.ts write-gate)
  const expiredSubs = await db.subscription.findMany({
    where: { status: 'PAST_DUE', currentPeriodEnd: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    select: { id: true, orgId: true, plan: { select: { name: true } } },
  })
  for (const sub of expiredSubs) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } }).catch(() => {})
    const org = await db.organization.findUnique({ where: { id: sub.orgId }, select: { ownerId: true, name: true } })
    if (org) {
      await notifyUsers({
        orgId: sub.orgId,
        userIds: [org.ownerId],
        type: 'SYSTEM',
        title: 'Your subscription has expired',
        body: `The ${sub.plan.name} subscription for ${org.name} expired after its grace period — the workspace is now read-only. Renew from Billing & Plan to restore full access.`,
      })
    }
  }

  // CANCELLED past period end → EXPIRED (data stays; read-only enforcement is automatic)
  const cancelledExpired = await db.subscription.findMany({
    where: { status: 'CANCELLED', currentPeriodEnd: { lt: now } },
    select: { id: true },
  })
  for (const sub of cancelledExpired) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } }).catch(() => {})
  }

  // TRIALING past period end → PAST_DUE (7-day grace) + 'trial ended' notification
  const trialsPastDue = await db.subscription.findMany({
    where: { status: 'TRIALING', currentPeriodEnd: { lt: now } },
    select: { id: true, orgId: true, plan: { select: { name: true } } },
  })
  for (const sub of trialsPastDue) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } }).catch(() => {})
    const org = await db.organization.findUnique({ where: { id: sub.orgId }, select: { ownerId: true, name: true } })
    if (org) {
      await notifyUsers({
        orgId: sub.orgId,
        userIds: [org.ownerId],
        type: 'SYSTEM',
        title: 'Your trial has ended',
        body: `The ${sub.plan.name} trial for ${org.name} has ended. Choose a plan from Billing & Plan within 7 days to keep the workspace active.`,
      })
    }
  }

  // any status the sweep touched must drop out of the 60s enforcement cache now
  invalidateSubscriptionCache()

  // ---------- 3. pending leave starting soon → remind approvers ----------
  const soonLeave = await db.leaveRequest.findMany({
    where: { status: 'PENDING', startDate: { gte: now, lte: in3d } },
    select: { orgId: true, membership: { select: { user: { select: { name: true } } } }, startDate: true },
  })
  const leaveByOrg = new Map<string, number>()
  for (const lr of soonLeave) leaveByOrg.set(lr.orgId, (leaveByOrg.get(lr.orgId) ?? 0) + 1)
  for (const [orgId, count] of leaveByOrg) {
    const userIds = await managerUserIds(orgId)
    await notifyUsers({
      orgId,
      userIds,
      type: 'SYSTEM',
      module: 'HR',
      title: count === 1 ? 'A leave request starting soon is awaiting approval' : `${count} leave requests starting soon are awaiting approval`,
      body: 'Requests starting within 3 days still have no decision — review them in HR → Leave.',
    })
  }

  // ---------- 4. open tasks due within 24h → remind assignees ----------
  // (assigneeMembershipId is a plain column — no relation; resolve manually)
  const dueTasks = await db.task.findMany({
    where: { status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }, dueDate: { gte: now, lte: in24h }, assigneeMembershipId: { not: null } },
    select: { title: true, dueDate: true, orgId: true, assigneeMembershipId: true },
  })
  const assigneeIds = [...new Set(dueTasks.map((t) => t.assigneeMembershipId as string))]
  const assigneeMemberships = assigneeIds.length
    ? await db.membership.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, userId: true } })
    : []
  const assigneeUserByMembership = new Map(assigneeMemberships.map((m) => [m.id, m.userId]))
  let taskReminders = 0
  for (const task of dueTasks) {
    const userId = task.assigneeMembershipId ? assigneeUserByMembership.get(task.assigneeMembershipId) : undefined
    if (!userId) continue
    taskReminders += 1
    await notifyUsers({
      orgId: task.orgId,
      userIds: [userId],
      type: 'TASK',
      module: 'TASKS',
      title: 'Task due soon',
      body: `"${task.title}" is due ${task.dueDate ? task.dueDate.toISOString().slice(0, 10) : 'today'}.`,
    })
  }

  // ---------- 5. purge expired sessions ----------
  const purged = await db.session.deleteMany({ where: { expiresAt: { lt: now } } })

  return ok({
    ranAt: now.toISOString(),
    invoicesMarkedOverdue: overdueInvoices.length,
    invoicesNotifiedOrgs: invoiceByOrg.size,
    subscriptionsPastDue: pastDueSubs.length,
    subscriptionsExpired: expiredSubs.length,
    cancelledExpired: cancelledExpired.length,
    trialsPastDue: trialsPastDue.length,
    leaveReminderOrgs: leaveByOrg.size,
    leaveReminderCount: soonLeave.length,
    taskRemindersSent: taskReminders,
    sessionsPurged: purged.count,
  })
}

/** GET is not part of the cron contract — the trigger always POSTs. */
export async function GET() {
  return fail('Use POST with an Authorization: Bearer <CRON_SECRET> header', 405)
}
