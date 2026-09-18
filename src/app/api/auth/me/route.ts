import { ok, fail } from '@/lib/server/api'
import { getSessionUser } from '@/lib/server/auth'

/** GET /api/auth/me — current session info (user + memberships + activeOrgId). */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return fail('Not authenticated', 401)
  return ok(session)
}
