import type { NextRequest } from 'next/server'

// ---------- in-memory sliding-window rate limiter (no external deps) ----------
//
// Process-local store: sufficient for the single-node sandbox dev server (and for
// one Cloudflare Worker isolate as a soft limit). Keys are namespaced by call site,
// e.g. `login:${email}|${ip}`.

interface RateResult {
  allowed: boolean
  /** seconds until the oldest hit leaves the window (0 when allowed) */
  retryAfterSec: number
}

const buckets = new Map<string, number[]>()

/** Lazy sweep cadence — old timestamps are dropped periodically on access. */
const SWEEP_INTERVAL_MS = 5 * 60_000
/** Horizon: no caller uses a window longer than this, so anything older is dead. */
const SWEEP_HORIZON_MS = 60 * 60_000
/** Memory safety valve — pathological key cardinality resets the store. */
const MAX_KEYS = 50_000

let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS && buckets.size < MAX_KEYS) return
  lastSweep = now
  if (buckets.size >= MAX_KEYS) {
    buckets.clear()
    return
  }
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < SWEEP_HORIZON_MS)
    if (alive.length === 0) buckets.delete(key)
    else if (alive.length !== hits.length) buckets.set(key, alive)
  }
}

/** Sliding window: an attempt is recorded ONLY when it is allowed through.
 *  Rejected attempts do not extend the window. */
export function checkRate(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now()
  sweep(now)

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    const retryAfterMs = Math.max(hits[0] + windowMs - now, 1_000)
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { allowed: true, retryAfterSec: 0 }
}

/** Drop a key's history entirely — call on full success (e.g. completed login). */
export function resetRate(key: string) {
  buckets.delete(key)
}

// ---------- login key helpers ----------

/** Client IP: first value of x-forwarded-for, falling back to 'local'. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return 'local'
}

/** Per-identity login bucket key: `login:email|ip`. */
export function loginRateKey(email: string, ip: string): string {
  return `login:${email}|${ip}`
}

// ---------- shared login policy ----------

export const LOGIN_RATE_LIMIT = 5
export const LOGIN_RATE_WINDOW_MS = 15 * 60_000
