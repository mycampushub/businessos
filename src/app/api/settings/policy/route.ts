import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, logActivity } from '@/lib/server/api'
import { getOrgPolicy, isValidHHMM, parseWorkDays } from '@/lib/server/policy'
import { toCents, fromCents0 } from '@/lib/server/money'

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
  // C7: latePenaltyAmount is now Int cents in the DB — convert to dollars for the API response
  return ok({ policy: { ...policy, latePenaltyAmount: fromCents0(policy.latePenaltyAmount) } })
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
    // C7: client sends dollars, DB stores cents. Input is validated in dollars (0..1,000,000).
    const n = Number(b.latePenaltyAmount)
    if (Number.isNaN(n) || n < 0 || n > 1_000_000) return fail('latePenaltyAmount must be between 0 and 1000000', 422)
    data.latePenaltyAmount = toCents(n) ?? 0
  }

  // M22-db fix: validate the lateGraceMins < halfDayMins < fullDayMins chain across the final values.
  // Fetch the current policy so we can merge pending changes with existing values for cross-field validation.
  const existing = await getOrgPolicy(org.id)
  const finalLateGrace = (data.lateGraceMins as number | undefined) ?? existing.lateGraceMins
  const finalHalfDay = (data.halfDayMins as number | undefined) ?? existing.halfDayMins
  const finalFullDay = (data.fullDayMins as number | undefined) ?? existing.fullDayMins
  if (finalLateGrace >= finalHalfDay) {
    return fail('lateGraceMins must be less than halfDayMins', 422)
  }
  if (finalHalfDay >= finalFullDay) {
    return fail('halfDayMins must be less than fullDayMins', 422)
  }

  const policy = await db.orgPolicy.update({ where: { orgId: org.id }, data })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'settings.policy_updated',
    entityType: 'SETTINGS',
    entityId: policy.id,
    message: `${ctx.user.name} updated organization rules (policy)`,
  })

  return ok({ policy: { ...policy, latePenaltyAmount: fromCents0(policy.latePenaltyAmount) } })
})
