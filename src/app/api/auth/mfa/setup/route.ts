import { db } from '@/lib/db'
import { ok, fail, withAuth } from '@/lib/server/api'
import { generateTotpSecret, otpauthUrl } from '@/lib/server/totp'

/** POST /api/auth/mfa/setup (authenticated) — start enabling MFA.
 *  Generates + stores a TOTP secret; mfaEnabled stays false until
 *  POST /api/auth/mfa/verify proves the user can generate codes. */
export const POST = withAuth(async (_req, ctx) => {
  const user = await db.user.findUnique({
    where: { id: ctx.user.id },
    select: { mfaEnabled: true },
  })
  if (!user) return fail('Account not found', 404)
  if (user.mfaEnabled) return fail('Multi-factor authentication is already enabled — disable it first', 409)

  const secret = generateTotpSecret()
  await db.user.update({
    where: { id: ctx.user.id },
    data: { mfaSecret: secret, mfaEnabled: false },
  })

  return ok({ secret, otpauthUrl: otpauthUrl(ctx.user.email, secret) })
})
