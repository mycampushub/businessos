import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, oneOf, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { runDetail, runDetailInclude, buildPayslipRows } from '../payroll-helpers'

const ACTIONS = ['approve', 'pay', 'regenerate'] as const

// GET /api/finance/payroll/[id] — run detail + payslips, finance-payroll VIEW
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-payroll', 'view')
    if (denied) return denied

    const detail = await runDetail(org.id, id)
    if (!detail) return fail('Payroll run not found', 404)
    return ok(detail)
  })(req)
}

// PATCH /api/finance/payroll/[id] {action: approve|pay|regenerate} — finance-payroll FULL
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-payroll', 'full')
    if (denied) return denied

    const run = await db.payrollRun.findFirst({ where: { id, orgId: org.id } })
    if (!run) return fail('Payroll run not found', 404)

    const b = await body(req)
    const action = oneOf(b.action, ACTIONS)

    if (action === 'approve') {
      if (run.status !== 'DRAFT') return fail('Only draft runs can be approved', 400)
      await db.payrollRun.update({
        where: { id: run.id },
        data: { status: 'APPROVED', approvedById: membership.id, approvedAt: new Date() },
      })
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'payroll.approved',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
        message: `Payroll run for ${run.period} approved by ${ctx.user.name}`,
      })
    } else if (action === 'pay') {
      if (run.status !== 'APPROVED') return fail('Approve the run before paying', 400)
      await db.payrollRun.update({ where: { id: run.id }, data: { status: 'PAID', paidAt: new Date() } })

      // notify EVERY payslip member
      const paid = await db.payrollRun.findFirst({ where: { id: run.id }, include: runDetailInclude })
      await notifyUsers({
        orgId: org.id,
        userIds: (paid?.payslips ?? []).map((p) => p.membership.userId),
        type: 'FINANCE',
        title: `Your payslip for ${run.period} is available`,
        body: `Payroll for ${run.period} has been paid by ${ctx.user.name}`,
        module: 'finance-payroll',
      })
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'payroll.paid',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
        message: `Payroll run for ${run.period} marked as paid by ${ctx.user.name}`,
      })
    } else {
      // regenerate: DRAFT only — delete + rebuild payslips with current salaries/components
      if (run.status !== 'DRAFT') return fail('Only draft runs can be regenerated', 400)
      const rows = await buildPayslipRows(org.id, run.period)
      await db.$transaction(async (tx) => {
        await tx.payslip.deleteMany({ where: { runId: run.id } })
        if (rows.length) {
          // explicit field mapping — mirror of the POST path. PayslipComputed carries
          // transient penalty fields (latePenaltyOccurrences/latePenaltyAmount) that
          // are NOT Payslip columns; spreading them into createMany raised
          // PrismaClientValidationError → 500 on every regenerate.
          await tx.payslip.createMany({
            data: rows.map((r) => ({
              runId: run.id,
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
      })
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'payroll.regenerated',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
        message: `Payroll run for ${run.period} regenerated — ${rows.length} payslips`,
      })
    }

    return ok(await runDetail(org.id, run.id))
  })(req)
}

// DELETE /api/finance/payroll/[id] — DRAFT only, finance-payroll FULL (payslips cascade)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-payroll', 'full')
    if (denied) return denied

    const run = await db.payrollRun.findFirst({ where: { id, orgId: org.id } })
    if (!run) return fail('Payroll run not found', 404)
    if (run.status !== 'DRAFT') return fail('Only draft runs can be deleted', 400)

    await db.payrollRun.delete({ where: { id: run.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'payroll.deleted',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
      message: `Payroll run for ${run.period} deleted by ${ctx.user.name}`,
    })
    return ok({ id: run.id })
  })(req)
}
