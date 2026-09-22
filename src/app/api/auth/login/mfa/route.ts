import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { verifyPassword, createSession, setSessionCookie, getSessionUser } from '@/lib/server/auth'
import { verifyTotp } from '@/lib/server/totp'
import {
  checkRate,
  resetRate,
  clientIp,
  loginRateKey,
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_MS,
} from '@/lib/server/rate-limit'

/** POST /api/auth/login/mfa — complete an MFA login.
 *  Stateless by design: the client resends email+password alongside the TOTP code
 *  (no intermediate session or challenge token exists). Same rate bucket as /login. */
export async function POST(req: NextRequest) {
  try {
    const data = await body<Record<string, unknown>>(req)
    const email = str(data.email, 'email', { max: 160 }).toLowerCase()
    const password = typeof data.password === 'string' ? data.password : ''
    const code = str(data.code, 'code', { max: 16 })

    // same brute-force gate as /login — code guessing burns the same budget
    const rateKey = loginRateKey(email, clientIp(req))
    const rate = checkRate(rateKey, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS)
    if (!rate.allowed) {
      const minutes = Math.max(1, Math.ceil(rate.retryAfterSec / 60))
      const res = fail(`Too many attempts. Try again in ${minutes} minutes.`, 429)
      res.headers.set('Retry-After', String(rate.retryAfterSec))
      return res
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail('Invalid email or password', 401)
    }
    if (user.status === 'SUSPENDED') {
      return fail('Account suspended. Contact platform support.', 403)
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      return fail('Multi-factor authentication is not enabled for this account', 400)
    }
    if (!verifyTotp(user.mfaSecret, code, { window: 1 })) {
      return fail('Invalid verification code', 401)
    }

    resetRate(rateKey)

    const token = await createSession(user.id)
    await setSessionCookie(token)

    // Resolve AFTER the session cookie is set so the fresh session is visible.
    return ok(await getSessionUser())
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/login/mfa]', err)
    return fail('Internal server error', 500)
  }
}
