import { db } from '@/lib/db'
import type { Deal } from '@prisma/client'
import { fromCents, fromCents0 } from '@/lib/server/money'

/** Shared includes + mapping for deal responses (not a route file — plain module). */
export const dealInclude = {
  stage: { select: { id: true, name: true, order: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
}

export type DealRow = Deal & {
  stage: { id: string; name: string; order: number }
  company: { id: string; name: string } | null
  contact: { id: string; name: string } | null
}

/** C7: Deal.value is now Int cents in the DB — accept cents, format as ৳dollars for log/notification messages. */
export const money = (n: number) => `৳${Math.round(fromCents0(n)).toLocaleString('en-US')}`
export const clampProb = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/**
 * Deal.ownerMembershipId / Deal.clientId are plain columns (no Prisma relation) —
 * resolve ownerName/clientName manually, always scoped to the org.
 */
export async function decorateDeals(orgId: string, deals: DealRow[]) {
  const ownerIds = [...new Set(deals.map((d) => d.ownerMembershipId).filter((x): x is string => !!x))]
  const clientIds = [...new Set(deals.map((d) => d.clientId).filter((x): x is string => !!x))]
  const [owners, clients] = await Promise.all([
    ownerIds.length
      ? db.membership.findMany({ where: { id: { in: ownerIds }, orgId }, select: { id: true, user: { select: { name: true } } } })
      : Promise.resolve([] as Array<{ id: string; user: { name: string } }>),
    clientIds.length
      ? db.client.findMany({ where: { id: { in: clientIds }, orgId }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ])
  const ownerNames = new Map(owners.map((o) => [o.id, o.user.name]))
  const clientNames = new Map(clients.map((c) => [c.id, c.name]))
  return deals.map((d) => ({
    ...d,
    // C7: value is now Int cents in the DB — convert to dollars for the API response
    value: fromCents(d.value),
    stageName: d.stage?.name ?? null,
    companyName: d.company?.name ?? null,
    contactName: d.contact?.name ?? null,
    ownerName: d.ownerMembershipId ? ownerNames.get(d.ownerMembershipId) ?? null : null,
    clientName: d.clientId ? clientNames.get(d.clientId) ?? null : null,
  }))
}
