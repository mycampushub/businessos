import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, logActivity } from '@/lib/server/api'
import { getOrgPolicy, isValidHHMM, parseWorkDays } from '@/lib/server/policy'

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = Number(v)
  if (v === undefined || v === null || v === '' || Number.isNaN(n) || !Number.isInteger(n)) return null
  if (n < min || n > max) return null
  return n
}

/** GET /api/settings/policy — org policy row (upserts defaults on first read; OWNER/ADMIN). */
export const GET = withAuth(async (_req, ctx) => {
  const { org } = requireOrg(ctx)
  requireRole(ctx, ['ADMIN'])
  const policy = await getOrgPolicy(org.id)
  return ok({ policy })
})

/** PUT /api/settings/policy — {checkInTime?, checkOutTime?, lateGraceMins?, halfDayMins?, fullDayMins?, workDays?, overtimeEnabled?, payrollDay?, latePenaltyEnabled?, latePenaltyThreshold?, latePenaltyMode?, latePenaltyAmount?} (OWNER/ADMIN). */
export const PUT = withAuth(async (req, ctx) => {
  const { org, membership } = requireOrg(ctx)
  requireRole(ctx, ['ADMIN'])

  const b = await body<Record<string, unknown>>(req)
  const data: Record<string, unknown> = {}

  if (b.checkInTime !== undefined) {
    if (!isValidHHMM(b.checkInTime)) return fail('Please use HH:MM format', 422)
    data.checkInTime = b.checkInTime
  }
  if (b.checkOutTime !== undefined) {
    if (!isValidHHMM(b.checkOutTime)) return fail('Please use HH:MM format', 422)
    data.checkOutTime = b.checkOutTime
  }
  if (b.lateGraceMins !== undefined) {
    const n = intInRange(b.lateGraceMins, 0, 240)
    if (n === null) return fail('lateGraceMins must be between 0 and 240', 422)
    data.lateGraceMins = n
  }
  if (b.halfDayMins !== undefined) {
    const n = intInRange(b.halfDayMins, 30, 900)
    if (n === null) return fail('halfDayMins must be between 30 and 900', 422)
    data.halfDayMins = n
  }
  if (b.fullDayMins !== undefined) {
    const n = intInRange(b.fullDayMins, 30, 900)
    if (n === null) return fail('fullDayMins must be between 30 and 900', 422)
    data.fullDayMins = n
  }
  if (b.workDays !== undefined) {
    if (typeof b.workDays !== 'string') return fail('workDays must be a CSV of weekday numbers (1-7)', 422)
    const days = parseWorkDays(b.workDays)
    if (!days.length) return fail('workDays must include at least one weekday (1-7)', 422)
    data.workDays = days.join(',')
  }
  if (b.overtimeEnabled !== undefined) {
    if (typeof b.overtimeEnabled !== 'boolean') return fail('overtimeEnabled must be a boolean', 422)
    data.overtimeEnabled = b.overtimeEnabled
  }
  if (b.payrollDay !== undefined) {
    const n = intInRange(b.payrollDay, 1, 28)
    if (n === null) return fail('payrollDay must be between 1 and 28', 422)
    data.payrollDay = n
  }

  // ---- T5: late-arrival penalties ----
  if (b.latePenaltyEnabled !== undefined) {
    if (typeof b.latePenaltyEnabled !== 'boolean') return fail('latePenaltyEnabled must be a boolean', 422)
    data.latePenaltyEnabled = b.latePenaltyEnabled
  }
  if (b.latePenaltyThreshold !== undefined) {
    const n = intInRange(b.latePenaltyThreshold, 1, 31)
    if (n === null) return fail('latePenaltyThreshold must be between 1 and 31', 422)
    data.latePenaltyThreshold = n
  }
  if (b.latePenaltyMode !== undefined) {
    if (b.latePenaltyMode !== 'HALF_DAY' && b.latePenaltyMode !== 'AMOUNT') {
      return fail('latePenaltyMode must be HALF_DAY or AMOUNT', 422)
    }
    data.latePenaltyMode = b.latePenaltyMode
  }
  if (b.latePenaltyAmount !== undefined) {
    const n = Number(b.latePenaltyAmount)
    if (Number.isNaN(n) || n < 0 || n > 1_000_000) return fail('latePenaltyAmount must be between 0 and 1000000', 422)
    data.latePenaltyAmount = n
  }

  await getOrgPolicy(org.id) // ensure the row exists (upserts defaults on first read)
  const policy = await db.orgPolicy.update({ where: { orgId: org.id }, data })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'settings.policy_updated',
    entityType: 'SETTINGS',
    entityId: policy.id,
    message: `${ctx.user.name} updated organization rules (policy)`,
  })

  return ok({ policy })
})
