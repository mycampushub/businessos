import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, num, optDate, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { meetingInclude, meetingItem, orgParticipants, parseParticipantIds, formatDateTime, type ParticipantRow } from '../meeting-helpers'

type RouteParams = { params: Promise<{ id: string }> }

/** PATCH /api/meetings/[id] — update (meetings full).
 *  body: { title?, startsAt?, durationMins?, agenda? ≤2000, notes? ≤8000, projectId?|null (clears),
 *          participants?: membershipId[] ≤50 — REPLACES the whole set }
 *  Newly-added participants (diff vs old set, minus actor) get a 'Meeting updated' notification. */
export async function PATCH(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_r, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'meetings', 'full')
    if (denied) return denied

    const meeting = await db.meeting.findFirst({ where: { id, orgId: org.id }, include: meetingInclude })
    if (!meeting) return fail('Meeting not found', 404)

    const data = await body(req)
    const update: Record<string, unknown> = {}

    if (data.title !== undefined) update.title = str(data.title, 'title', { max: 200 })
    if (data.startsAt !== undefined) {
      const d = optDate(data.startsAt)
      if (!d) return fail('Invalid start date', 422)
      update.startsAt = d
    }
    if (data.durationMins !== undefined && data.durationMins !== null && data.durationMins !== '') {
      update.durationMins = Math.round(num(data.durationMins, 'durationMins', { min: 5, max: 480 }))
    }
    if (data.agenda !== undefined) {
      update.agenda = data.agenda === null ? null : str(data.agenda, 'agenda', { required: false, max: 2000 }) || null
    }
    if (data.notes !== undefined) {
      update.notes = data.notes === null ? null : str(data.notes, 'notes', { required: false, max: 8000 }) || null
    }
    if (data.projectId !== undefined) {
      if (data.projectId === null || data.projectId === '') {
        update.projectId = null // explicit clear
      } else {
        const project = await db.project.findFirst({ where: { id: String(data.projectId), orgId: org.id }, select: { id: true } })
        if (!project) return fail('Unknown project', 422)
        update.projectId = project.id
      }
    }

    // participants REPLACES the set
    let newRows: ParticipantRow[] | null = null
    if (data.participants !== undefined && data.participants !== null) {
      if (!Array.isArray(data.participants)) return fail('participants must be an array', 422)
      const ids = [
        ...new Set(
          (data.participants as unknown[]).map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
        ),
      ]
      if (ids.length > 50) return fail('Too many participants (max 50)', 422)
      const rows = await orgParticipants(org.id, ids)
      if (rows.length !== ids.length) return fail('Unknown participant', 422)
      newRows = rows
      update.participants = ids.length ? ids.join(',') : null
    }

    if (Object.keys(update).length === 0) return fail('No valid fields to update', 422)

    const oldIds = parseParticipantIds(meeting.participants)
    const updated = await db.meeting.update({ where: { id: meeting.id }, data: update, include: meetingInclude })

    const title = (update.title as string) ?? meeting.title
    const startsAt = (update.startsAt as Date) ?? meeting.startsAt

    // notify participants newly added by this change (minus the actor)
    if (newRows) {
      const targets = newRows
        .filter((r) => !oldIds.includes(r.id))
        .map((r) => r.userId)
        .filter((uid) => uid !== ctx.user.id)
      if (targets.length) {
        await notifyUsers({
          orgId: org.id,
          userIds: targets,
          type: 'SYSTEM',
          title: `Meeting updated: ${title}`,
          body: `${ctx.user.name} added you — ${formatDateTime(startsAt)}`,
          module: 'meetings',
        })
      }
    }

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'meeting.updated',
      entityType: 'MEETING',
      entityId: meeting.id,
      message: `${title} updated`,
    })

    const item = meetingItem(
      updated,
      newRows ? newRows.map(({ userId: _userId, ...rest }) => rest) : await orgParticipants(org.id, parseParticipantIds(updated.participants))
    )
    return ok(item)
  })(req)
}

/** DELETE /api/meetings/[id] — meetings full; creator OR OWNER/ADMIN/HR roles. */
export async function DELETE(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_r, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'meetings', 'full')
    if (denied) return denied

    const meeting = await db.meeting.findFirst({
      where: { id, orgId: org.id },
      select: { id: true, title: true, createdByMembershipId: true },
    })
    if (!meeting) return fail('Meeting not found', 404)

    const allowed =
      meeting.createdByMembershipId === membership.id || ['OWNER', 'ADMIN', 'HR'].includes(membership.role)
    if (!allowed) return fail('Insufficient permissions', 403)

    await db.meeting.delete({ where: { id: meeting.id } })

    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'meeting.deleted',
      entityType: 'MEETING',
      entityId: meeting.id,
      message: `${meeting.title} deleted`,
    })

    return ok({ id: meeting.id })
  })(req)
}
