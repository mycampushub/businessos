import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, logActivity } from '@/lib/server/api'
import { holidayItem, HOLIDAY_TYPES, startOfDay, type HolidayRow } from '@/lib/server/holidays'

// ---------- T5: holiday update / delete (OWNER / ADMIN / HR) ----------

function dateOnly(v: unknown): Date | null {
  const d = new Date(String(v ?? ''))
  return Number.isNaN(d.getTime()) ? null : startOfDay(d)
}

/** PUT /api/hr/holidays/[id] — {name?, type?, startDate?, endDate?, description?} → {item} */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    requireRole(ctx, ['ADMIN', 'HR'])

    const existing = await db.holiday.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Holiday not found', 404)

    const b = await body<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}
    if (b.name !== undefined) {
      const name = String(b.name).trim().slice(0, 120)
      if (!name) return fail('Holiday name is required', 422)
      data.name = name
    }
    if (b.type !== undefined) {
      if (typeof b.type !== 'string' || !(HOLIDAY_TYPES as readonly string[]).includes(b.type)) {
        return fail('Invalid holiday type', 422)
      }
      data.type = b.type
    }
    const start = b.startDate !== undefined ? dateOnly(b.startDate) : startOfDay(existing.startDate)
    const end = b.endDate !== undefined ? dateOnly(b.endDate) : startOfDay(existing.endDate)
    if (!start || !end) return fail('"startDate" and "endDate" must be valid dates', 422)
    if (end < start) return fail('End date cannot be before the start date', 422)
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 30) {
      return fail('A holiday cannot span more than 30 days', 422)
    }
    data.startDate = start
    data.endDate = end
    if (b.description !== undefined) {
      data.description = String(b.description ?? '').trim().slice(0, 500) || null
    }

    const updated = await db.holiday.update({ where: { id: existing.id }, data })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'settings.holiday_updated',
      entityType: 'HOLIDAY',
      entityId: updated.id,
      message: `${ctx.user.name} updated the holiday "${updated.name}"`,
    })
    return ok({ item: holidayItem(updated as HolidayRow) })
  })(req)
}

/** DELETE /api/hr/holidays/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership } = requireOrg(ctx)
    requireRole(ctx, ['ADMIN', 'HR'])

    const existing = await db.holiday.findFirst({ where: { id, orgId: org.id } })
    if (!existing) return fail('Holiday not found', 404)
    await db.holiday.delete({ where: { id: existing.id } })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'settings.holiday_deleted',
      entityType: 'HOLIDAY',
      entityId: existing.id,
      message: `${ctx.user.name} removed the holiday "${existing.name}"`,
    })
    return ok({ id: existing.id })
  })(req)
}
