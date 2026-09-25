import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body } from '@/lib/server/api'
import { verifyPassword } from '@/lib/server/auth'
import { generateTotpSecret, otpauthUrl } from '@/lib/server/totp'
import { encryptSecret } from '@/lib/server/crypto'
import { checkRate, clientIp } from '@/lib/server/rate-limit'

/** POST /api/auth/mfa/setup {password} (authenticated) — start enabling MFA.
 *  H5-auth fix: requires fresh password re-proof to prevent a session hijacker from
 *  enrolling MFA under their own TOTP secret (which would lock out the legitimate user).
 *  M9-auth fix: rate-limited to 5/15min per user+IP to prevent brute-force on the password re-proof.
 *  M14-auth fix: the TOTP secret is encrypted at rest (AES-256-GCM) — only the
 *  plaintext secret + otpauthUrl are returned to the caller (so the QR works),
 *  the DB column stores the ciphertext.
 *  Generates + stores a TOTP secret; mfaEnabled stays false until
 *  POST /api/auth/mfa/verify proves the user can generate codes. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  // M9-auth fix: rate limit MFA setup
  const ip = clientIp(req)
  const rl = checkRate(`mfa-setup:${ctx.user.id}|${ip}`, 5, 15 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many MFA setup attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const data = await body<Record<string, unknown>>(req)
  const password = typeof data.password === 'string' ? data.password : ''

  const user = await db.user.findUnique({
    where: { id: ctx.user.id },
    select: { passwordHash: true, mfaEnabled: true },
  })
  if (!user) return fail('Account not found', 404)
  if (user.mfaEnabled) return fail('Multi-factor authentication is already enabled — disable it first', 409)

  // H5-auth fix: password re-proof prevents session-hijack MFA enrollment
  if (!password || !verifyPassword(password, user.passwordHash)) {
    return fail('Invalid password', 401)
  }

  const secret = generateTotpSecret()
  // M14-auth: store only the ciphertext; return the plaintext + otpauthUrl to the
  // caller so the QR code can be rendered this once.
  await db.user.update({
    where: { id: ctx.user.id },
    data: { mfaSecret: encryptSecret(secret), mfaEnabled: false },
  })

  return ok({ secret, otpauthUrl: otpauthUrl(ctx.user.email, secret) })
})
