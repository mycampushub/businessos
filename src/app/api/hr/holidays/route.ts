import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'
import {
  holidayContext,
  holidayItem,
  bdCatalogFor,
  BD_CATALOG_YEARS,
  HOLIDAY_TYPES,
  startOfDay,
  weekdayNum,
  type HolidayRow,
} from '@/lib/server/holidays'

// ---------- T5: org holiday calendar (government + company + custom) ----------
// GET is open to EVERY org member (holidays feed the Gantt shading, tasks calendar,
// leave preview and My Day — they are non-sensitive org calendar data).
// Writes require OWNER / ADMIN / HR.

/** weekday label for catalog rows (Mon..Sun) */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** GET /api/hr/holidays — { items, workDays } · ?catalog=BD → { years, catalog } */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const url = new URL(req.url)

  // government holiday catalog (browsable reference list, read-only for everyone)
  if (url.searchParams.get('catalog') === 'BD') {
    const catalog = BD_CATALOG_YEARS.flatMap((year) =>
      bdCatalogFor(year).map((t) => {
        const start = new Date(year, t.month - 1, t.day)
        const end = new Date(year, t.month - 1, t.day + t.days - 1)
        return {
          year,
          name: t.name,
          type: 'GOVT' as const,
          startDate: startOfDay(start).toISOString(),
          endDate: startOfDay(end).toISOString(),
          days: t.days,
          weekday: WEEKDAY_LABELS[weekdayNum(start) - 1],
          expected: t.expected ?? false,
          description: t.expected
            ? 'Expected date (lunar calendar) — adjust when the government announces the official calendar.'
            : 'Bangladesh public holiday.',
        }
      })
    )
    return ok({ years: BD_CATALOG_YEARS, catalog })
  }

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

/** POST /api/hr/holidays — one holiday, or a Bangladesh government-catalog import.\n *  Template body: { template: 'BD', year: 2026 | 2027, names?: string[] } — imports the
 *  whole year (or just the named entries), skipping dates already on the calendar. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { org, membership } = requireOrg(ctx)
  requireRole(ctx, ['ADMIN', 'HR'])

  const b = await body<Record<string, unknown>>(req)

  // --- government catalog import (Settings → Leave & Holidays) ---
  if (b.template === 'BD' || b.template === 'BD_2026') {
    // 'BD_2026' kept for backward compatibility with earlier clients
    const year = b.template === 'BD_2026' ? 2026 : Number(b.year)
    const entries = bdCatalogFor(year)
    if (!entries.length) return fail(`No government holiday catalog for ${year}`, 422)

    // optional selective import — only the named entries
    const wanted = Array.isArray(b.names)
      ? new Set(b.names.map((n) => String(n)))
      : null
    const selected = wanted ? entries.filter((t) => wanted.has(t.name)) : entries
    if (wanted && !selected.length) {
      return fail('None of the named holidays exist in the catalog', 422)
    }

    const existing = await db.holiday.findMany({ where: { orgId: org.id }, select: { name: true, startDate: true } })
    const seen = new Set(existing.map((h) => `${h.name}|${startOfDay(h.startDate).toISOString()}`))
    const data = selected
      .filter((t) => {
        const start = new Date(year, t.month - 1, t.day)
        return !seen.has(`${t.name}|${start.toISOString()}`)
      })
      .map((t) => ({
        orgId: org.id,
        name: t.name,
        type: 'GOVT',
        startDate: new Date(year, t.month - 1, t.day),
        endDate: new Date(year, t.month - 1, t.day + t.days - 1),
        description: t.expected
          ? `Bangladesh public holiday (${year}, expected date — lunar calendar)`
          : `Bangladesh public holiday (${year})`,
      }))
    if (data.length) await db.holiday.createMany({ data })
    const holidays = await db.holiday.findMany({ where: { orgId: org.id }, orderBy: { startDate: 'asc' } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'settings.holidays_template',
      entityType: 'HOLIDAY',
      message: `${ctx.user.name} added ${data.length} Bangladesh ${year} public holidays`,
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
