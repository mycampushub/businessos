import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { fromCents0 } from '@/lib/server/money'

// GET /api/my/payslips — self-service: an employee can see their OWN payslips
// without needing finance-payroll: view access (DA-H1 fix).
// No module gate — this is a self-service endpoint like /api/my/day.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)

  const payslips = await db.payslip.findMany({
    where: { membershipId: membership.id },
    include: {
      run: { select: { period: true, status: true, paidAt: true } },
    },
    orderBy: { run: { period: 'desc' } },
    take: 24, // last 2 years max
  })

  return ok({
    items: payslips.map((p) => {
      let breakdown: Array<{ label: string; kind: string; amount: number }> = []
      try {
        const parsed = JSON.parse(p.breakdown)
        if (Array.isArray(parsed)) {
          breakdown = parsed.map((r: { label: string; kind: string; amount: number }) => ({
            label: r.label,
            kind: r.kind,
            amount: fromCents0(r.amount),
          }))
        }
      } catch {
        // malformed breakdown — return empty
      }
      return {
        id: p.id,
        runId: p.runId,
        period: p.run.period,
        runStatus: p.run.status,
        paidAt: p.run.paidAt,
        baseSalary: fromCents0(p.baseSalary),
        allowances: fromCents0(p.allowances),
        deductions: fromCents0(p.deductions),
        unpaidLeaveDays: p.unpaidLeaveDays,
        unpaidLeaveAmount: fromCents0(p.unpaidLeaveAmount),
        gross: fromCents0(p.gross),
        net: fromCents0(p.net),
        presentDays: p.presentDays,
        absentDays: p.absentDays,
        lateDays: p.lateDays,
        breakdown,
        createdAt: p.createdAt,
      }
    }),
  })
})
