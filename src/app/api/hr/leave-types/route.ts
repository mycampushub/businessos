import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

type LeaveTypeRow = {
  id: string
  name: string
  daysPerYear: number
  color: string | null
  paid: boolean
  _count: { leaveRequests: number }
}

function mapItem(lt: LeaveTypeRow) {
  return {
    id: lt.id,
    name: lt.name,
    daysPerYear: lt.daysPerYear,
    color: lt.color,
    paid: lt.paid,
    requestCount: lt._count.leaveRequests,
  }
}

function optColor(v: unknown): string | null | 'invalid' | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return 'invalid'
  const s = v.trim()
  return s === '' ? null : s.slice(0, 20)
}

function optBool(v: unknown): boolean | 'invalid' | undefined {
  if (v === undefined) return undefined
  return typeof v === 'boolean' ? v : 'invalid'
}

function optDaysPerYear(v: unknown): number | 'invalid' | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 1 || n > 365) return 'invalid'
  return n
}

const INCLUDE = { _count: { select: { leaveRequests: true } } } as const

/** GET /api/hr/leave-types — { items: [{id, name, daysPerYear, color, paid, requestCount}] } (hr-leave view). */
export const GET = withAuth(async (_req, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'hr-leave', 'view')
  if (denied) return denied

  const rows = await db.leaveType.findMany({
    where: { orgId: org.id },
    orderBy: { name: 'asc' }, // LeaveType has no createdAt — name asc matches /api/hr/leave
    include: INCLUDE,
  })
  return ok({ items: rows.map(mapItem) })
})

/** POST /api/hr/leave-types — {name*, daysPerYear? 1..365, color?, paid?} (hr-leave full; OWNER/ADMIN/HR). */
export const POST = withAuth(async (req, ctx) => {
  const { org, membership } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'hr-leave', 'full')
  if (denied) return denied
  requireRole(ctx, ['ADMIN', 'HR'])

  const b = await body<Record<string, unknown>>(req)
  const name = str(b.name, 'name', { max: 60 })

  const days = optDaysPerYear(b.daysPerYear)
  if (days === 'invalid') return fail('daysPerYear must be between 1 and 365', 422)
  const color = optColor(b.color)
  if (color === 'invalid') return fail('color must be a string', 422)
  const paid = optBool(b.paid)
  if (paid === 'invalid') return fail('paid must be a boolean', 422)

  const lt = await db.leaveType.create({
    data: {
      orgId: org.id,
      name,
      daysPerYear: days ?? 10,
      color: color ?? null,
      paid: paid ?? true,
    },
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'leave_type.created',
    entityType: 'LEAVE_TYPE',
    entityId: lt.id,
    message: `${ctx.user.name} created leave type "${name}"`,
  })

  return ok(
    { id: lt.id, name: lt.name, daysPerYear: lt.daysPerYear, color: lt.color, paid: lt.paid, requestCount: 0 },
    201
  )
})
