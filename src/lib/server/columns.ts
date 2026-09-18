import { db } from '@/lib/db'
import type { BoardColumn } from '@prisma/client'

// ---------- T3-d: dynamic TASK board columns ----------
// Task statuses are no longer a hardcoded enum — they come from the org's
// BoardColumn rows (surface TASK, order asc). doneKeys() defines which statuses
// count as "done" (completedAt, project progress, overdue, dashboard myTasks…).

const CACHE_TTL_MS = 60_000
const columnCache = new Map<string, { columns: BoardColumn[]; expires: number }>()

/** TASK-surface board columns of an org, order asc (60s in-memory cache). */
export async function getTaskColumns(orgId: string): Promise<BoardColumn[]> {
  const hit = columnCache.get(orgId)
  if (hit && hit.expires > Date.now()) return hit.columns
  const columns = await db.boardColumn.findMany({
    where: { orgId, surface: 'TASK' },
    orderBy: { order: 'asc' },
  })
  columnCache.set(orgId, { columns, expires: Date.now() + CACHE_TTL_MS })
  return columns
}

/** keys of the columns flagged isDone — the org's dynamic "done" statuses. */
export function doneKeys(columns: BoardColumn[]): string[] {
  return columns.filter((c) => c.isDone).map((c) => c.key)
}

/** key → sort rank (column order). Unknown/legacy statuses sort last (use `?? 999`). */
export function statusOrderMap(columns: BoardColumn[]): Record<string, number> {
  return Object.fromEntries(columns.map((c) => [c.key, c.order]))
}

/** Drops the cached TASK columns of an org (call after BoardColumn writes). */
export function invalidateColumnCache(orgId: string): void {
  columnCache.delete(orgId)
}
