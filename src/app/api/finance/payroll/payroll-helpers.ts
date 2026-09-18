// Shared payroll helpers (plain module — NOT a route; deal-helpers.ts precedent).
// Math follows the T3-a worklog "payslip counting rules" exactly:
//   base = membership.baseSalary ?? 0
//   allowances = Σ ALLOWANCE SalaryComponents · fixedDeductions = Σ DEDUCTION SalaryComponents
//   unpaidLeaveDays = days of APPROVED LeaveRequests (leaveType.paid=false) overlapping the period,
//                     counted in [max(startDate, periodStart), min(endDate, periodEnd)]
//   unpaidLeaveAmount = Math.round(base / 30 × unpaidLeaveDays)  (integer, matches seed)
//   gross = base + allowances · net = max(0, gross − fixedDeductions − unpaidLeaveAmount)
//   presentDays counts PRESENT (+ HALF_DAY), lateDays LATE, absentDays ABSENT (LEAVE/HOLIDAY skipped)
import { db } from '@/lib/db'
import { getOrgPolicy } from '@/lib/server/policy'

// ---------- money ----------

export const round2 = (n: number): number => Math.round(n * 100) / 100
export const money = (n: number): string => `৳${Math.round(n).toLocaleString('en-US')}`

// ---------- payslip breakdown (JSON-as-String) ----------

export interface BreakdownRow {
  label: string
  kind: string // BASE | ALLOWANCE | DEDUCTION
  amount: number
}

export function parseBreakdown(s: string): BreakdownRow[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as BreakdownRow[]) : []
  } catch {
    return []
  }
}

// ---------- Prisma includes ----------

export const runListInclude = {
  createdBy: { select: { user: { select: { name: true } } } },
  approvedBy: { select: { user: { select: { name: true } } } },
  payslips: { select: { gross: true, net: true } },
} as const

export const runDetailInclude = {
  createdBy: { select: { user: { select: { name: true } } } },
  approvedBy: { select: { user: { select: { name: true } } } },
  payslips: {
    include: {
      membership: {
        select: {
          title: true,
          role: true,
          userId: true,
          user: { select: { name: true, avatarUrl: true } },
          department: { select: { name: true } },
        },
      },
    },
  },
} as const

export const salariesInclude = {
  user: { select: { name: true, avatarUrl: true } },
  department: { select: { name: true } },
  salaryComponents: { orderBy: { createdAt: 'asc' } },
} as const

// ---------- run list item (shape of GET /api/finance/payroll items AND `run` in run detail) ----------

export interface RunItemSource {
  id: string
  period: string
  status: string
  note: string | null
  createdAt: Date
  approvedAt: Date | null
  paidAt: Date | null
  createdBy: { user: { name: string } } | null
  approvedBy: { user: { name: string } } | null
  payslips: { gross: number; net: number }[]
}

export function runItem(run: RunItemSource) {
  return {
    id: run.id,
    period: run.period,
    status: run.status,
    note: run.note,
    createdAt: run.createdAt,
    approvedAt: run.approvedAt,
    paidAt: run.paidAt,
    createdByName: run.createdBy?.user?.name ?? null,
    approvedByName: run.approvedBy?.user?.name ?? null,
    payslipCount: run.payslips.length,
    totalGross: round2(run.payslips.reduce((s, p) => s + p.gross, 0)),
    totalNet: round2(run.payslips.reduce((s, p) => s + p.net, 0)),
  }
}

// ---------- payslip item (shape of run detail `payslips` array) ----------

export interface PayslipSource {
  id: string
  membershipId: string
  baseSalary: number
  allowances: number
  deductions: number
  unpaidLeaveDays: number
  unpaidLeaveAmount: number
  gross: number
  net: number
  presentDays: number | null
  absentDays: number | null
  lateDays: number | null
  breakdown: string
  membership: {
    title: string | null
    role: string
    user: { name: string; avatarUrl: string | null } | null
    department: { name: string } | null
  } | null
}

