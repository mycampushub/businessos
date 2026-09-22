import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, body, str, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { invalidateColumnCache } from '@/lib/server/columns'

type ColumnRow = {
  id: string
  surface: string
  key: string
  label: string
  order: number
  isDone: boolean
  isRejected: boolean
  color: string | null
}

function mapItem(c: ColumnRow) {
  return {
    id: c.id,
    surface: c.surface,
    key: c.key,
    label: c.label,
    order: c.order,
    isDone: c.isDone,
    isRejected: c.isRejected,
    color: c.color,
  }
}

function moduleFor(surface: string): 'tasks' | 'recruit-candidates' {
  return surface === 'HIRING' ? 'recruit-candidates' : 'tasks'
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

// PATCH /api/columns/[id] — {label?, color?, isDone?, isRejected?} OR {direction:'left'|'right'} (OWNER/ADMIN/MANAGER + module full)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    requireRole(ctx, ['ADMIN', 'MANAGER']) // column management (OWNER auto-allowed, mirrors POST /api/columns)

    const col = await db.boardColumn.findFirst({ where: { id, orgId: org.id } })
    if (!col) return fail('Column not found', 404)

    const denied = requireAccess(ctx, moduleFor(col.surface), 'full')
    if (denied) return denied

    const b = await body<Record<string, unknown>>(req)

    // {direction:'left'|'right'} → swap order with the adjacent column on the same board
    if (b.direction !== undefined) {
      const direction = oneOf(b.direction, ['left', 'right'] as const)
      const siblings = await db.boardColumn.findMany({
        where: { orgId: org.id, surface: col.surface },
        orderBy: { order: 'asc' },
      })
      const idx = siblings.findIndex((c) => c.id === col.id)
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= siblings.length) {
        return ok(mapItem(col)) // already at the edge — no-op
      }
      const other = siblings[swapIdx]
      await db.$transaction([
        db.boardColumn.update({ where: { id: col.id }, data: { order: other.order } }),
        db.boardColumn.update({ where: { id: other.id }, data: { order: col.order } }),
      ])
      if (col.surface === 'TASK') invalidateColumnCache(org.id) // T3-d: dynamic task statuses read this cache
      const updated = await db.boardColumn.findUnique({ where: { id: col.id } })
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'column.moved',
        entityType: 'BOARD_COLUMN',
        entityId: col.id,
        message: `${ctx.user.name} moved column "${col.label}" ${direction}`,
      })
      return ok(mapItem(updated as ColumnRow))
    }

    const data: Record<string, unknown> = {}
    if (b.label !== undefined) data.label = str(b.label, 'label', { max: 40 })
    const color = optColor(b.color)
    if (color === 'invalid') return fail('color must be a string', 422)
    if (color !== undefined) data.color = color
    const isDone = optBool(b.isDone)
    if (isDone === 'invalid') return fail('isDone must be a boolean', 422)
    if (isDone !== undefined) data.isDone = isDone
    const isRejected = optBool(b.isRejected)
    if (isRejected === 'invalid') return fail('isRejected must be a boolean', 422)
    if (isRejected !== undefined) data.isRejected = isRejected

    if (!Object.keys(data).length) return fail('Nothing to update', 422)

    const updated = await db.boardColumn.update({ where: { id: col.id }, data })
    if (col.surface === 'TASK') invalidateColumnCache(org.id) // T3-d: dynamic task statuses read this cache
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'column.updated',
      entityType: 'BOARD_COLUMN',
      entityId: col.id,
      message: `${ctx.user.name} updated column "${updated.label}"`,
    })
    return ok(mapItem(updated))
  })(req)
}

// DELETE /api/columns/[id]?moveTo=<colId> — moves Task.status / Application.stage rows, then deletes
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)
    requireRole(ctx, ['ADMIN', 'MANAGER']) // column management (OWNER auto-allowed, mirrors POST /api/columns)

    const col = await db.boardColumn.findFirst({ where: { id, orgId: org.id } })
    if (!col) return fail('Column not found', 404)

    const denied = requireAccess(ctx, moduleFor(col.surface), 'full')
    if (denied) return denied

    const siblingCount = await db.boardColumn.count({ where: { orgId: org.id, surface: col.surface } })
    if (siblingCount <= 1) return fail('At least one column is required', 400)

    const moveTo = new URL(req.url).searchParams.get('moveTo')
    if (!moveTo) return fail('Choose a target column', 422)
    if (moveTo === col.id) return fail('Cannot move cards to the column being deleted', 422)

    const target = await db.boardColumn.findFirst({ where: { id: moveTo, orgId: org.id } })
    if (!target) return fail('Target column not found', 404)
    if (target.surface !== col.surface) return fail('Target column must be on the same board', 422)

    const moved = await db.$transaction(async (tx) => {
      let count = 0
      if (col.surface === 'TASK') {
        const res = await tx.task.updateMany({
          where: { orgId: org.id, status: col.key },
          data: { status: target.key },
        })
        count = res.count
      } else {
        // HIRING: Application has no orgId — scope via the org's jobs
        const jobs = await tx.job.findMany({ where: { orgId: org.id }, select: { id: true } })
        if (jobs.length) {
          const res = await tx.application.updateMany({
            where: { jobId: { in: jobs.map((j) => j.id) }, stage: col.key },
            data: { stage: target.key },
          })
          count = res.count
        }
      }
      await tx.boardColumn.delete({ where: { id: col.id } })
      return count
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'column.deleted',
      entityType: 'BOARD_COLUMN',
      entityId: col.id,
      message: `${ctx.user.name} deleted column "${col.label}" (${moved} card${moved === 1 ? '' : 's'} moved to "${target.label}")`,
    })

    if (col.surface === 'TASK') invalidateColumnCache(org.id) // T3-d: dynamic task statuses read this cache

    return ok({ moved })
  })(req)
}
