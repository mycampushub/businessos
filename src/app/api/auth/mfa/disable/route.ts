import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str } from '@/lib/server/api'
import { verifyPassword } from '@/lib/server/auth'
import { verifyTotp } from '@/lib/server/totp'
import { decryptSecret } from '@/lib/server/crypto'
import { checkRate, clientIp } from '@/lib/server/rate-limit'

/** POST /api/auth/mfa/disable {password, code} (authenticated) — turn MFA off.
 *  Requires a fresh password proof AND a currently-valid TOTP code.
 *  M9-auth fix: rate-limited to 5/15min per user+IP to prevent password-spray + TOTP brute-force.
 *  M14-auth fix: the stored secret is decrypted before TOTP verification. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  // M9-auth fix: rate limit MFA disable (password + TOTP brute-force protection)
  const ip = clientIp(req)
  const rl = checkRate(`mfa-disable:${ctx.user.id}|${ip}`, 5, 15 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many disable attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const data = await body<Record<string, unknown>>(req)
  const password = typeof data.password === 'string' ? data.password : ''
  const code = str(data.code, 'code', { max: 16 })

  const user = await db.user.findUnique({
    where: { id: ctx.user.id },
    select: { passwordHash: true, mfaSecret: true, mfaEnabled: true },
  })
  if (!user) return fail('Account not found', 404)
  if (!user.mfaEnabled) return fail('Multi-factor authentication is not enabled', 400)

  if (!password || !verifyPassword(password, user.passwordHash)) {
    return fail('Invalid password', 401)
  }
  // M14-auth: decrypt the stored ciphertext before verifying the TOTP code.
  if (!user.mfaSecret) return fail('Invalid verification code', 401)
  let plaintextSecret: string
  try {
    plaintextSecret = decryptSecret(user.mfaSecret)
  } catch {
    return fail('Invalid verification code', 401)
  }
  if (!verifyTotp(plaintextSecret, code, { window: 1 })) {
    return fail('Invalid verification code', 401)
  }

  await db.user.update({
    where: { id: ctx.user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  })

  // H4-auth fix: revoke all OTHER sessions so any stolen session from before is killed
  const currentToken = (await (await import('next/headers')).cookies()).get('orgos_session')?.value
  if (currentToken) {
    await db.session.deleteMany({
      where: { userId: ctx.user.id, NOT: { id: currentToken } },
    }).catch(() => {})
  }

  return ok({ mfaEnabled: false })
})
