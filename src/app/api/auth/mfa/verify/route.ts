import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str } from '@/lib/server/api'
import { verifyTotp } from '@/lib/server/totp'
import { decryptSecret } from '@/lib/server/crypto'
import { checkRate, clientIp } from '@/lib/server/rate-limit'

/** POST /api/auth/mfa/verify {code} (authenticated) — confirm MFA enrollment.
 *  Verifies a code against the stored pending secret and switches mfaEnabled on.
 *  The secret is kept (it is the live login secret); nothing is cleared.
 *  H4-auth fix: revokes all OTHER sessions for the user so any pre-MFA hijacked session
 *  is killed — the attacker must now pass MFA on their next login.
 *  M9-auth fix: rate-limited to 5/15min per user+IP to prevent TOTP code brute-force.
 *  M14-auth fix: the stored secret is decrypted before TOTP verification. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  // M9-auth fix: rate limit MFA verify (TOTP code brute-force protection)
  const ip = clientIp(req)
  const rl = checkRate(`mfa-verify:${ctx.user.id}|${ip}`, 5, 15 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many verification attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const data = await body<Record<string, unknown>>(req)
  const code = str(data.code, 'code', { max: 16 })

  const user = await db.user.findUnique({
    where: { id: ctx.user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  })
  if (!user) return fail('Account not found', 404)
  if (user.mfaEnabled) return fail('Multi-factor authentication is already enabled', 409)
  if (!user.mfaSecret) return fail('No pending MFA setup — call POST /api/auth/mfa/setup first', 400)

  // M14-auth: decrypt the stored ciphertext before verifying the TOTP code.
  // A decrypt failure (tampering / wrong key) is treated as "invalid code" so we
  // don't leak that the secret is unreadable — the user just retries.
  let plaintextSecret: string
  try {
    plaintextSecret = decryptSecret(user.mfaSecret)
  } catch {
    return fail('Invalid verification code — make sure your authenticator clock is correct', 401)
  }
  if (!verifyTotp(plaintextSecret, code, { window: 1 })) {
    return fail('Invalid verification code — make sure your authenticator clock is correct', 401)
  }

  await db.user.update({
    where: { id: ctx.user.id },
    data: { mfaEnabled: true },
  })

  // H4-auth fix: kill all sessions except the current one
  const currentToken = (await (await import('next/headers')).cookies()).get('orgos_session')?.value
  if (currentToken) {
    await db.session.deleteMany({
      where: { userId: ctx.user.id, NOT: { id: currentToken } },
    }).catch(() => {})
  }

  return ok({ mfaEnabled: true })
})
