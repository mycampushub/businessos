import { db } from '@/lib/db'
import { parseWorkDays } from './policy'
import { DEFAULT_TZ, addDaysToKey, weekdayOfDateKey, storedDateKey } from './tz'

// Backward-compatible re-export: holidays.ts has always exported an org-day-key
// helper — it now delegates to tz.ts (org timezone, default Asia/Dhaka).
export { localDateKey } from './tz'

// ---------- T5 holiday helpers ----------
// Shared by: /api/hr/holidays, /api/hr/leave (day counting), /api/hr/leave/[id]
// (attendance sync skips holidays), /api/my/day (upcoming holidays), payroll
// payslips (no penalty on holidays), Gantt (client reads via /api/hr/holidays).
// F1: range iteration is pure date-key math (no server-locale Date arithmetic).
// Holiday/leave rows are STORED whole-day rows: their UTC calendar date is the
// intended org-local date (see storedDateKey). Live instants ("now") belong to
// tz.ts localDateKey(d, orgTz) — the two never mix.

export const HOLIDAY_TYPES = ['GOVT', 'COMPANY', 'CUSTOM'] as const
export type HolidayType = (typeof HOLIDAY_TYPES)[number]

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  GOVT: 'Government',
  COMPANY: 'Company',
  CUSTOM: 'Custom',
}

/**
 * Curated Bangladesh public-holiday catalog offered in Settings → Leave & Holidays.
 * 2026 follows the announced government calendar; 2027 fixed-date observances are
 * exact while lunar festival dates (Eid, Ashura, Durga Puja) are marked `expected` —
 * the official calendar is published late in the preceding year.
 */
export interface BdCatalogEntry {
  name: string
  month: number
  day: number
  days: number
  /** lunar approximation — adjust when the government calendar is announced */
  expected?: boolean
}

export const BD_HOLIDAY_CATALOG: Record<number, BdCatalogEntry[]> = {
  2026: [
    { name: 'February 21 — Shaheed Day & International Mother Language Day', month: 2, day: 21, days: 1 },
    { name: 'Eid-ul-Fitr (day 1 of 3)', month: 3, day: 20, days: 3 },
    { name: 'Independence Day', month: 3, day: 26, days: 1 },
    { name: 'Pohela Boishakh — Bengali New Year', month: 4, day: 14, days: 1 },
    { name: 'May Day', month: 5, day: 1, days: 1 },
    { name: 'Eid-ul-Adha (day 1 of 3)', month: 5, day: 27, days: 3 },
    { name: 'National Mourning Day', month: 8, day: 15, days: 1 },
    { name: 'Ashura', month: 8, day: 25, days: 1 },
    { name: 'Durga Puja — Vijaya Dashami', month: 10, day: 20, days: 1 },
    { name: 'Victory Day', month: 12, day: 16, days: 1 },
    { name: 'Christmas Day', month: 12, day: 25, days: 1 },
  ],
  2027: [
    { name: 'February 21 — Shaheed Day & International Mother Language Day', month: 2, day: 21, days: 1 },
    { name: 'Eid-ul-Fitr (day 1 of 3)', month: 3, day: 10, days: 3, expected: true },
    { name: 'Independence Day', month: 3, day: 26, days: 1 },
    { name: 'Pohela Boishakh — Bengali New Year', month: 4, day: 14, days: 1 },
    { name: 'May Day', month: 5, day: 1, days: 1 },
    { name: 'Eid-ul-Adha (day 1 of 3)', month: 5, day: 17, days: 3, expected: true },
    { name: 'National Mourning Day', month: 8, day: 15, days: 1 },
    { name: 'Ashura', month: 8, day: 14, days: 1, expected: true },
    { name: 'Durga Puja — Vijaya Dashami', month: 10, day: 9, days: 1, expected: true },
    { name: 'Victory Day', month: 12, day: 16, days: 1 },
    { name: 'Christmas Day', month: 12, day: 25, days: 1 },
  ],
}

