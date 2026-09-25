import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { verifyPassword, createSession, setSessionCookie, getSessionUser } from '@/lib/server/auth'
import { verifyTotp } from '@/lib/server/totp'
import { decryptSecret } from '@/lib/server/crypto'
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
 *  (no intermediate session or challenge token exists). Same rate bucket as /login.
 *  M14-auth fix: the stored TOTP secret is decrypted before verification. */
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
    // M14-auth: decrypt the stored ciphertext before verifying the TOTP code.
    // A decrypt failure (corrupted row / key rotation in progress) is treated as
    // "Invalid verification code" — same surface as the verify/disable routes.
    let plaintextSecret: string
    try {
      plaintextSecret = decryptSecret(user.mfaSecret)
    } catch {
      return fail('Invalid verification code', 401)
    }
    if (!verifyTotp(plaintextSecret, code, { window: 1 })) {
      return fail('Invalid verification code', 401)
    }

    resetRate(rateKey)

    const token = await createSession(user.id)
    await setSessionCookie(token)
    // M11-auth fix: kill every OTHER session for this user on a fresh MFA login
    // (same "log out other devices" semantics as the regular login route).
    await db.session.deleteMany({ where: { userId: user.id, NOT: { id: token } } }).catch(() => {})

    // Resolve AFTER the session cookie is set so the fresh session is visible.
    return ok(await getSessionUser())
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/login/mfa]', err)
    return fail('Internal server error', 500)
  }
}
