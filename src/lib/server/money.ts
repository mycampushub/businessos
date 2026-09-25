/**
 * C7 fix: Money conversion helpers.
 *
 * All 21 money fields in the Prisma schema are now stored as Int (cents) instead of
 * Float (dollars/taka) to eliminate IEEE-754 rounding drift. The API boundary converts:
 *   - on READ: fromCents(dbValue) → dollars (for the JSON response + frontend display)
 *   - on WRITE: toCents(inputValue) → cents (for DB storage)
 *
 * The frontend never sees cents — it continues to work with dollar/taka floats.
 *
 * Convention: 1 taka = 100 cents. All amounts are non-negative integers ≥ 0.
 */

/** Convert a dollar/taka amount (float) to cents (int) for DB storage. */
export function toCents(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null
  return Math.round(n * 100)
}

/** Convert cents (int) from the DB to a dollar/taka amount (float) for API responses. */
export function fromCents(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null
  return Math.round(n) / 100
}

/** Like fromCents but returns 0 for null/undefined (for sums/aggregates). */
export function fromCents0(n: number | null | undefined): number {
  if (n === null || n === undefined) return 0
  return Math.round(n) / 100
}

/** Round to 2 decimal places (for display after fromCents). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
