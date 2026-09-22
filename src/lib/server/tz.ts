// ---------- F1 timezone helpers (org-timezone-aware date math) ----------
// The server runs UTC; every "local" date/time in attendance, leave, holiday and
// payroll math must instead use the ORG's timezone (Org.timezone, default
// 'Asia/Dhaka'). All functions are pure: no DB, no server-locale reads.

/** Fallback timezone — matches the Prisma default on Org.timezone. */
export const DEFAULT_TZ = 'Asia/Dhaka'

const validTz = new Set<string>([DEFAULT_TZ])

/** guards against invalid IANA zone names falling out of the DB (falls back to DEFAULT_TZ) */
function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ
  if (validTz.has(tz)) return tz
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    validTz.add(tz)
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

/** 'YYYY-MM-DD' of the given instant in the given timezone (en-CA yields ISO-ordered dates). */
export function localDateKey(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Offset (ms) of the timezone AT the given instant, computed via the formatToParts
 * trick: "as-if-UTC" local wall time minus the real UTC time. Positive east of UTC.
 */
function tzOffsetMs(d: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - d.getTime()
}

/**
 * UTC instant of local midnight for a 'YYYY-MM-DD' key in the given timezone.
 * Solves `midnight = naiveUtcMidnight − offset(midnight)` by fixed-point iteration
 * so DST jumps between midnight and noon are handled (converges in ≤ 3 passes).
 */
export function zonedStartUtc(dateKey: string, tz: string = DEFAULT_TZ): Date {
  const zone = safeTz(tz)
  const [y, m, d] = dateKey.split('-').map(Number)
  const naive = Date.UTC(y, (m ?? 1) - 1, d ?? 1)
  let ts = naive
  for (let i = 0; i < 3; i++) {
    const next = naive - tzOffsetMs(new Date(ts), zone)
    if (next === ts) break
    ts = next
  }
  return new Date(ts)
}

/** Local wall-clock minutes-of-day of the instant in the given timezone (0..1439). */
export function minutesSinceZonedMidnight(d: Date, tz: string = DEFAULT_TZ): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz),
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(d)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return (h % 24) * 60 + m
}

/** Local 'HH:MM' of the instant in the given timezone (log messages). */
export function zonedTime(d: Date, tz: string = DEFAULT_TZ): string {
  const mins = minutesSinceZonedMidnight(d, tz)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** Weekday (1=Mon..7=Sun) of a 'YYYY-MM-DD' key — anchored at noon UTC so it is locale-independent. */
export function weekdayOfDateKey(dateKey: string): number {
  return ((new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
}

/** Weekday (1=Mon..7=Sun) of the instant in the given timezone. */
export function zonedWeekday(d: Date, tz: string = DEFAULT_TZ): number {
  return weekdayOfDateKey(localDateKey(d, tz))
}

/** 'YYYY-MM-DD' key shifted by ±n days (pure calendar math — constructed as UTC, so deterministic). */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10)
}

/**
 * Calendar-date key of a STORED whole-day row (holiday / leave-request start & end).
 * Storage convention: the app writes these either as date-only values (UTC midnight)
 * or as timestamps whose UTC calendar date IS the intended org-local date (server runs
 * UTC) — e.g. a leave endDate stored at 18:00Z still means that UTC date. Extracting
 * the UTC date (NOT the org-tz date) keeps such edge timestamps on the right day;
 * live instants (check-in "now") must instead use localDateKey(d, orgTz).
 */
export function storedDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
