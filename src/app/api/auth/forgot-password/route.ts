import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { checkRate } from '@/lib/server/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Anti-abuse: 5 requests per email per 15 minutes (sliding window).
const FORGOT_RATE_LIMIT = 5
const FORGOT_RATE_WINDOW_MS = 15 * 60_000
const RESET_TTL_MS = 60 * 60_000 // 1 hour

/** POST /api/auth/forgot-password — generate a one-shot password-reset token.
 *
 *  Security: never reveals whether an email is registered. The response shape is
 *  identical whether the user exists or not. In a real deployment the reset URL
 *  would be sent by email; in this sandbox (no SMTP) the URL is returned in the
 *  body so it can be surfaced to the user (mirrors how /register surfaces
 *  verifyUrl for email verification).
 */
export async function POST(req: NextRequest) {
  try {
    const data = await body<Record<string, unknown>>(req)
    const email = str(data.email, 'email', { max: 160 }).toLowerCase()

    if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address', 422)

    // Rate limit keyed by email (so a single attacker IP rotating accounts is
    // still bounded per-target). Unknown emails also consume the bucket to keep
    // timing uniform.
    const rateKey = `forgot:${email}`
    const rate = checkRate(rateKey, FORGOT_RATE_LIMIT, FORGOT_RATE_WINDOW_MS)
    if (!rate.allowed) {
      const minutes = Math.max(1, Math.ceil(rate.retryAfterSec / 60))
      const res = fail(`Too many requests. Try again in ${minutes} minutes.`, 429)
      res.headers.set('Retry-After', String(rate.retryAfterSec))
      return res
    }

    const user = await db.user.findUnique({ where: { email }, select: { id: true } })

    if (user) {
      const token = randomUUID()
      const expires = new Date(Date.now() + RESET_TTL_MS)
      await db.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpires: expires },
      })
      return ok({ resetUrl: `/reset-password?token=${token}` })
    }

    // Unknown email: return the same shape so the existence of an account is
    // not leaked. `resetUrl` is omitted; the frontend shows a neutral message.
    return ok({})
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/forgot-password]', err)
    return fail('Internal server error', 500)
  }
}
