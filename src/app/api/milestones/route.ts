import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { getTaskColumns, doneKeys } from '@/lib/server/columns'

// ---------- T4-c: org-wide milestones list ----------
// GET /api/milestones — every milestone of the org (projects view; reports/calendar
// use). doneTaskCount uses the org's dynamic TASK board columns (doneKeys) and is
// counted JS-side from the milestone's tasks, mirroring /api/projects/[id].

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const { org } = requireOrg(ctx)
  const denied = requireAccess(ctx, 'projects', 'view')
  if (denied) return denied

  const milestones = await db.milestone.findMany({
    where: { project: { orgId: org.id } },
    include: { project: { select: { id: true, name: true, color: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const columns = await getTaskColumns(org.id)
  const doneSet = new Set(doneKeys(columns))

  const ids = milestones.map((m) => m.id)
  const tasks = ids.length
    ? await db.task.findMany({
        where: { orgId: org.id, milestoneId: { in: ids } },
        select: { milestoneId: true, status: true },
      })
    : []

  const totalByMilestone = new Map<string, number>()
  const doneByMilestone = new Map<string, number>()
  for (const t of tasks) {
    if (!t.milestoneId) continue
    totalByMilestone.set(t.milestoneId, (totalByMilestone.get(t.milestoneId) ?? 0) + 1)
    if (doneSet.has(t.status)) doneByMilestone.set(t.milestoneId, (doneByMilestone.get(t.milestoneId) ?? 0) + 1)
  }

  const items = milestones.map((m) => ({
    id: m.id,
    title: m.title,
    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    projectId: m.projectId,
    projectName: m.project.name,
    projectColor: m.project.color,
    doneTaskCount: doneByMilestone.get(m.id) ?? 0,
    taskCount: totalByMilestone.get(m.id) ?? 0,
    completed: m.status === 'COMPLETED',
    createdAt: m.createdAt.toISOString(),
  }))

  return ok({ items })
})
