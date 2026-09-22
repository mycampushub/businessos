import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity, audit, notifyUsers } from '@/lib/server/api'
import { hashPassword } from '@/lib/server/auth'
import { assertSeatLimit } from '@/lib/server/billing'
import { ALL_ROLES } from '@/lib/roles'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 12-char random temporary password (safe base64url alphabet). */
function generateTempPassword(): string {
  return randomBytes(9).toString('base64url')
}

/** Derive a display name from an email local part (new.person@x.com → New Person). */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Member'
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
    .slice(0, 80)
}

/** POST /api/orgs/members — invite/add a member to the active organization.
 *  OWNER/ADMIN only. Existing users are linked directly; unknown emails get a
 *  new account with a temporary password (returned ONCE). OWNER can never be
 *  assigned here. */
export async function POST(req: NextRequest) {
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    requireRole(ctx, ['ADMIN'])

    const b = await body(req)
    const email = str(b.email, 'email', { max: 160 }).toLowerCase()
    const name = b.name === undefined || b.name === null || String(b.name).trim() === ''
      ? undefined
      : str(b.name, 'name', { required: false, max: 80 })
    const role = str(b.role, 'role', { max: 20 })
    const title = b.title === undefined || b.title === null || String(b.title).trim() === ''
      ? null
      : str(b.title, 'title', { required: false, max: 120 })

    if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address', 422)
    if (role === 'OWNER') return fail('The OWNER role cannot be assigned via invitations', 422)
    if (!(ALL_ROLES as readonly string[]).includes(role)) {
      return fail(`Role must be one of: ${ALL_ROLES.join(', ')}`, 422)
    }

    let user = await db.user.findFirst({
      where: { OR: [{ email }, { email: email.toLowerCase() }] },
      select: { id: true, email: true, name: true },
    })

    let tempPassword: string | undefined
    if (!user) {
      tempPassword = generateTempPassword()
      user = await db.user.create({
        data: {
          email,
          name: name ?? nameFromEmail(email),
          passwordHash: hashPassword(tempPassword),
        },
        select: { id: true, email: true, name: true },
      })
    }

    // 409 when this user already belongs to the org (checked before any mutation)
    const existing = await db.membership.findFirst({
      where: { userId: user.id, orgId: org.id },
      select: { id: true },
    })
    if (existing) return fail('This user is already a member of your organization', 409)

    // plan seat limit — throws ApiError(403) which withAuth renders as-is
    await assertSeatLimit(org.id)

    const created = await db.membership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role,
        title,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        userId: true,
        orgId: true,
        role: true,
        title: true,
        status: true,
        employmentType: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'member.invited',
      entityType: 'MEMBERSHIP',
      entityId: created.id,
      message: `${user.name} added to ${org.name} as ${role}`,
    })
    await audit({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'member.invited',
      entity: 'MEMBERSHIP',
      entityId: created.id,
      newValues: { userId: user.id, email: user.email, role, title, status: 'ACTIVE' },
    })
    if (user.id !== ctx.user.id) {
      await notifyUsers({
        orgId: org.id,
        userIds: [user.id],
        type: 'SYSTEM',
        title: `You were added to ${org.name}`,
        body: `You now have ${role.charAt(0) + role.slice(1).toLowerCase()} access. Set up your profile to get started.`,
        module: 'profile',
      })
    }

    return ok({ membership: created, ...(tempPassword ? { tempPassword } : {}) }, 201)
  })(req)
}
