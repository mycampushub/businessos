import { db } from '@/lib/db'
import { PROJECT_READ_ALL_ROLES, hasAnyRole } from '@/lib/roles'

/**
 * Project & task visibility scoping (single source of truth for the projects,
 * tasks and documents APIs). Oversight roles (PROJECT_READ_ALL_ROLES) see the whole
 * portfolio; everyone else — EMPLOYEE / CONTRACTOR / INTERN — only sees the
 * projects they are *assigned to*: managing them, being staffed on the team,
 * or having a task assigned to them inside the project.
 */

/** Prisma where-fragment: the projects a member can see (orgId + membership filters). */
export function visibleProjectWhere(orgId: string, membershipId: string, role: string) {
  if (hasAnyRole(role, PROJECT_READ_ALL_ROLES)) return { orgId }
  return {
    orgId,
    OR: [
      { managerMembershipId: membershipId },
      { projectMembers: { some: { membershipId } } },
      { tasks: { some: { assigneeMembershipId: membershipId } } },
    ],
  }
}

/** May this member see one specific project? (Used by detail + child routes.) */
export async function canAccessProject(
  orgId: string,
  membershipId: string,
  role: string,
  projectId: string
): Promise<boolean> {
  if (hasAnyRole(role, PROJECT_READ_ALL_ROLES)) return true
  const visible = await db.project.findFirst({
    where: {
      id: projectId,
      ...visibleProjectWhere(orgId, membershipId, role),
    },
    select: { id: true },
  })
  return !!visible
}

/**
 * Prisma where-fragment for TASKS, mirroring the project policy above:
 * oversight roles see all org tasks; everyone else sees tasks that are
 * unassigned-to-a-project (org-wide), assigned to or created by them, or that
 * live inside a project they manage / are staffed on.
 */
export function visibleTaskWhere(orgId: string, membershipId: string, role: string) {
  if (hasAnyRole(role, PROJECT_READ_ALL_ROLES)) return { orgId }
  return {
    orgId,
    OR: [
      { projectId: null }, // standalone tasks are org-visible
      { assigneeMembershipId: membershipId },
      { creatorMembershipId: membershipId },
      { project: { managerMembershipId: membershipId } },
      { project: { projectMembers: { some: { membershipId } } } },
    ],
  }
}

/** May this member see one specific task? (Load the task first, then call this.) */
export function canAccessTask(
  orgId: string,
  membershipId: string,
  role: string,
  task: { orgId: string; projectId: string | null; assigneeMembershipId: string | null; creatorMembershipId: string | null; project?: { managerMembershipId: string | null; projectMembers?: Array<{ membershipId: string }> } | null }
): boolean {
  if (task.orgId !== orgId) return false
  if (hasAnyRole(role, PROJECT_READ_ALL_ROLES)) return true
  if (task.projectId === null) return true
  if (task.assigneeMembershipId === membershipId) return true
  if (task.creatorMembershipId === membershipId) return true
  const proj = task.project
  if (proj) {
    if (proj.managerMembershipId === membershipId) return true
    if (proj.projectMembers?.some((pm) => pm.membershipId === membershipId)) return true
  }
  return false
}
