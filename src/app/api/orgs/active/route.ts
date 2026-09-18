import { NextRequest } from 'next/server'
import { ok, fail, body, str, withAuth } from '@/lib/server/api'
import { setActiveOrgCookie } from '@/lib/server/auth'

/** POST /api/orgs/active — switch the user's active organization. */
export async function POST(req: NextRequest) {
  return withAuth(async (req, ctx) => {
    const data = await body<Record<string, unknown>>(req)
    const orgId = str(data.orgId, 'orgId')

    const membership = ctx.memberships.find((m) => m.orgId === orgId)
    if (!membership) return fail('You are not a member of this organization', 403)
    if (membership.org.status === 'SUSPENDED') {
      return fail('Organization suspended', 403)
    }

    await setActiveOrgCookie(orgId)
    return ok({ orgId })
  })(req)
}
