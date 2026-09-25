import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity, audit, notifyUsers, ApiError } from '@/lib/server/api'
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

    // 409 when this user already belongs to the org (checked BEFORE any user creation).
    if (user) {
      const alreadyMember = await db.membership.findFirst({
        where: { userId: user.id, orgId: org.id },
        select: { id: true },
      })
      if (alreadyMember) return fail('This user is already a member of your organization', 409)
    }

    // M14 fix: assert the seat limit BEFORE creating a temp user so an over-seat org
    // does not leave an orphaned User row behind when this throws 403.
    await assertSeatLimit(org.id)

    let tempPassword: string | undefined
    if (!user) tempPassword = generateTempPassword()

    // M14 fix: wrap user-creation + membership-creation in a transaction so a late
    // failure (e.g. a concurrent invite creating the same membership) rolls back
    // the temp user instead of orphaning it.
    const created = await db.$transaction(async (tx) => {
      let userId: string
      let userName: string
      let userEmail: string
      if (!user) {
        const createdUser = await tx.user.create({
          data: {
            email,
            name: name ?? nameFromEmail(email),
            passwordHash: hashPassword(tempPassword!),
            // MA-1 #9 fix: auto-verify invited users (sandbox — no SMTP). The C16 emailVerified
            // gate in withAuth would otherwise permanently lock them out of /app.
            emailVerified: new Date(),
          },
          select: { id: true, email: true, name: true },
        })
        userId = createdUser.id
        userName = createdUser.name
        userEmail = createdUser.email
      } else {
        userId = user.id
        userName = user.name
        userEmail = user.email
      }

      // re-check membership inside the transaction to handle the race where a
      // concurrent invite created the membership between our outer check and now.
      const raced = await tx.membership.findFirst({
        where: { userId, orgId: org.id },
        select: { id: true },
      })
      if (raced) throw new ApiError('This user is already a member of your organization', 409)

      const membership = await tx.membership.create({
        data: {
          userId,
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
      return { membership, userName, userEmail }
    })

    const { membership: createdMembership, userName, userEmail } = created

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'member.invited',
      entityType: 'MEMBERSHIP',
      entityId: createdMembership.id,
      message: `${userName} added to ${org.name} as ${role}`,
    })
    await audit({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'member.invited',
      entity: 'MEMBERSHIP',
      entityId: createdMembership.id,
      newValues: { userId: createdMembership.userId, email: userEmail, role, title, status: 'ACTIVE' },
      impersonatedBy: ctx.session?.impersonatedBy?.id ?? null, // MA-1 #8 fix
    })
    if (createdMembership.userId !== ctx.user.id) {
      await notifyUsers({
        orgId: org.id,
        userIds: [createdMembership.userId],
        type: 'SYSTEM',
        title: `You were added to ${org.name}`,
        body: `You now have ${role.charAt(0) + role.slice(1).toLowerCase()} access. Set up your profile to get started.`,
        module: 'profile',
      })
    }

    return ok({ membership: createdMembership, ...(tempPassword ? { tempPassword } : {}) }, 201)
  })(req)
}
