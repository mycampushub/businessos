import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, oneOf, logActivity } from '@/lib/server/api'
import { requirePlatform, platformAudit, userItem, type UserRow } from '../../guard'

const USER_ACTIONS = ['suspend', 'activate', 'grant-admin', 'revoke-admin'] as const

// PATCH /api/platform/users/[id] — suspend / activate / grant-admin / revoke-admin
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const denied = requirePlatform(ctx)
    if (denied) return denied

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        status: true,
        platformAdmin: true,
        createdAt: true,
        memberships: { select: { status: true, orgId: true, org: { select: { name: true } } }, orderBy: { joinedAt: 'asc' } },
      },
    })
    if (!user) return fail('User not found', 404)

    const b = await body<{ action?: unknown }>(req)
    const action = oneOf(b.action, USER_ACTIONS)

    // ---- T5: platform administrator role management ----
    if (action === 'grant-admin' || action === 'revoke-admin') {
      if (user.id === ctx.user.id) {
        return fail('You cannot change your own platform admin role', 422)
      }
      const making = action === 'grant-admin'
      if (making && user.status !== 'ACTIVE') {
        return fail('Suspended accounts cannot become platform administrators', 422)
      }
      if (!making) {
        // never strand the console: the LAST platform admin cannot be demoted
        const adminCount = await db.user.count({ where: { platformAdmin: true, status: 'ACTIVE' } })
        if (adminCount <= 1) return fail('At least one platform administrator must remain', 422)
      }
      const updated = await db.user.update({
        where: { id: user.id },
        data: { platformAdmin: making },
      })
      if (!making) {
        // revoked admins lose console access immediately
        await db.session.deleteMany({ where: { userId: user.id } })
      }
      await platformAudit({
        orgId: user.memberships[0]?.orgId ?? null,
        action: making ? 'user.platform_admin_granted' : 'user.platform_admin_revoked',
        entity: 'User',
        entityId: user.id,
        newValues: { platformAdmin: making },
      })
      const item: UserRow = {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
        status: updated.status,
        platformAdmin: updated.platformAdmin,
        createdAt: updated.createdAt,
        memberships: user.memberships,
      }
      return ok(userItem(item))
    }

    if (action === 'suspend') {
      if (user.id === ctx.user.id) return fail('You cannot suspend your own account', 422)
      if (user.platformAdmin) return fail('Cannot suspend another platform administrator', 422)
    }

    const status = action === 'suspend' ? 'SUSPENDED' : 'ACTIVE'
    const updated = await db.user.update({ where: { id: user.id }, data: { status } })

    if (action === 'suspend') {
      // immediate lockout — Session.id IS the token; kill every session of the user
      await db.session.deleteMany({ where: { userId: user.id } })
    }

    // Audit row against the AFFECTED org (user's first membership) when one exists;
    // org-less users cannot have an AuditLog row (orgId is required) — skipped + logged.
    const auditAction = action === 'suspend' ? 'user.suspended' : 'user.activated'
    const firstOrgId = user.memberships[0]?.orgId ?? null
    await platformAudit({
      orgId: firstOrgId,
      action: auditAction,
      entity: 'User',
      entityId: user.id,
      newValues: { status },
    })
    if (firstOrgId) {
      await logActivity({
        orgId: firstOrgId,
        actorMembershipId: null,
        action: auditAction,
        entityType: 'USER',
        entityId: user.id,
        message: `Platform administration ${action === 'suspend' ? 'suspended' : 'reactivated'} ${user.name}`,
      })
    }

    const item: UserRow = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
      status: updated.status,
      platformAdmin: updated.platformAdmin,
      createdAt: updated.createdAt,
      memberships: user.memberships,
    }
    return ok(userItem(item))
  })(req)
}
