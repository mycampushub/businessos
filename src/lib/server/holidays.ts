import { db } from '@/lib/db'
import { parseWorkDays } from './policy'

// ---------- T5 holiday helpers ----------
// Shared by: /api/hr/holidays, /api/hr/leave (day counting), /api/hr/leave/[id]
// (attendance sync skips holidays), /api/my/day (upcoming holidays), payroll
// payslips (no penalty on holidays), Gantt (client reads via /api/hr/holidays).

export const HOLIDAY_TYPES = ['GOVT', 'COMPANY', 'CUSTOM'] as const
export type HolidayType = (typeof HOLIDAY_TYPES)[number]

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  GOVT: 'Government',
  COMPANY: 'Company',
  CUSTOM: 'Custom',
}

/**
 * Curated Bangladesh public-holiday list (2026) offered as a one-click template
 * in Settings → Leave & Holidays. Dates follow the government calendar; lunar
 * festival dates (Eid) are the announced 2026 observances.
 */
export const BD_HOLIDAY_TEMPLATE: Array<{ name: string; month: number; day: number; days: number }> = [
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
]

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

/** local-midnight copy of a Date (holidays are whole days) */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Expand org holidays into a Set of local YYYY-MM-DD keys covering every date
 * inside each holiday range. Used for leave-day counting and attendance sync.
 */
export function holidayDateKeys(holidays: Array<{ startDate: Date; endDate: Date }>): Set<string> {
  const keys = new Set<string>()
  for (const h of holidays) {
    let cursor = startOfDay(h.startDate)
    const end = startOfDay(h.endDate)
    let guard = 0
    while (cursor <= end && guard < 400) {
      keys.add(localDateKey(cursor))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
      guard++
    }
  }
  return keys
}

/** local YYYY-MM-DD */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** weekday number 1=Mon..7=Sun */
export function weekdayNum(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/**
 * Count chargeable leave days in [start..end]: work days (policy) MINUS org
 * holidays. Returns 0 when the range contains no chargeable day (caller 422s).
 */
export function chargeableLeaveDays(
  start: Date,
  end: Date,
  workDays: number[],
  holidayKeys: Set<string>
): number {
  let cursor = startOfDay(start)
  const stop = startOfDay(end)
  let count = 0
  let guard = 0
  while (cursor <= stop && guard < 800) {
    if (workDays.includes(weekdayNum(cursor)) && !holidayKeys.has(localDateKey(cursor))) count++
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    guard++
  }
  return count
}

/**
 * Holiday context for an org: all holidays + parsed work days (weekly holidays).
 * One helper for /api/hr/holidays, leave routes, my/day and payroll.
 */
export async function holidayContext(orgId: string): Promise<{
  holidays: HolidayRow[]
  workDays: number[]
}> {
  const { getOrgPolicy } = await import('./policy')
  const [holidays, policy] = await Promise.all([
    db.holiday.findMany({ where: { orgId }, orderBy: { startDate: 'asc' } }),
    getOrgPolicy(orgId),
  ])
  return { holidays, workDays: parseWorkDays(policy.workDays) }
}
