import { randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { accessForUser, type AccessLevel } from './access'

export const SESSION_COOKIE = 'orgos_session'
export const ACTIVE_ORG_COOKIE = 'orgos_org'
const SESSION_DAYS = 30

// ---------- password hashing (scrypt, no external deps) ----------

export function hashPassword(password: string): string {
  const salt = randomUUID().replace(/-/g, '')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(':')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ---------- sessions ----------

export interface SessionInfo {
  user: { id: string; email: string; name: string; avatarUrl: string | null; headline: string | null; phone: string | null; location: string | null; bio: string | null; skills: string | null; platformAdmin: boolean; status: string }
  memberships: Array<{
    id: string; role: string; title: string | null; orgId: string; status: string
    org: { id: string; name: string; slug: string; logoUrl: string | null; currency: string; plan: string; status: string }
  }>
  activeOrgId: string | null
  /** T3: module access map for the ACTIVE org's role ({} when no active org) */
  access: Record<string, AccessLevel>
  /** T5: present when this is a platform-admin SUPPORT session — { id, name } of the admin */
  session: { impersonatedBy: { id: string; name: string } | null } | null
}

export async function createSession(userId: string, impersonatedBy?: string): Promise<string> {
  const token = randomUUID() + randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({ data: { id: token, userId, expiresAt, impersonatedBy: impersonatedBy ?? null } })
  return token
}

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function clearSession(token?: string) {
  if (token) await db.session.deleteMany({ where: { id: token } })
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  jar.delete(ACTIVE_ORG_COOKIE)
}

export async function getActiveOrgId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(ACTIVE_ORG_COOKIE)?.value ?? null
}

export async function setActiveOrgCookie(orgId: string) {
  const jar = await cookies()
  jar.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function getSessionUser(): Promise<SessionInfo | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { id: token },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, avatarUrl: true, headline: true,
          phone: true, location: true, bio: true, skills: true, platformAdmin: true, status: true,
        },
      },
    },
  })
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id: token } }).catch(() => {})
    return null
  }

  // Platform moderation: suspended accounts lose access immediately (all sessions killed).
  if (session.user.status === 'SUSPENDED') {
    await db.session.deleteMany({ where: { userId: session.user.id } }).catch(() => {})
    return null
  }

  const memberships = await db.membership.findMany({
    where: { userId: session.user.id, status: { not: 'ALUMNI' } },
    select: {
      id: true, role: true, title: true, orgId: true, status: true,
      org: { select: { id: true, name: true, slug: true, logoUrl: true, currency: true, plan: true, status: true } },
    },
    orderBy: { joinedAt: 'asc' },
  })

  const activeOrgId = await getActiveOrgId()
  const resolvedOrgId = memberships.some((m) => m.orgId === activeOrgId) ? activeOrgId : memberships[0]?.orgId ?? null
  const activeMembership = resolvedOrgId ? memberships.find((m) => m.orgId === resolvedOrgId) ?? null : null
  const orgSuspended = activeMembership?.org.status === 'SUSPENDED'
  const access = await accessForUser(session.user, activeMembership ? { orgId: activeMembership.orgId, role: activeMembership.role } : null)

  // T5: support-session marker — resolve the platform admin behind the impersonation
  let impersonatedBy: { id: string; name: string } | null = null
  if (session.impersonatedBy) {
    const admin = await db.user.findUnique({
      where: { id: session.impersonatedBy },
      select: { id: true, name: true },
    })
    impersonatedBy = admin ? { id: admin.id, name: admin.name } : { id: session.impersonatedBy, name: 'Platform admin' }
  }

  return {
    user: session.user,
    memberships,
    // A suspended org exposes no active workspace (memberships stay listed for context).
    activeOrgId: activeMembership && !orgSuspended ? resolvedOrgId : null,
    access: activeMembership && !orgSuspended ? access : {},
    session: { impersonatedBy },
  }
}
