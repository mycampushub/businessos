import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { hashPassword } from '@/lib/server/auth'
import { checkRate, clientIp } from '@/lib/server/rate-limit'

// Anti-abuse: 10 requests per IP per 15 minutes (sliding window).
const RESET_RATE_LIMIT = 10
const RESET_RATE_WINDOW_MS = 15 * 60_000

/** POST /api/auth/reset-password — consume a one-shot reset token and set a new
 *  password. All existing sessions for the user are deleted so they must sign
 *  in again on every device (security: a password reset implies the old
 *  credentials — possibly compromised — must no longer grant access). */
export async function POST(req: NextRequest) {
  try {
    // Rate limit per IP — protects the token-consumption endpoint from
    // brute-force / spraying attempts.
    const ipRateKey = `reset-ip:${clientIp(req)}`
    const rate = checkRate(ipRateKey, RESET_RATE_LIMIT, RESET_RATE_WINDOW_MS)
    if (!rate.allowed) {
      const minutes = Math.max(1, Math.ceil(rate.retryAfterSec / 60))
      const res = fail(`Too many requests. Try again in ${minutes} minutes.`, 429)
      res.headers.set('Retry-After', String(rate.retryAfterSec))
      return res
    }

    const data = await body<Record<string, unknown>>(req)
    const token = str(data.token, 'token', { max: 160 })
    const password = typeof data.password === 'string' ? data.password : ''

    if (password.length < 8) return fail('Password must be at least 8 characters', 422)

    // passwordResetToken is not a @unique column → findFirst, not findUnique.
    const user = await db.user.findFirst({
      where: { passwordResetToken: token },
      select: { id: true, passwordResetExpires: true },
    })

    if (!user) return fail('Invalid or expired reset token', 400)

    const now = new Date()
    if (!user.passwordResetExpires || user.passwordResetExpires <= now) {
      return fail('Reset token has expired. Please request a new one.', 400)
    }

    // Update the password and clear the token (one-shot). All sessions are
    // deleted so the user must re-authenticate everywhere.
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    })

    await db.session.deleteMany({ where: { userId: user.id } })

    return ok({ message: 'Password reset successfully' })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/reset-password]', err)
    return fail('Internal server error', 500)
  }
}
