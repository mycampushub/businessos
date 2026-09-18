import { db } from '@/lib/db'
import type { OrgPolicy } from '@prisma/client'

// ---------- T3 org policy (attendance/payroll rules) ----------
// getOrgPolicy(orgId) returns the org's policy row, upserting defaults on first read.

export async function getOrgPolicy(orgId: string): Promise<OrgPolicy> {
  const existing = await db.orgPolicy.findUnique({ where: { orgId } })
  if (existing) return existing
  // First read → create with schema defaults (09:00 / 17:30 / 15 / 240 / 480 / "1,2,3,4,5" / false / 28)
  return db.orgPolicy.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  })
}

/** "1,2,3,4,5" (or any CSV) → [1,2,3,4,5] — valid weekday numbers only, deduped, sorted. */
export function parseWorkDays(csvStr: string | null | undefined): number[] {
  const seen = new Set<number>()
  for (const part of (csvStr ?? '').split(',')) {
    const n = Number(part.trim())
    if (Number.isInteger(n) && n >= 1 && n <= 7) seen.add(n)
  }
  return [...seen].sort((a, b) => a - b)
}

/** "09:30" → 570 (minutes since midnight). Invalid input → NaN. */
export function minutesFromHHMM(s: string | null | undefined): number {
  if (typeof s !== 'string' || !s.includes(':')) return NaN
  const [h, m] = s.split(':')
  const hh = Number(h)
  const mm = Number(m)
  return hh * 60 + mm
}

/** Strict HH:MM (00:00..23:59) validation. */
export function isValidHHMM(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}
