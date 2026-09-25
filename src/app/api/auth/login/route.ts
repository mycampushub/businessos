import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { verifyPassword, createSession, setSessionCookie, getSessionUser } from '@/lib/server/auth'
import {
  checkRate,
  resetRate,
  clientIp,
  loginRateKey,
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_MS,
} from '@/lib/server/rate-limit'

/** POST /api/auth/login — rate-limited credential check.
 *  MFA-enabled accounts get ok({ mfaRequired: true }) and NO session here;
 *  completion happens at POST /api/auth/login/mfa (stateless — client resends credentials). */
export async function POST(req: NextRequest) {
  try {
    const data = await body<Record<string, unknown>>(req)
    const email = str(data.email, 'email', { max: 160 }).toLowerCase()
    const password = typeof data.password === 'string' ? data.password : ''

    // brute-force gate: 5 attempts / 15 min per email|ip (sliding window)
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

    // MFA step-up: password is proven, but the session is only issued after a valid TOTP code.
    if (user.mfaEnabled) {
      return ok({ mfaRequired: true })
    }

    resetRate(rateKey)

    const token = await createSession(user.id)
    await setSessionCookie(token)
    // M11-auth fix: kill every OTHER session for this user on a fresh login so a
    // stolen-credential login invalidates the legitimate user's prior devices
    // (and vice versa) — "log out other devices" semantics on each login.
    await db.session.deleteMany({ where: { userId: user.id, NOT: { id: token } } }).catch(() => {})

    // Resolve AFTER the session cookie is set so the fresh session is visible.
    return ok(await getSessionUser())
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/login]', err)
    return fail('Internal server error', 500)
  }
}
