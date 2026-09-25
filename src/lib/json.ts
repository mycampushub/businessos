/**
 * M20-db fix: Centralized JSON-as-String field parser.
 *
 * Many fields in the Prisma schema are stored as String (JSON or CSV) because
 * Cloudflare D1 / SQLite has limited type support. Each callsite previously
 * did `JSON.parse(field)` ad-hoc, which would throw on malformed input and
 * crash the reader. This helper provides a safe fallback.
 *
 * Usage:
 *   const items = parseJsonField<InvoiceItem[]>(invoice.items, [])
 *   const breakdown = parseJsonField<PayslipBreakdown[]>(payslip.breakdown, [])
 */

export function parseJsonField<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    const parsed = JSON.parse(s)
    return parsed as T
  } catch {
    return fallback
  }
}

/** Parse a CSV string into a trimmed array of non-empty values. */
export function parseCsvField(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}
