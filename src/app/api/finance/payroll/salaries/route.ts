import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { salariesInclude, salaryItem } from '../payroll-helpers'

// GET /api/finance/payroll/salaries — ACTIVE members with salary info (name asc), finance-payroll VIEW
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'finance-payroll', 'view')
  if (denied) return denied

  const members = await db.membership.findMany({
    where: { orgId: org.id, status: 'ACTIVE' },
    include: salariesInclude,
    orderBy: { user: { name: 'asc' } },
  })
  return ok({ items: members.map(salaryItem) })
})
