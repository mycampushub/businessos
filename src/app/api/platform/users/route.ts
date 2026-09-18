import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { requirePlatform, userItem } from '../guard'

// GET /api/platform/users?q= — platform-wide user directory (q filters name OR email,
// case-insensitive; SQLite LIKE is case-insensitive like the rest of the codebase)
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const users = await db.user.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : undefined,
    orderBy: { createdAt: 'desc' },
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

  return ok({ items: users.map((u) => userItem(u)) })
})
