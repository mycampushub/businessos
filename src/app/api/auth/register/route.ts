import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, body, str } from '@/lib/server/api'
import { hashPassword, createSession, setSessionCookie } from '@/lib/server/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST /api/auth/register — create account + session. */
export async function POST(req: NextRequest) {
  try {
    const data = await body<Record<string, unknown>>(req)
    const name = str(data.name, 'name', { max: 80 })
    const email = str(data.email, 'email', { max: 160 }).toLowerCase()
    const password = typeof data.password === 'string' ? data.password : ''

    if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address', 422)
    if (password.length < 8) return fail('Password must be at least 8 characters', 422)

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) return fail('An account with this email already exists', 409)

    // F3: one-shot email-verification token (no SMTP in sandbox — link surfaced in UI)
    const emailVerifyToken = randomUUID()
    const user = await db.user.create({
      data: { name, email, passwordHash: hashPassword(password), emailVerifyToken },
      select: {
        id: true, email: true, name: true, avatarUrl: true, headline: true,
        phone: true, location: true, bio: true, skills: true,
      },
    })

    const token = await createSession(user.id)
    await setSessionCookie(token)

    // SessionInfo shape (fresh user → no memberships yet, no active org → empty access map)
    // verifyUrl: surfaced in Settings → Security until real email delivery exists.
    return ok({ user, memberships: [], activeOrgId: null, access: {}, verifyUrl: `/api/auth/verify-email?token=${emailVerifyToken}` })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return fail(err instanceof Error ? err.message : 'Invalid request', status)
    console.error('[api:auth/register]', err)
    return fail('Internal server error', 500)
  }
}
