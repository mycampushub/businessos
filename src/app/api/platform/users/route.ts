import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { requirePlatform, userItem } from '../guard'

/** ?limit=&offset= — bounded pagination (limit capped at 200). */
function pageParams(req: NextRequest): { take: number; skip: number } {
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '')
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '')
  return {
    take: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 200,
    skip: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
  }
}

// GET /api/platform/users?q=&limit=&offset= — platform-wide user directory
// (q filters name OR email, case-insensitive; SQLite LIKE is case-insensitive
// like the rest of the codebase). Result set is capped at 200 rows.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const { take, skip } = pageParams(req)
  const users = await db.user.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
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
