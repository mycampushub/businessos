import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

/**
 * GET /api/projects/[id]/dependencies — every TaskDependency edge for the
 * project, in one response (replaces the N+1 calls to
 * /api/tasks/[id]/dependencies the Gantt tab used to fire).
 *
 * Returned shape:
 *   { items: [{ taskId, dependsOnTaskId, type, taskTitle, dependsOnTitle }, ...] }
 *
 * Includes edges where EITHER side (taskId OR dependsOnTaskId) belongs to a
 * task in this project — so a task that depends on an external task still
 * gets the link label on the connector.
 */
type RouteParams = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, route: RouteParams): Promise<NextResponse> {
  const { id } = await route.params
  return withAuth(async (_req, ctx) => {
    const { org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'projects', 'view')
    if (denied) return denied

    // verify the project exists and belongs to the org (no existence leak)
    const project = await db.project.findFirst({
      where: { id, orgId: org.id },
      select: { id: true },
    })
    if (!project) return fail('Project not found', 404)

    // ids of every task that belongs to this project
    const tasks = await db.task.findMany({
      where: { projectId: project.id },
      select: { id: true },
    })
    const taskIds = tasks.map((t) => t.id)
    if (!taskIds.length) return ok({ items: [] })

    // every edge where either endpoint is a task in this project
    const edges = await db.taskDependency.findMany({
      where: {
        OR: [{ taskId: { in: taskIds } }, { dependsOnTaskId: { in: taskIds } }],
      },
      select: {
        taskId: true,
        dependsOnTaskId: true,
        type: true,
        task: { select: { title: true } },
        dependsOnTask: { select: { title: true } },
      },
    })

    const items = edges.map((e) => ({
      taskId: e.taskId,
      dependsOnTaskId: e.dependsOnTaskId,
      type: e.type,
      taskTitle: e.task?.title ?? '',
      dependsOnTitle: e.dependsOnTask?.title ?? '',
    }))

    return ok({ items })
  })(req)
}
