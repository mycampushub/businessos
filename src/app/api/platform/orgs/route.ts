import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { requirePlatform, orgItem } from '../guard'

/** ?limit=&offset= — bounded pagination (limit capped at 200). */
function pageParams(req: NextRequest): { take: number; skip: number } {
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '')
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '')
  return {
    take: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 200,
    skip: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
  }
}

// GET /api/platform/orgs?q=&limit=&offset= — platform-wide tenant directory
// (q matches name/slug/industry). Result set is capped at 200 rows.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const { take, skip } = pageParams(req)
  const orgs = await db.organization.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { industry: { contains: q } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      industry: true,
      plan: true,
      status: true,
      currency: true,
      createdAt: true,
      ownerId: true,
    },
  })

  const items = await Promise.all(orgs.map((o) => orgItem(o)))
  return ok({ items })
})
