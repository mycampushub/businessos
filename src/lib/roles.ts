/**
 * OrgOS role-based access control — SINGLE SOURCE OF TRUTH for module visibility
 * and role capability sets. Pure data only (no imports) so it is safe to import
 * from both client components and server API routes.
 *
 * Enforcement model (defense in depth):
 *  - SERVER: every API route enforces its own role gate via requireRole() /
 *    role-set checks in src/lib/server/api.ts. The client is NEVER the boundary.
 *  - CLIENT: this matrix drives sidebar visibility (src/components/app/sidebar.tsx)
 *    and the per-module access guard (src/components/app/workspace-shell.tsx),
 *    so users only see modules their role can actually use.
 *
 * Role hierarchy (8 seeded roles):
 *   OWNER > ADMIN > { MANAGER, HR, FINANCE } > { EMPLOYEE, CONTRACTOR, INTERN }
 */

export const ALL_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE', 'EMPLOYEE', 'CONTRACTOR', 'INTERN'] as const

/** Module ids mirror ModuleId in src/lib/client/store.tsx (kept as plain strings
 *  here so server code can import this file without pulling client state). */
export const MODULE_ACCESS: Record<string, readonly string[]> = {
  dashboard: ALL_ROLES,
  reports: ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE'],
  profile: ALL_ROLES,
  'my-tasks': ALL_ROLES,
  tasks: ALL_ROLES,
  projects: ALL_ROLES,
  'crm-leads': ['OWNER', 'ADMIN', 'MANAGER'],
  'crm-deals': ['OWNER', 'ADMIN', 'MANAGER'],
  'crm-contacts': ['OWNER', 'ADMIN', 'MANAGER'],
  'hr-employees': ALL_ROLES, // directory is visible to everyone; PII stripped server-side for non-people roles
  'hr-attendance': ['OWNER', 'ADMIN', 'MANAGER', 'HR'], // HR oversight module — everyone clocks in/out from their dashboard instead
  'hr-leave': ALL_ROLES, // self-scoped server-side for non-approver roles
  'org-structure': ALL_ROLES,
  'recruit-jobs': ['OWNER', 'ADMIN', 'MANAGER', 'HR'],
  'recruit-candidates': ['OWNER', 'ADMIN', 'MANAGER', 'HR'],
  'finance-invoices': ['OWNER', 'ADMIN', 'FINANCE'],
  'finance-expenses': ALL_ROLES, // self-scoped server-side for non-approver roles
  documents: ALL_ROLES, // listing is access-scoped server-side (ORG-wide vs RESTRICTED docs)
  announcements: ALL_ROLES,
  settings: ['OWNER', 'ADMIN'], // internal org administration — hidden entirely for other roles (not read-only)
}

/** Can this role open this module at all? (OWNER/ADMIN always pass implicitly —
 *  every module list includes them, but be explicit for safety.) */
export function canAccessModule(role: string | null | undefined, moduleId: string): boolean {
  if (!role) return false
  const allowed = MODULE_ACCESS[moduleId]
  if (!allowed) return true // unknown module: do not block (server still enforces)
  return allowed.includes(role) || role === 'OWNER' || role === 'ADMIN'
}

// ---------- per-member customizable access (Settings → Access control) ----------

/** Modules admins can grant/deny per member. Personal essentials (Dashboard,
 *  My Profile) are deliberately excluded — every member always keeps those. */