export function payslipItem(p: PayslipSource) {
  return {
    id: p.id,
    membershipId: p.membershipId,
    userName: p.membership?.user?.name ?? null,
    userAvatar: p.membership?.user?.avatarUrl ?? null,
    title: p.membership?.title ?? null,
    departmentName: p.membership?.department?.name ?? null,
    role: p.membership?.role ?? null,
    baseSalary: round2(p.baseSalary),
    allowances: round2(p.allowances),
    deductions: round2(p.deductions),
    unpaidLeaveDays: p.unpaidLeaveDays,
    unpaidLeaveAmount: round2(p.unpaidLeaveAmount),
    gross: round2(p.gross),
    net: round2(p.net),
    presentDays: p.presentDays,
    absentDays: p.absentDays,
    lateDays: p.lateDays,
    breakdown: parseBreakdown(p.breakdown),
  }
}

// ---------- run detail (GET [id], POST, PATCH responses) ----------

export async function runDetail(orgId: string, runId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, orgId }, include: runDetailInclude })
  if (!run) return null
  const payslips = [...run.payslips].sort((a, b) =>
    (a.membership?.user?.name ?? '').localeCompare(b.membership?.user?.name ?? ''),
  )
  return { run: runItem(run), payslips: payslips.map(payslipItem) }
}

// ---------- payslip math ----------

interface MemberForPayroll {
  id: string
  baseSalary: number | null
  salaryComponents: Array<{ label: string; kind: string; amount: number }>
}

export interface PayslipComputed {
  membershipId: string
  baseSalary: number
  allowances: number
  deductions: number
  unpaidLeaveDays: number
  unpaidLeaveAmount: number
  latePenaltyOccurrences: number
  latePenaltyAmount: number
  gross: number
  net: number
  presentDays: number
  absentDays: number
  lateDays: number
  breakdown: string
}

/** Unpaid-leave day counts per membership for a "YYYY-MM" period (clipped to the month). */
export function unpaidLeaveDaysFor(
  period: string,
  approvedLeaves: Array<{ membershipId: string; startDate: Date; endDate: Date; leaveType: { paid: boolean } }>,
): Map<string, number> {
  const year = parseInt(period.slice(0, 4), 10)
  const month = parseInt(period.slice(5, 7), 10) // 1..12
  const periodStart = new Date(year, month - 1, 1).getTime()
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999).getTime() // last day of the month
  const map = new Map<string, number>()
  for (const lr of approvedLeaves) {
    if (lr.leaveType.paid) continue
    const start = Math.max(lr.startDate.getTime(), periodStart)
    const end = Math.min(lr.endDate.getTime(), periodEnd)
    if (end < start) continue // no overlap with the period
    const days = Math.floor((end - start) / 86_400_000) + 1
    map.set(lr.membershipId, (map.get(lr.membershipId) ?? 0) + days)
  }
  return map
}

export function computePayslip(
  member: MemberForPayroll,
  periodAttendance: Array<{ membershipId: string; status: string }>,
  unpaidLeaveDays: number,
  latePenalty?: {
    enabled: boolean
    threshold: number
    mode: string // HALF_DAY | AMOUNT
    amount: number
  },
): PayslipComputed {
  const base = member.baseSalary ?? 0
  const allowances = round2(
    member.salaryComponents.filter((c) => c.kind === 'ALLOWANCE').reduce((s, c) => s + c.amount, 0),
  )
  const fixedDeductions = round2(
    member.salaryComponents.filter((c) => c.kind === 'DEDUCTION').reduce((s, c) => s + c.amount, 0),
  )

  // Attendance counts in period (date prefix already filtered by the caller)
  const myAtt = periodAttendance.filter((a) => a.membershipId === member.id)
  const presentDays = myAtt.filter((a) => a.status === 'PRESENT' || a.status === 'HALF_DAY').length
  const lateDays = myAtt.filter((a) => a.status === 'LATE').length
  const absentDays = myAtt.filter((a) => a.status === 'ABSENT').length

  const unpaidLeaveAmount = Math.round((base / 30) * unpaidLeaveDays)

  // T5: late-arrival penalty — every `threshold` LATE days in the period count as one
  // penalty occurrence: HALF_DAY deducts half a day's salary (base/30 ÷ 2), AMOUNT
  // deducts the configured figure. Lates on HOLIDAY/LEAVE days are never counted
  // (status LATE only exists on days with real check-ins).
  const lp = latePenalty ?? { enabled: false, threshold: 3, mode: 'HALF_DAY', amount: 0 }
  const latePenaltyOccurrences = lp.enabled ? Math.floor(lateDays / Math.max(1, lp.threshold)) : 0
  const perOccurrence =
    lp.mode === 'AMOUNT' ? lp.amount : Math.round(((base / 30) / 2) * 100) / 100
  const latePenaltyAmount = latePenaltyOccurrences > 0 ? round2(latePenaltyOccurrences * perOccurrence) : 0

  const gross = round2(base + allowances)
  const net = Math.max(0, round2(gross - fixedDeductions - unpaidLeaveAmount - latePenaltyAmount))

  const breakdown = JSON.stringify([
    { label: 'Base salary', kind: 'BASE', amount: base },
    ...member.salaryComponents.map((c) => ({ label: c.label, kind: c.kind, amount: round2(c.amount) })),
    ...(unpaidLeaveDays > 0
      ? [{ label: `Unpaid leave (${unpaidLeaveDays} days)`, kind: 'DEDUCTION', amount: unpaidLeaveAmount }]
      : []),
    ...(latePenaltyOccurrences > 0
      ? [
          {
            label: `Late penalty (${lateDays} lates ÷ ${Math.max(1, lp.threshold)})`,
            kind: 'DEDUCTION',
            amount: latePenaltyAmount,
          },
        ]
      : []),
  ])

  return {
    membershipId: member.id,
    baseSalary: base,
    allowances,
    deductions: fixedDeductions,
    unpaidLeaveDays,
    unpaidLeaveAmount,
    latePenaltyOccurrences,
    latePenaltyAmount,
    gross,
    net,
    presentDays,
    absentDays,
    lateDays,
    breakdown,
  }
}