/** years available in the catalog (ascending) */
export const BD_CATALOG_YEARS = Object.keys(BD_HOLIDAY_CATALOG).map(Number).sort((a, b) => a - b)

/** catalog entries of one year (empty array for unknown years) */
export function bdCatalogFor(year: number): BdCatalogEntry[] {
  return BD_HOLIDAY_CATALOG[year] ?? []
}

/** Backward-compatible alias — the announced 2026 list. */
export const BD_HOLIDAY_TEMPLATE = BD_HOLIDAY_CATALOG[2026]

export interface HolidayRow {
  id: string
  name: string
  type: string
  startDate: Date
  endDate: Date
  description: string | null
}

/** item shape returned by GET /api/hr/holidays (frozen T5 contract) */
export interface HolidayItem {
  id: string
  name: string
  type: string
  startDate: string // ISO date
  endDate: string // ISO date (inclusive)
  days: number
  description: string | null
}

export function holidayItem(h: HolidayRow): HolidayItem {
  const start = startOfDay(h.startDate)
  const end = startOfDay(h.endDate)
  return {
    id: h.id,
    name: h.name,
    type: h.type,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    days: Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1),
    description: h.description,
  }
}

/** local-midnight copy of a Date — storage normalizer for whole-day holiday rows (kept for the holidays API contract). */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Expand org holidays into a Set of YYYY-MM-DD keys covering every date inside
 * each holiday range (storedDateKey convention). Used for leave-day counting,
 * attendance sync and payroll unpaid-leave clipping.
 */
export function holidayDateKeys(holidays: Array<{ startDate: Date; endDate: Date }>): Set<string> {
  const keys = new Set<string>()
  for (const h of holidays) {
    let cursor = storedDateKey(h.startDate)
    const end = storedDateKey(h.endDate)
    let guard = 0
    while (cursor <= end && guard < 400) {
      keys.add(cursor)
      cursor = addDaysToKey(cursor, 1)
      guard++
    }
  }
  return keys
}

/** weekday number 1=Mon..7=Sun (calendar-date helper for API-constructed dates) */
export function weekdayNum(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/**
 * Count chargeable work days (policy workDays MINUS org holidays) between two
 * org-local 'YYYY-MM-DD' keys, inclusive. Pure key-space math — no server-locale
 * Date arithmetic. Shared by leave counting and payroll period clipping.
 */
export function chargeableDaysBetweenKeys(
  startKey: string,
  endKey: string,
  workDays: number[],
  holidayKeys: Set<string>,
): number {
  let cursor = startKey
  let count = 0
  let guard = 0
  while (cursor <= endKey && guard < 800) {
    if (workDays.includes(weekdayOfDateKey(cursor)) && !holidayKeys.has(cursor)) count++
    cursor = addDaysToKey(cursor, 1)
    guard++
  }
  return count
}

/**
 * Count chargeable leave days in [start..end]: work days (policy) MINUS org
 * holidays. Bounds are stored whole-day rows (storedDateKey convention). Returns
 * 0 when the range contains no chargeable day (caller 422s).
 */
export function chargeableLeaveDays(
  start: Date,
  end: Date,
  workDays: number[],
  holidayKeys: Set<string>,
): number {
  return chargeableDaysBetweenKeys(storedDateKey(start), storedDateKey(end), workDays, holidayKeys)
}

/**
 * Holiday context for an org: all holidays + parsed work days (weekly holidays)
 * + the org timezone. One helper for /api/hr/holidays, leave routes, my/day and payroll.
 */
export async function holidayContext(orgId: string): Promise<{
  holidays: HolidayRow[]
  workDays: number[]
  timezone: string
}> {
  const { getOrgPolicy } = await import('./policy')
  const [holidays, policy, org] = await Promise.all([
    db.holiday.findMany({ where: { orgId }, orderBy: { startDate: 'asc' } }),
    getOrgPolicy(orgId),
    db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } }),
  ])
  return { holidays, workDays: parseWorkDays(policy.workDays), timezone: org?.timezone || DEFAULT_TZ }
}
