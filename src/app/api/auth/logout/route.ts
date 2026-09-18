import { cookies } from 'next/headers'
import { ok } from '@/lib/server/api'
import { clearSession, SESSION_COOKIE } from '@/lib/server/auth'

/** POST /api/auth/logout — delete the DB session (if any) + clear cookies. */
export async function POST() {
  try {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    await clearSession(token)
    return ok({})
  } catch (err) {
    console.error('[api:auth/logout]', err)
    return ok({})
  }
}
