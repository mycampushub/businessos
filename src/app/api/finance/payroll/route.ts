import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity, notifyUsers, managerUserIds } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { round2, money, runItem, runListInclude, runDetail, buildPayslipRows } from './payroll-helpers'

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/ // "YYYY-MM"

// GET /api/finance/payroll — list of runs (period desc), finance-payroll VIEW
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'finance-payroll', 'view')
  if (denied) return denied

  const runs = await db.payrollRun.findMany({
    where: { orgId: org.id },
    orderBy: { period: 'desc' },
    include: runListInclude,
  })
  return ok({ items: runs.map(runItem) })
})

// POST /api/finance/payroll — create a DRAFT run + payslips for every ACTIVE member, finance-payroll FULL
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'finance-payroll', 'full')
  if (denied) return denied

  const b = await body(req)
  const period = str(b.period, 'period', { max: 7 })
  if (!PERIOD_RE.test(period)) return fail('Use YYYY-MM', 422)
  const note =
    b.note === undefined || b.note === null ? null : str(b.note, 'note', { required: false, max: 500 }) || null

  // org-scoped unique period
  const dupe = await db.payrollRun.findFirst({ where: { orgId: org.id, period } })
  if (dupe) return fail('Payroll for this period already exists', 409)

  // payslip math (base salary, components, unpaid leave, attendance) for the period
  const rows = await buildPayslipRows(org.id, period)

  const run = await db.$transaction(async (tx) => {
    const created = await tx.payrollRun.create({
      data: { orgId: org.id, period, note, status: 'DRAFT', createdById: membership.id },
    })
    if (rows.length) {
      // explicit field mapping — PayslipComputed carries transient penalty fields
      // (latePenaltyOccurrences/latePenaltyAmount) that are NOT Payslip columns;
      // their effect is baked into `net` + the breakdown JSON.
      await tx.payslip.createMany({
        data: rows.map((r) => ({
          runId: created.id,
          membershipId: r.membershipId,
          baseSalary: r.baseSalary,
          allowances: r.allowances,
          deductions: r.deductions,
          unpaidLeaveDays: r.unpaidLeaveDays,
          unpaidLeaveAmount: r.unpaidLeaveAmount,
          gross: r.gross,
          net: r.net,
          presentDays: r.presentDays,
          absentDays: r.absentDays,
          lateDays: r.lateDays,
          breakdown: r.breakdown,
        })),
      })
    }
    return created
  })

  const totalNet = round2(rows.reduce((s, r) => s + r.net, 0))
  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'payroll.created',
    entityType: 'PAYROLL_RUN',
    entityId: run.id,
    message: `Payroll run for ${period} created — ${rows.length} payslips, net ${money(totalNet)}`,
  })

  // notify org managers + finance-role users (self excluded)
  const recipients = (await managerUserIds(org.id)).filter((id) => id !== ctx.user.id)
  await notifyUsers({
    orgId: org.id,
    userIds: recipients,
    type: 'FINANCE',
    title: `Payroll created for ${period}`,
    body: `${ctx.user.name} created a payroll run for ${period} (${rows.length} payslips)`,
    module: 'finance-payroll',
  })

  return ok(await runDetail(org.id, run.id), 201)
})
