import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'
import { holidayContext, holidayItem, BD_HOLIDAY_TEMPLATE, HOLIDAY_TYPES, startOfDay, type HolidayRow } from '@/lib/server/holidays'

// ---------- T5: org holiday calendar (government + company + custom) ----------
// GET is open to EVERY org member (holidays feed the Gantt shading, tasks calendar,
// leave preview and My Day — they are non-sensitive org calendar data).
// Writes require OWNER / ADMIN / HR.

/** GET /api/hr/holidays — { items: HolidayItem[], workDays: number[] } (frozen T5 contract) */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const { holidays, workDays } = await holidayContext(org.id)
  return ok({ items: holidays.map(holidayItem), workDays })
})

function parseHolidayBody(b: Record<string, unknown>): {
  name: string
  type: string
  startDate: Date
  endDate: Date
  description: string | null
} | { error: string } {
  const name = str(b.name, 'name', { max: 120 }).trim()
  if (!name) return { error: 'Holiday name is required' }
  const type = typeof b.type === 'string' && (HOLIDAY_TYPES as readonly string[]).includes(b.type) ? b.type : 'CUSTOM'
  const start = new Date(String(b.startDate ?? ''))
  const endRaw = new Date(String(b.endDate ?? b.startDate ?? ''))
  if (Number.isNaN(start.getTime()) || Number.isNaN(endRaw.getTime())) {
    return { error: '"startDate" and "endDate" must be valid dates' }
  }
  const startDate = startOfDay(start)
  const endDate = startOfDay(endRaw)
  if (endDate < startDate) return { error: 'End date cannot be before the start date' }
  // sanity cap: a single holiday cannot span more than 30 days
  if ((endDate.getTime() - startDate.getTime()) / 86_400_000 + 1 > 30) {
    return { error: 'A holiday cannot span more than 30 days' }
  }
  const description =
    b.description !== undefined && b.description !== null ? String(b.description).trim().slice(0, 500) || null : null
  return { name, type, startDate, endDate, description }
}

/** POST /api/hr/holidays — one holiday, or the Bangladesh 2026 template bulk-insert. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { org, membership } = requireOrg(ctx)
  requireRole(ctx, ['ADMIN', 'HR'])

  const b = await body<Record<string, unknown>>(req)

  // --- template bulk-insert (Settings quick action) ---
  if (b.template === 'BD_2026') {
    const existing = await db.holiday.findMany({ where: { orgId: org.id }, select: { name: true, startDate: true } })
    const seen = new Set(existing.map((h) => `${h.name}|${startOfDay(h.startDate).toISOString()}`))
    const data = BD_HOLIDAY_TEMPLATE.filter((t) => {
      const start = new Date(2026, t.month - 1, t.day)
      return !seen.has(`${t.name}|${start.toISOString()}`)
    }).map((t) => {
      const start = new Date(2026, t.month - 1, t.day)
      const end = new Date(2026, t.month - 1, t.day + t.days - 1)
      return {
        orgId: org.id,
        name: t.name,
        type: 'GOVT',
        startDate: start,
        endDate: end,
        description: 'Bangladesh public holiday (2026 template)',
      }
    })
    if (data.length) await db.holiday.createMany({ data })
    const holidays = await db.holiday.findMany({ where: { orgId: org.id }, orderBy: { startDate: 'asc' } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'settings.holidays_template',
      entityType: 'HOLIDAY',
      message: `${ctx.user.name} added ${data.length} Bangladesh 2026 public holidays`,
    })
    return ok({ created: data.length, items: holidays.map(holidayItem) })
  }

  // --- single holiday ---
  const parsed = parseHolidayBody(b)
  if ('error' in parsed) return fail(parsed.error, 422)
  const created = await db.holiday.create({ data: { orgId: org.id, ...parsed } })
  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'settings.holiday_created',
    entityType: 'HOLIDAY',
    entityId: created.id,
    message: `${ctx.user.name} added the holiday "${parsed.name}"`,
  })
  return ok({ item: holidayItem(created as HolidayRow) })
})
