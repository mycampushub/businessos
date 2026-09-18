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

// PATCH /api/hr/leave-types/[id] — {name?, daysPerYear?, color?, paid?} (hr-leave full; OWNER/ADMIN/HR)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-leave', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const lt = await db.leaveType.findFirst({ where: { id, orgId: org.id }, include: INCLUDE })
    if (!lt) return fail('Leave type not found', 404)

    const b = await body<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}

    if (b.name !== undefined) data.name = str(b.name, 'name', { max: 60 })
    const days = optDaysPerYear(b.daysPerYear)
    if (days === 'invalid') return fail('daysPerYear must be between 1 and 365', 422)
    if (days !== undefined) data.daysPerYear = days
    const color = optColor(b.color)
    if (color === 'invalid') return fail('color must be a string', 422)
    if (color !== undefined) data.color = color
    const paid = optBool(b.paid)
    if (paid === 'invalid') return fail('paid must be a boolean', 422)
    if (paid !== undefined) data.paid = paid

    if (!Object.keys(data).length) return fail('Nothing to update', 422)

    const updated = await db.leaveType.update({ where: { id: lt.id }, data, include: INCLUDE })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'leave_type.updated',
      entityType: 'LEAVE_TYPE',
      entityId: lt.id,
      message: `${ctx.user.name} updated leave type "${updated.name}"`,
    })

    return ok(mapItem(updated))
  })(req)
}

// DELETE /api/hr/leave-types/[id] — blocked with 400 'Leave type has requests' when referenced
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-leave', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const lt = await db.leaveType.findFirst({ where: { id, orgId: org.id }, include: INCLUDE })
    if (!lt) return fail('Leave type not found', 404)

    if (lt._count.leaveRequests > 0) return fail('Leave type has requests', 400)

    await db.leaveType.delete({ where: { id: lt.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'leave_type.deleted',
      entityType: 'LEAVE_TYPE',
      entityId: lt.id,
      message: `${ctx.user.name} deleted leave type "${lt.name}"`,
    })

    return ok({ id: lt.id })
  })(req)
}
