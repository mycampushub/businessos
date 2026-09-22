import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth } from '@/lib/server/api'
import { requirePlatform } from '../guard'
import { billingRequestInclude, billingRequestItem } from '@/lib/server/billing'

/** GET /api/platform/billing-requests?status= — tenant-initiated plan requests
 *  (newest first, capped at 200) with org, plan and requester context. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  const status = req.nextUrl.searchParams.get('status')?.trim().toUpperCase() || undefined
  const where =
    status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : undefined

  const items = await db.billingRequest.findMany({
    where,
    include: billingRequestInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return ok({ items: items.map(billingRequestItem) })
})
