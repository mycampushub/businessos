import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { verifyPassword, createSession, setSessionCookie, getSessionUser } from '@/lib/server/auth'

/** POST /api/auth/login — verify credentials, open session, return SessionInfo. */
export async function POST(req: NextRequest) {
  try {
    const data = await body<Record<string, unknown>>(req)
    const email = str(data.email, 'email', { max: 160 }).toLowerCase()
    const password = typeof data.password === 'string' ? data.password : ''

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail('Invalid email or password', 401)
    }
    if (user.status === 'SUSPENDED') {
      return fail('Account suspended. Contact platform support.', 403)
    }

    const token = await createSession(user.id)
    await setSessionCookie(token)

    // Resolve AFTER the session cookie is set so the fresh session is visible.
    return ok(await getSessionUser())
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/login]', err)
    return fail('Internal server error', 500)
  }
}
