import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../../../guard'
import { createSession, setSessionCookie } from '@/lib/server/auth'

// POST /api/platform/users/[id]/impersonate — SUPPORT SIGN-IN.
// The SaaS admin opens a real session AS the target member for support/debugging:
//   • a brand-new Session row marked impersonatedBy = admin userId (the banner reads it)
//   • the session cookie switches to it — the admin's own session row stays valid in DB
//   • every action is audit-logged; sign out returns to the normal login screen.
// Guards: target must exist, be ACTIVE, and NOT be a platform admin (support
// sessions are for member accounts); self-impersonation is a no-op 422.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const b = await body<{ reason?: unknown }>(req)
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 200) : null

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, status: true, platformAdmin: true },
    })
    if (!user) return fail('User not found', 404)
    if (user.id === ctx.user.id) return fail('You are already signed in', 422)
    if (user.status !== 'ACTIVE') return fail('Cannot open a support session for a suspended account', 422)
    if (user.platformAdmin) return fail('Support sign-in is for member accounts, not platform administrators', 422)

    // org-less accounts (e.g. job applicants) have no workspace to debug —
    // a support session would strand the admin on the onboarding screen.
    const firstMembership = await db.membership.findFirst({
      where: { userId: user.id, status: { not: 'ALUMNI' } },
      orderBy: { joinedAt: 'asc' },
      select: { orgId: true },
    })
    if (!firstMembership) return fail('This account has no organization workspace yet', 422)

    // H7-auth fix: support sessions get a 2-hour TTL (not the default 30 days) to limit
    // "god mode" exposure if the admin forgets to sign out.
    const SUPPORT_SESSION_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
    const token = await createSession(user.id, ctx.user.id, SUPPORT_SESSION_TTL_MS)
    await setSessionCookie(token)

    await platformAudit({
      orgId: firstMembership?.orgId ?? null,
      action: 'user.support_session_opened',
      entity: 'User',
      entityId: user.id,
      newValues: { by: ctx.user.name, target: user.email, reason },
    })

    return ok({
      signedInAs: { id: user.id, name: user.name, email: user.email },
      impersonatedBy: { id: ctx.user.id, name: ctx.user.name },
    })
  })(req)
}
