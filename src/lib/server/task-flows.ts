import { db } from '@/lib/db'
import { logActivity, notifyUsers } from './api'

// ---------- T7: project ↔ task relation flows ----------
// Shared rollups used by the task routes (create / patch / delete) and milestone
// operations so the project/task/milestone graph never drifts:
//   • project.progress   — done-tasks ÷ total-tasks of the project (0..100)
//   • milestone.status   — COMPLETED when every task of the milestone is done,
//                          reopened to IN_PROGRESS when work reappears

/** actor context for activity log + notifications inside the helpers */
export interface FlowActor {
  orgId: string
  membershipId: string
  userName: string
  userId: string
}

/** ISO yyyy-mm-dd for actionable validation messages */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Recompute and persist project.progress = round(done / total × 100).
 * Done statuses are the org's dynamic TASK "done" columns. Returns the new
 * progress, the current (untouched) progress when the project has ZERO tasks
 * (manual progress is preserved — no rollup over an empty board), or null when
 * the project does not exist.
 */
export async function recomputeProjectProgress(projectId: string, doneStatuses: string[]): Promise<number | null> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, progress: true } })
  if (!project) return null
  const [total, done] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.task.count({ where: { projectId, status: { in: doneStatuses } } }),
  ])
  if (total === 0) return project.progress // nothing to roll up — keep the manual value
  const progress = Math.round((done / total) * 100)
  await db.project.update({ where: { id: projectId }, data: { progress } })
  return progress
}

/**
 * Keep a milestone in sync with its tasks:
 *   • every task done (≥1 task)        → COMPLETED (completedAt stamped, manager notified)
 *   • milestone COMPLETED + open tasks → reopened to IN_PROGRESS (completedAt cleared)
 * Manual DELAYED / IN_PROGRESS states are never overridden except by the two
 * deterministic transitions above. Returns 'COMPLETED' | 'REOPENED' | null.
 */
export async function syncMilestoneStatus(
  milestoneId: string,
  doneStatuses: string[],
  actor?: FlowActor
): Promise<'COMPLETED' | 'REOPENED' | null> {
  const milestone = await db.milestone.findUnique({
    where: { id: milestoneId },
    select: {
      id: true,
      title: true,
      status: true,
      tasks: { select: { status: true } },
      project: { select: { id: true, name: true, managerMembershipId: true } },
    },
  })
  if (!milestone) return null
  if (milestone.tasks.length === 0) return null

  const allDone = milestone.tasks.every((t) => doneStatuses.includes(t.status))

  if (allDone && milestone.status !== 'COMPLETED') {
    await db.milestone.update({ where: { id: milestone.id }, data: { status: 'COMPLETED', completedAt: new Date() } })
    if (actor) {
      await logActivity({
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: 'milestone.completed',
        entityType: 'MILESTONE',
        entityId: milestone.id,
        message: `Milestone "${milestone.title}" completed for ${milestone.project.name} (all tasks done)`,
      })
      const manager = milestone.project.managerMembershipId
        ? await db.membership.findUnique({
            where: { id: milestone.project.managerMembershipId },
            select: { userId: true },
          })
        : null
      if (manager && manager.userId !== actor.userId) {
        await notifyUsers({
          orgId: actor.orgId,
          userIds: [manager.userId],
          type: 'PROJECT',
          title: `Milestone completed: ${milestone.title}`,
          body: `Project "${milestone.project.name}"`,
          module: 'projects',
        })
      }
    }
    return 'COMPLETED'
  }

  if (!allDone && milestone.status === 'COMPLETED') {
    await db.milestone.update({ where: { id: milestone.id }, data: { status: 'IN_PROGRESS', completedAt: null } })
    if (actor) {
      await logActivity({
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: 'milestone.reopened',
        entityType: 'MILESTONE',
        entityId: milestone.id,
        message: `Milestone "${milestone.title}" reopened — it has open tasks`,
      })
    }
    return 'REOPENED'
  }

  return null
}

/**
 * Validate task dates against its project window (soft fields — only enforced
 * when both sides exist). Returns an error message or null.
 */
export async function taskWindowError(
  projectId: string | null,
  startDate: Date | null,
  dueDate: Date | null
): Promise<string | null> {
  if (!projectId) return null
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { startDate: true, endDate: true },
  })
  if (!project) return null
  if (startDate && project.startDate && startOfDayLt(startDate) < startOfDayLt(project.startDate)) {
    return `Task start date is before the project's start date (${isoDay(project.startDate)})`
  }
  if (dueDate && project.endDate && startOfDayLt(dueDate) > startOfDayLt(project.endDate)) {
    return `Task due date is after the project's end date (${isoDay(project.endDate)})`
  }
  return null
}

/** local-midnight comparison basis (dates are whole days) */
function startOfDayLt(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
