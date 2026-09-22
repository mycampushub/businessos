import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str } from '@/lib/server/api'
import { verifyPassword } from '@/lib/server/auth'
import { verifyTotp } from '@/lib/server/totp'

/** POST /api/auth/mfa/disable {password, code} (authenticated) — turn MFA off.
 *  Requires a fresh password proof AND a currently-valid TOTP code. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
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
  if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code, { window: 1 })) {
    return fail('Invalid verification code', 401)
  }

  await db.user.update({
    where: { id: ctx.user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  })

  return ok({ mfaEnabled: false })
})