export const MODULE_CATALOG: ReadonlyArray<{ id: string; label: string; group: string }> = [
  { id: 'reports', label: 'Reports', group: 'Overview' },
  { id: 'my-tasks', label: 'My Tasks', group: 'Work' },
  { id: 'tasks', label: 'All Tasks', group: 'Work' },
  { id: 'projects', label: 'Projects', group: 'Work' },
  { id: 'crm-leads', label: 'Leads', group: 'CRM' },
  { id: 'crm-deals', label: 'Deals & Pipeline', group: 'CRM' },
  { id: 'crm-contacts', label: 'Contacts & Clients', group: 'CRM' },
  { id: 'hr-employees', label: 'Employees', group: 'People' },
  { id: 'hr-attendance', label: 'Attendance', group: 'People' },
  { id: 'hr-leave', label: 'Leave', group: 'People' },
  { id: 'org-structure', label: 'Org Structure', group: 'People' },
  { id: 'recruit-jobs', label: 'Jobs', group: 'Recruitment' },
  { id: 'recruit-candidates', label: 'Candidates', group: 'Recruitment' },
  { id: 'finance-invoices', label: 'Invoices', group: 'Finance' },
  { id: 'finance-expenses', label: 'Expenses', group: 'Finance' },
  { id: 'documents', label: 'Documents', group: 'Workspace' },
  { id: 'announcements', label: 'Announcements', group: 'Workspace' },
  { id: 'settings', label: 'Settings', group: 'Administration' },
]

/** Effective module access for a member: an explicit per-member override wins
 *  over the role defaults; the OWNER role is never restricted (safety net so an
 *  org can always recover). Used by BOTH the client (nav + module guard) and
 *  the server (requireModuleAccess) — one truth, two enforcement layers. */
export function effectiveModuleAccess(
  role: string | null | undefined,
  overrides: Record<string, boolean> | null | undefined,
  moduleId: string,
): boolean {
  if (!role) return false
  if (role === 'OWNER') return true
  if (overrides && typeof overrides[moduleId] === 'boolean') return overrides[moduleId]
  return canAccessModule(role, moduleId)
}

// ---------- role capability sets (server routes use these with requireRole) ----------

/** May view the full employee directory incl. contact PII (email/phone). */
export const PEOPLE_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE'] as const
/** May view org-wide attendance and leave records. */
export const PEOPLE_OVERSIGHT_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR'] as const
/** May read financial summaries (revenue/expense KPIs, reports finance sections). */
export const FINANCE_READ_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'FINANCE'] as const
/** May manage the invoice register (create/send/mark-paid/delete). */
export const INVOICE_ROLES = ['OWNER', 'ADMIN', 'FINANCE'] as const
/** Full CRM access (leads, deals, contacts, companies, clients, activities). */
export const CRM_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const
/** Recruitment management (jobs CRUD, candidate pipeline). */
export const RECRUIT_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR'] as const
/** Leave + first-level expense approvals. */
export const APPROVER_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR'] as const
/** Org administration (org settings, members, departments, teams). */
export const ORG_ADMIN_ROLES = ['OWNER', 'ADMIN'] as const
/** Roles that see the full project portfolio. Everyone else (staff) only sees
 *  projects they manage, are staffed on, or have tasks assigned in — enforced
 *  server-side on the projects, tasks and documents APIs. */
export const PROJECT_READ_ALL_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE'] as const
/** Roles that see org-scoped (vs self-scoped) dashboards. */
export const ORG_DASHBOARD_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE'] as const

export function hasAnyRole(role: string | null | undefined, allowed: readonly string[]): boolean {
  if (!role) return false
  return allowed.includes(role)
}

/** Human explanation used by the client "Access restricted" screen. */
export function moduleAccessLabel(
  role: string | null | undefined,
  overrides: Record<string, boolean> | null | undefined,
  moduleId: string,
): string {
  // custom deny on top of an allowed role default → admin-restricted
  if (role && canAccessModule(role, moduleId) && !effectiveModuleAccess(role, overrides, moduleId)) {
    return 'An administrator has restricted this module for your account. Ask an administrator if you need access.'
  }
  const allowed = MODULE_ACCESS[moduleId]
  if (!allowed) return 'Ask an administrator for access.'
  const pretty = allowed.map((r) => r.charAt(0) + r.slice(1).toLowerCase()).join(', ')
  return `This module is available to: ${pretty}. An administrator can also grant it to you individually.`
}
