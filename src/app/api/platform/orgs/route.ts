import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { requirePlatform, orgItem } from '../guard'

// GET /api/platform/orgs?q= — platform-wide tenant directory (q matches name/slug/industry)
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const orgs = await db.organization.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { industry: { contains: q } }] } : undefined,
    orderBy: { createdAt: 'desc' },
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
