import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, oneOf, logActivity } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

type StageRow = {
  id: string
  name: string
  order: number
  isTerminalWon: boolean
  isTerminalLost: boolean
}

function mapItem(s: StageRow) {
  return {
    id: s.id,
    name: s.name,
    order: s.order,
    isTerminalWon: s.isTerminalWon,
    isTerminalLost: s.isTerminalLost,
  }
}

function optBool(v: unknown): boolean | 'invalid' | undefined {
  if (v === undefined) return undefined
  return typeof v === 'boolean' ? v : 'invalid'
}

// PATCH /api/crm/stages/[id] — {name?, isTerminalWon?, isTerminalLost?} OR {direction:'left'|'right'} (crm-deals full)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)

    const stage = await db.pipelineStage.findFirst({ where: { id, orgId: org.id } })
    if (!stage) return fail('Stage not found', 404)

    const denied = requireAccess(ctx, 'crm-deals', 'full')
    if (denied) return denied

    const b = await body<Record<string, unknown>>(req)

    // {direction:'left'|'right'} → swap order with the adjacent stage
    if (b.direction !== undefined) {
      const direction = oneOf(b.direction, ['left', 'right'] as const)
      const siblings = await db.pipelineStage.findMany({
        where: { orgId: org.id },
        orderBy: { order: 'asc' },
      })
      const idx = siblings.findIndex((s) => s.id === stage.id)
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= siblings.length) {
        return ok(mapItem(stage)) // already at the edge — no-op
      }
      const other = siblings[swapIdx]
      await db.$transaction([
        db.pipelineStage.update({ where: { id: stage.id }, data: { order: other.order } }),
        db.pipelineStage.update({ where: { id: other.id }, data: { order: stage.order } }),
      ])
      const updated = await db.pipelineStage.findUnique({ where: { id: stage.id } })
      await logActivity({
        orgId: org.id,
        actorMembershipId: membership.id,
        action: 'stage.moved',
        entityType: 'PIPELINE_STAGE',
        entityId: stage.id,
        message: `${ctx.user.name} moved pipeline stage "${stage.name}" ${direction}`,
      })
      return ok(mapItem(updated as StageRow))
    }

    const data: Record<string, unknown> = {}
    if (b.name !== undefined) data.name = str(b.name, 'name', { max: 40 })
    const isTerminalWon = optBool(b.isTerminalWon)
    if (isTerminalWon === 'invalid') return fail('isTerminalWon must be a boolean', 422)
    if (isTerminalWon !== undefined) data.isTerminalWon = isTerminalWon
    const isTerminalLost = optBool(b.isTerminalLost)
    if (isTerminalLost === 'invalid') return fail('isTerminalLost must be a boolean', 422)
    if (isTerminalLost !== undefined) data.isTerminalLost = isTerminalLost

    if (!Object.keys(data).length) return fail('Nothing to update', 422)

    const updated = await db.pipelineStage.update({ where: { id: stage.id }, data })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'stage.updated',
      entityType: 'PIPELINE_STAGE',
      entityId: stage.id,
      message: `${ctx.user.name} updated pipeline stage "${updated.name}"`,
    })
    return ok(mapItem(updated))
  })(req)
}

// DELETE /api/crm/stages/[id]?moveTo=<stageId> — moves deals' stageId, then deletes
// NOTE: per the frozen T3 worklog contract this returns 400 for BOTH the last-stage guard
// and a missing moveTo (422 is used only for a self-target).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_rq, ctx) => {
    const { org, membership } = requireOrg(ctx)

    const stage = await db.pipelineStage.findFirst({ where: { id, orgId: org.id } })
    if (!stage) return fail('Stage not found', 404)

    const denied = requireAccess(ctx, 'crm-deals', 'full')
    if (denied) return denied

    const stageCount = await db.pipelineStage.count({ where: { orgId: org.id } })
    if (stageCount <= 1) return fail('At least one stage is required', 400)

    const moveTo = new URL(req.url).searchParams.get('moveTo')
    if (!moveTo) return fail('Choose a target stage', 400)
    if (moveTo === stage.id) return fail('Cannot move deals to the stage being deleted', 422)

    const target = await db.pipelineStage.findFirst({ where: { id: moveTo, orgId: org.id } })
    if (!target) return fail('Target stage not found', 404)

    const moved = await db.$transaction(async (tx) => {
      const res = await tx.deal.updateMany({
        where: { stageId: stage.id },
        data: { stageId: target.id },
      })
      await tx.pipelineStage.delete({ where: { id: stage.id } })
      return res.count
    })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'stage.deleted',
      entityType: 'PIPELINE_STAGE',
      entityId: stage.id,
      message: `${ctx.user.name} deleted pipeline stage "${stage.name}" (${moved} deal${moved === 1 ? '' : 's'} moved to "${target.name}")`,
    })

    return ok({ moved })
  })(req)
}
