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
} as const

export type MeetingRow = Meeting & {
  project: { id: string; name: string; color: string | null } | null
  createdBy: { id: string; user: { name: string } } | null
}

/** Canonical meeting item shape returned by every meetings endpoint. */
export function meetingItem(m: MeetingRow, participants: ParticipantItem[]) {
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
    createdByName: m.createdBy?.user.name ?? null,
    participants,
    participantCount: participants.length,
    createdAt: m.createdAt.toISOString(),
  }
}

/** Map a batch of meetings → items with one bulk participant lookup. */
export async function meetingListItems(orgId: string, meetings: MeetingRow[]) {
  const allIds = meetings.flatMap((m) => parseParticipantIds(m.participants))
  const unique = [...new Set(allIds)]
  const rows = unique.length
    ? await db.membership.findMany({
        where: { id: { in: unique }, orgId },
        select: { id: true, user: { select: { name: true, avatarUrl: true } } },
      })
    : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return meetings.map((m) => {
    const participants = parseParticipantIds(m.participants)
      .map((id) => {
        const row = byId.get(id)
        return row ? { id, name: row.user.name, avatarUrl: row.user.avatarUrl } : null
      })
      .filter((p): p is ParticipantItem => p !== null)
    return meetingItem(m, participants)
  })
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
