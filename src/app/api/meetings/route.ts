import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, num, optDate, oneOf, logActivity, notifyUsers } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import {
  meetingInclude,
  meetingItem,
  meetingListItems,
  orgParticipants,
  toParticipantItems,
  formatDateTime,
} from './meeting-helpers'

const SCOPES = ['upcoming', 'past', 'all'] as const

/** GET /api/meetings?projectId=&scope=upcoming|past|all — list org meetings (meetings view).
 *  scope: upcoming = startsAt ≥ now (asc); past = startsAt < now (desc); all (default) = asc. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'meetings', 'view')
  if (denied) return denied

  const url = new URL(req.url)
  const scope = oneOf(url.searchParams.get('scope') ?? 'all', SCOPES)
  const projectId = url.searchParams.get('projectId')?.trim() || undefined

  // projectId filter is org-validated (unknown / other-org → 422)
  if (projectId) {
    const project = await db.project.findFirst({ where: { id: projectId, orgId: org.id }, select: { id: true } })
    if (!project) return fail('Unknown project', 422)
  }

  const meetings = await db.meeting.findMany({
    where: {
      orgId: org.id,
      ...(projectId ? { projectId } : {}),
      ...(scope === 'upcoming' ? { startsAt: { gte: new Date() } } : {}),
      ...(scope === 'past' ? { startsAt: { lt: new Date() } } : {}),
    },
    include: meetingInclude,
    orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
  })

  const items = await meetingListItems(org.id, meetings)
  return ok({ items })
})

/** POST /api/meetings — create a meeting (meetings full).
 *  body: { title*, startsAt ISO*, durationMins? int 5..480 (default 30), projectId? (org-validated),
 *          agenda? ≤2000, participants?: membershipId[] ≤50 (org-validated) }
 *  Notifies participants (minus the actor); logActivity 'meeting.created'. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'meetings', 'full')
  if (denied) return denied

  const data = await body(req)
  const title = str(data.title, 'title', { max: 200 })

  const startsAt = optDate(data.startsAt)
  if (!startsAt) return fail('Invalid start date', 422)

  let durationMins = 30
  if (data.durationMins !== undefined && data.durationMins !== null && data.durationMins !== '') {
    durationMins = Math.round(num(data.durationMins, 'durationMins', { min: 5, max: 480 }))
  }

  let projectId: string | null = null
  if (data.projectId !== undefined && data.projectId !== null && data.projectId !== '') {
    const project = await db.project.findFirst({ where: { id: String(data.projectId), orgId: org.id }, select: { id: true } })
    if (!project) return fail('Unknown project', 422)
    projectId = project.id
  }

  const agenda =
    data.agenda === undefined || data.agenda === null
      ? null
      : str(data.agenda, 'agenda', { required: false, max: 2000 }) || null

  // participants: membership ids of this org (≤50)
  let participantRows = [] as Awaited<ReturnType<typeof orgParticipants>>
  if (data.participants !== undefined && data.participants !== null) {
    if (!Array.isArray(data.participants)) return fail('participants must be an array', 422)
    const ids = [
      ...new Set(
        (data.participants as unknown[]).map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
      ),
    ]
    if (ids.length > 50) return fail('Too many participants (max 50)', 422)
    if (ids.length) {
      const rows = await orgParticipants(org.id, ids)
      if (rows.length !== ids.length) return fail('Unknown participant', 422)
      participantRows = rows
    }
  }

  const meeting = await db.meeting.create({
    data: {
      orgId: org.id,
      projectId,
      title,
      startsAt,
      durationMins,
      agenda,
      createdByMembershipId: membership.id,
      participants: participantRows.length ? participantRows.map((p) => p.id).join(',') : null,
    },
    include: meetingInclude,
  })

  // invite notification for every participant except the actor
  const targets = participantRows.map((p) => p.userId).filter((uid) => uid !== ctx.user.id)
  if (targets.length) {
    await notifyUsers({
      orgId: org.id,
      userIds: targets,
      type: 'SYSTEM',
      title: `Meeting invite: ${title}`,
      body: `${ctx.user.name} invited you — ${formatDateTime(startsAt)}`,
      module: 'meetings',
    })
  }

  await logActivity({
    orgId: org.id,
    actorMembershipId: membership.id,
    action: 'meeting.created',
    entityType: 'MEETING',
    entityId: meeting.id,
    message: `${title} scheduled`,
  })

  return ok(meetingItem(meeting, toParticipantItems(participantRows)), 201)
})
