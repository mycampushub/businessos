import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, logActivity } from '@/lib/server/api'
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

/** GET /api/crm/stages — org pipeline stages (order asc; crm-deals view). */
export const GET = withAuth(async (_req, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-deals', 'view')
  if (denied) return denied

  const rows = await db.pipelineStage.findMany({
    where: { orgId: org.id },
    orderBy: { order: 'asc' },
  })
  return ok({ items: rows.map(mapItem) })
})

/** POST /api/crm/stages — {name*, isTerminalWon?, isTerminalLost?} (crm-deals full) → stage, order=max+1. */
export const POST = withAuth(async (req, ctx) => {
  const { org, membership } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'crm-deals', 'full')
  if (denied) return denied

  const b = await body<Record<string, unknown>>(req)
  const name = str(b.name, 'name', { max: 40 })
  const isTerminalWon = optBool(b.isTerminalWon)
  if (isTerminalWon === 'invalid') return fail('isTerminalWon must be a boolean', 422)
  const isTerminalLost = optBool(b.isTerminalLost)
  if (isTerminalLost === 'invalid') return fail('isTerminalLost must be a boolean', 422)

  const last = await db.pipelineStage.findFirst({
    where: { orgId: org.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  const stage = await db.pipelineStage.create({
    data: {
      orgId: org.id,
      name,
      order: (last?.order ?? -1) + 1,
      isTerminalWon: isTerminalWon ?? false,
      isTerminalLost: isTerminalLost ?? false,
    },
  })

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'stage.created',
    entityType: 'PIPELINE_STAGE',
    entityId: stage.id,
    message: `${ctx.user.name} added "${name}" to the deal pipeline`,
  })

  return ok(mapItem(stage), 201)
})