/** Computes one payslip row per ACTIVE member of the org for the given period. */
export async function buildPayslipRows(orgId: string, period: string): Promise<PayslipComputed[]> {
  const members = await db.membership.findMany({
    where: { orgId, status: 'ACTIVE' },
    include: { salaryComponents: { orderBy: { createdAt: 'asc' } } },
  })
  // Attendance rows of the period — fetched org-wide and filtered in JS (SQLite-safe prefix compare)
  const periodAttendance = (
    await db.attendance.findMany({
      where: { orgId },
      select: { membershipId: true, date: true, status: true },
    })
  ).filter((a) => a.date.startsWith(period))
  const approvedLeaves = await db.leaveRequest.findMany({
    where: { orgId, status: 'APPROVED' },
    include: { leaveType: { select: { paid: true } } },
  })
  const unpaidDays = unpaidLeaveDaysFor(period, approvedLeaves)
  // T5: late-arrival penalty policy (OrgPolicy) feeds the payslip deduction
  const policy = await getOrgPolicy(orgId)
  const latePenalty = {
    enabled: policy.latePenaltyEnabled,
    threshold: policy.latePenaltyThreshold,
    mode: policy.latePenaltyMode,
    amount: policy.latePenaltyAmount,
  }
  return members.map((m) => computePayslip(m, periodAttendance, unpaidDays.get(m.id) ?? 0, latePenalty))
}

// ---------- salaries item (GET /api/finance/payroll/salaries + PATCH [membershipId]) ----------

export interface SalaryMember {
  id: string
  role: string
  title: string | null
  employmentType: string
  baseSalary: number | null
  user: { name: string; avatarUrl: string | null }
  department: { name: string } | null
  salaryComponents: Array<{ id: string; label: string; kind: string; amount: number }>
}

export function salaryItem(m: SalaryMember) {
  const allowancesTotal = round2(
    m.salaryComponents.filter((c) => c.kind === 'ALLOWANCE').reduce((s, c) => s + c.amount, 0),
  )
  const deductionsTotal = round2(
    m.salaryComponents.filter((c) => c.kind === 'DEDUCTION').reduce((s, c) => s + c.amount, 0),
  )
  return {
    membershipId: m.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl,
    title: m.title,
    departmentName: m.department?.name ?? null,
    role: m.role,
    employmentType: m.employmentType,
    baseSalary: m.baseSalary === null ? null : round2(m.baseSalary),
    components: m.salaryComponents.map((c) => ({ id: c.id, label: c.label, kind: c.kind, amount: round2(c.amount) })),
    allowancesTotal,
    deductionsTotal,
    monthlyCost: round2((m.baseSalary ?? 0) + allowancesTotal),
  }
}
