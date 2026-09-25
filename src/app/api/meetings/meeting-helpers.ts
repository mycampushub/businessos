import { db } from '@/lib/db'
import type { Meeting } from '@prisma/client'

// ---------- T4-c: shared meeting route helpers ----------

export interface ParticipantItem {
  id: string // membership id
  name: string
  avatarUrl: string | null
}

export interface ParticipantRow extends ParticipantItem {
  userId: string
}

/** "id1,id2" → ["id1","id2"] (CSV order preserved, blanks dropped). */
export function parseParticipantIds(csv: string | null): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Bulk-resolve membership ids → participant rows in CSV order (unknown ids skipped).
 *  Callers compare row count to the (deduped) input length to detect unknown ids. */
export async function orgParticipants(orgId: string, ids: string[]): Promise<ParticipantRow[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  const rows = await db.membership.findMany({
    where: { id: { in: unique }, orgId },
    select: { id: true, userId: true, user: { select: { name: true, avatarUrl: true } } },
  })
  const order = new Map(unique.map((id, i) => [id, i]))
  return [...rows]
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r) => ({ id: r.id, userId: r.userId, name: r.user.name, avatarUrl: r.user.avatarUrl }))
}

/** Participant rows → API items (drops the internal userId). */
export function toParticipantItems(rows: ParticipantRow[]): ParticipantItem[] {
  return rows.map(({ userId: _userId, ...rest }) => rest)
}

export const meetingInclude = {
  project: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, user: { select: { name: true } } } },
  // H12-db fix: include participants from the join table (was CSV string)
  meetingParticipants: {
    select: {
      membershipId: true,
      membership: { select: { id: true, user: { select: { name: true, avatarUrl: true } } } },
    },
  },
} as const

export type MeetingRow = Meeting & {
  project: { id: string; name: string; color: string | null } | null
  createdBy: { id: string; user: { name: string } } | null
  meetingParticipants: Array<{
    membershipId: string
    membership: { id: string; user: { name: string; avatarUrl: string | null } }
  }>
}

/** Canonical meeting item shape returned by every meetings endpoint. */
export function meetingItem(m: MeetingRow, participants?: ParticipantItem[]) {
  // H12-db fix: resolve participants from the join table if not explicitly passed
  const parts = participants ?? m.meetingParticipants.map((mp) => ({
    id: mp.membership.id,
    name: mp.membership.user.name,
    avatarUrl: mp.membership.user.avatarUrl,
  }))
  return {
    id: m.id,
    title: m.title,
    startsAt: m.startsAt.toISOString(),
    durationMins: m.durationMins,
    agenda: m.agenda,
    notes: m.notes,
    projectId: m.projectId,
    projectName: m.project?.name ?? null,
    projectColor: m.project?.color ?? null,
    // H9-fe: expose the creator's membership id so the frontend can compare
    // identity by id instead of relying on a fragile name string match.
    createdByMembershipId: m.createdBy?.id ?? null,
    createdByName: m.createdBy?.user.name ?? null,
    participants: parts,
    participantCount: parts.length,
    createdAt: m.createdAt.toISOString(),
  }
}

/** Map a batch of meetings → items. H12-db fix: participants now come from the join table. */
export async function meetingListItems(_orgId: string, meetings: MeetingRow[]) {
  return meetings.map((m) => meetingItem(m))
}

/** "Sep 12, 2026, 2:30 PM" — used in meeting notifications + search subtitles. */
export function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
