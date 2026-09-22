import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str } from '@/lib/server/api'
import { verifyTotp } from '@/lib/server/totp'

/** POST /api/auth/mfa/verify {code} (authenticated) — confirm MFA enrollment.
 *  Verifies a code against the stored pending secret and switches mfaEnabled on.
 *  The secret is kept (it is the live login secret); nothing is cleared. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const data = await body<Record<string, unknown>>(req)
  const code = str(data.code, 'code', { max: 16 })

  const user = await db.user.findUnique({
    where: { id: ctx.user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  })
  if (!user) return fail('Account not found', 404)
  if (user.mfaEnabled) return fail('Multi-factor authentication is already enabled', 409)
  if (!user.mfaSecret) return fail('No pending MFA setup — call POST /api/auth/mfa/setup first', 400)

  if (!verifyTotp(user.mfaSecret, code, { window: 1 })) {
    return fail('Invalid verification code — make sure your authenticator clock is correct', 401)
  }

  await db.user.update({
    where: { id: ctx.user.id },
    data: { mfaEnabled: true },
  })

  return ok({ mfaEnabled: true })
})
