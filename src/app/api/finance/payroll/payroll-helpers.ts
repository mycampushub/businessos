// Shared payroll helpers (plain module — NOT a route; deal-helpers.ts precedent).
// Math follows the T3-a worklog "payslip counting rules" exactly:
//   base = membership.baseSalary ?? 0
//   allowances = Σ ALLOWANCE SalaryComponents · fixedDeductions = Σ DEDUCTION SalaryComponents
//   unpaidLeaveDays = work days (policy) minus org holidays of APPROVED LeaveRequests
//                     (leaveType.paid=false) overlapping the period, clipped to the
//                     period bounds — same semantics as LeaveRequest.days, so
//                     weekends/holidays are never deducted twice.
//   unpaidLeaveAmount = Math.round(base / 30 × unpaidLeaveDays)  (integer, matches seed)
//   gross = base + allowances · net = max(0, gross − fixedDeductions − unpaidLeaveAmount)
//   presentDays counts PRESENT (+ HALF_DAY), lateDays LATE, absentDays ABSENT (LEAVE/HOLIDAY skipped)
import { db } from '@/lib/db'
import { getOrgPolicy, parseWorkDays } from '@/lib/server/policy'
import { storedDateKey } from '@/lib/server/tz'
import { holidayDateKeys, chargeableDaysBetweenKeys } from '@/lib/server/holidays'
import { fromCents, fromCents0 } from '@/lib/server/money'

// ---------- money ----------

export const round2 = (n: number): number => Math.round(n * 100) / 100
// C7 fix: `money` receives a cents value (from DB / PayslipComputed) and must
// convert to dollars before formatting for log messages.
export const money = (n: number): string => `৳${Math.round(fromCents0(n)).toLocaleString('en-US')}`

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
    // C7 fix: payslips.gross/net are stored in cents → convert to dollars.
    totalGross: fromCents0(run.payslips.reduce((s, p) => s + p.gross, 0)),
    totalNet: fromCents0(run.payslips.reduce((s, p) => s + p.net, 0)),
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
    // C7 fix: all payslip money columns are stored in cents → convert to dollars.
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
    // breakdown JSON amounts are stored in cents → convert each row to dollars.
    breakdown: parseBreakdown(p.breakdown).map((r) => ({ ...r, amount: fromCents0(r.amount) })),
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

/**
 * Unpaid-leave day counts per membership for a "YYYY-MM" period.
 * F1: counts WORK days (policy workDays) minus org holidays inside
 * [max(leaveStart, periodStart), min(leaveEnd, periodEnd)] — mirroring
 * LeaveRequest.days semantics. A request spanning period edges contributes only
 * its in-period work days; weekends and holidays are never charged. All bounds
 * are calendar date keys (storedDateKey convention) — no server-locale math.
 */
export function unpaidLeaveDaysFor(
  period: string,
  approvedLeaves: Array<{ membershipId: string; startDate: Date; endDate: Date; leaveType: { paid: boolean } }>,
  workDays: number[],
  holidayKeys: Set<string>,
): Map<string, number> {
  const year = parseInt(period.slice(0, 4), 10)
  const month = parseInt(period.slice(5, 7), 10) // 1..12
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate() // day 0 of next month = last day
  const periodStart = `${period}-01`
  const periodEnd = `${period}-${String(daysInMonth).padStart(2, '0')}`
  const map = new Map<string, number>()
  for (const lr of approvedLeaves) {
    if (lr.leaveType.paid) continue
    const start = storedDateKey(lr.startDate)
    const end = storedDateKey(lr.endDate)
    const clippedStart = start > periodStart ? start : periodStart
    const clippedEnd = end < periodEnd ? end : periodEnd
    if (clippedEnd < clippedStart) continue // no overlap with the period
    const days = chargeableDaysBetweenKeys(clippedStart, clippedEnd, workDays, holidayKeys)
    if (days > 0) map.set(lr.membershipId, (map.get(lr.membershipId) ?? 0) + days)
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
  // C7 fix: base + lp.amount are now cents (Int). The HALF_DAY per-occurrence amount
  // must be an integer cent value (Math.round) so latePenaltyAmount/net stay integer
  // cents — the old `* 100 / 100` dollar-rounding produced fractional cents that broke
  // Int storage. AMOUNT mode reads lp.amount straight from the (Int) policy column.
  const lp = latePenalty ?? { enabled: false, threshold: 3, mode: 'HALF_DAY', amount: 0 }
  const latePenaltyOccurrences = lp.enabled ? Math.floor(lateDays / Math.max(1, lp.threshold)) : 0
  const perOccurrence =
    lp.mode === 'AMOUNT' ? lp.amount : Math.round((base / 30) / 2)
  const latePenaltyAmount = latePenaltyOccurrences > 0 ? latePenaltyOccurrences * perOccurrence : 0

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
  // F1: period clipping + day counting happen in pure calendar-key space
  // (policy work days, org holidays, stored whole-day leave bounds).
  const [policy, orgHolidays] = await Promise.all([
    getOrgPolicy(orgId),
    db.holiday.findMany({ where: { orgId }, select: { startDate: true, endDate: true } }),
  ])
  const workDays = parseWorkDays(policy.workDays)
  const holidayKeys = holidayDateKeys(orgHolidays)
  // H6 fix: scope the attendance fetch by period prefix (date is 'YYYY-MM-DD', period is 'YYYY-MM').
  // Previously fetched ALL attendance ever for the org then filtered in JS — O(n) memory for years
  // of data on every payroll run. Now uses a sargable startsWith query.
  const periodAttendance = await db.attendance.findMany({
    where: { orgId, date: { startsWith: period } },
    select: { membershipId: true, date: true, status: true },
  })
  const approvedLeaves = await db.leaveRequest.findMany({
    where: { orgId, status: 'APPROVED' },
    include: { leaveType: { select: { paid: true } } },
  })
  const unpaidDays = unpaidLeaveDaysFor(period, approvedLeaves, workDays, holidayKeys)
  // T5: late-arrival penalty policy (OrgPolicy) feeds the payslip deduction
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
  // C7 fix: baseSalary + component amounts are stored in cents. Sum in cents,
  // then convert every output value to dollars via fromCents/fromCents0.
  const allowancesCents = m.salaryComponents
    .filter((c) => c.kind === 'ALLOWANCE')
    .reduce((s, c) => s + c.amount, 0)
  const deductionsCents = m.salaryComponents
    .filter((c) => c.kind === 'DEDUCTION')
    .reduce((s, c) => s + c.amount, 0)
  return {
    membershipId: m.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl,
    title: m.title,
    departmentName: m.department?.name ?? null,
    role: m.role,
    employmentType: m.employmentType,
    baseSalary: fromCents(m.baseSalary),
    components: m.salaryComponents.map((c) => ({ id: c.id, label: c.label, kind: c.kind, amount: fromCents0(c.amount) })),
    allowancesTotal: fromCents0(allowancesCents),
    deductionsTotal: fromCents0(deductionsCents),
    monthlyCost: fromCents0((m.baseSalary ?? 0) + allowancesCents),
  }
}
