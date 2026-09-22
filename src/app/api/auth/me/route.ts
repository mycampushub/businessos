import { db } from '@/lib/db'
import { ok } from '@/lib/server/api'
import { getSessionUser } from '@/lib/server/auth'

/** GET /api/auth/me — current session info (user + memberships + activeOrgId).
 *  An anonymous visitor is a valid identity state, not an error: we answer
 *  200 + null instead of 401 so signed-out page loads don't paint red network
 *  errors in the browser console (the httpOnly session cookie cannot be
 *  pre-checked from JS). F3: user now carries emailVerified (ISO | null) +
 *  mfaEnabled, and the response adds a top-level verifyUrl while the account
 *  is still unverified (no SMTP in sandbox — the link is surfaced in Settings
 *  → Security). Additive fields only. */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return ok(null)

  let verifyUrl: string | null = null
  if (!session.user.emailVerified) {
    const row = await db.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerifyToken: true },
    })
    if (row?.emailVerifyToken) verifyUrl = `/api/auth/verify-email?token=${row.emailVerifyToken}`
  }

  return ok({ ...session, verifyUrl })
}
