'use client'

/**
 * OrgChart — reporting-hierarchy tree for the Org structure module.
 * Built from employee records (managerId links); each card shows the person,
 * their role/title/department and how many people report to them. Branches
 * are collapsible, and cycles or missing managers degrade to extra roots.
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, ROLE_TONE } from '@/lib/format'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Users, Building2 } from 'lucide-react'

export interface OrgEmployee {
  id: string // membership id
  name: string
  avatarUrl: string | null
  title: string | null
  role: string
  departmentId: string | null
  departmentName: string | null
  managerId: string | null
  managerName: string | null
}

interface TreeNode {
  member: OrgEmployee
  children: TreeNode[]
  depth: number
}

const ROLE_WEIGHT: Record<string, number> = {
  OWNER: 0, ADMIN: 1, MANAGER: 2, HR: 3, FINANCE: 4,
  EMPLOYEE: 5, CONTRACTOR: 6, INTERN: 7,
}

/** build the forest: roots = members without a (valid) manager; cycle-safe */
function buildForest(employees: OrgEmployee[]): TreeNode[] {
  const byId = new Map(employees.map((e) => [e.id, e]))
  const childrenOf = new Map<string, OrgEmployee[]>()
  const rootCandidates: OrgEmployee[] = []

  for (const e of employees) {
    if (e.managerId && e.managerId !== e.id && byId.has(e.managerId)) {
      const arr = childrenOf.get(e.managerId) ?? []
      arr.push(e)
      childrenOf.set(e.managerId, arr)
    } else {
      rootCandidates.push(e)
    }
  }

  const sortMembers = (a: OrgEmployee, b: OrgEmployee) =>
    (ROLE_WEIGHT[a.role] ?? 8) - (ROLE_WEIGHT[b.role] ?? 8) || a.name.localeCompare(b.name)

  // depth-first walk with a visited guard: root candidates enter as roots,
  // everyone else as a child; members stuck in reporting cycles are promoted
  // to extra roots so nobody disappears
  const visited = new Set<string>()
  const roots: OrgEmployee[] = []
  const walk = (e: OrgEmployee, isRoot: boolean) => {
    if (visited.has(e.id)) return
    visited.add(e.id)
    if (isRoot) roots.push(e)
    for (const c of (childrenOf.get(e.id) ?? []).sort(sortMembers)) walk(c, false)
  }
  for (const r of [...rootCandidates].sort(sortMembers)) walk(r, true)
  for (const e of [...employees].sort(sortMembers)) {
    if (!visited.has(e.id)) walk(e, true)
  }

  const toNode = (member: OrgEmployee, depth: number, seen: Set<string>): TreeNode => {
    const nextSeen = new Set(seen)
    nextSeen.add(member.id)
    const children = (childrenOf.get(member.id) ?? [])
      .filter((c) => !nextSeen.has(c.id))
      .sort(sortMembers)
      .map((c) => toNode(c, depth + 1, nextSeen))
    return { member, children, depth }
  }

  return roots.map((r) => toNode(r, 0, new Set()))
}

export function OrgChart({ employees }: { employees: OrgEmployee[] }) {
  const forest = useMemo(() => buildForest(employees), [employees])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const managers = employees.filter((e) => e.managerId).length

  if (employees.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        The chart appears once your organization has members.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {employees.length} member{employees.length === 1 ? '' : 's'} · {managers} reporting line{managers === 1 ? '' : 's'} ·
          reporting relationships come from each employee record (HR → Employees → Reports to).
        </p>
        {collapsed.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => setCollapsed(new Set())}
          >
            <ChevronDown className="size-3.5" aria-hidden /> Expand all
          </Button>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <ul className="flex w-max min-w-full flex-col gap-4">
          {forest.map((root, i) => (
            <li key={root.member.id} className="relative">
              {i > 0 && <div className="absolute -top-4 left-7 h-4 w-px bg-border" aria-hidden />}
              <Node node={root} collapsed={collapsed} onToggle={toggle} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Node({ node, collapsed, onToggle }: {
  node: TreeNode
  collapsed: Set<string>
  onToggle: (id: string) => void
}) {
  const { member, children, depth } = node
  const isCollapsed = collapsed.has(member.id)
  const hasChildren = children.length > 0

  return (
    <div className="flex flex-col gap-3">
      {/* person card */}
      <div
        className={cn(
          'flex w-full max-w-md items-center gap-3 rounded-xl border bg-card px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md sm:px-4',
          depth === 0 && 'border-emerald-600/30'
        )}
      >
        <UserAvatar name={member.name} avatarUrl={member.avatarUrl} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{member.name}</p>
            {member.role === 'OWNER' && (
              <span className="shrink-0 rounded border border-emerald-600/40 bg-emerald-600/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Founder
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{member.title ?? ROLE_LABELS[member.role] ?? member.role}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge label={ROLE_LABELS[member.role] ?? member.role} tone={ROLE_TONE[member.role] ?? 'outline'} />
            {member.departmentName && (
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Building2 className="size-2.5" aria-hidden /> {member.departmentName}
              </span>
            )}
            {hasChildren && (
              <button
                type="button"
                onClick={() => onToggle(member.id)}
                className="inline-flex min-h-6 items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `Expand ${member.name}'s reports` : `Collapse ${member.name}'s reports`}
              >
                <Users className="size-2.5" aria-hidden />
                {children.length} report{children.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
        {hasChildren && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onToggle(member.id)}
            aria-label={isCollapsed ? `Expand ${member.name}'s reports` : `Collapse ${member.name}'s reports`}
          >
            {isCollapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          </Button>
        )}
      </div>

      {/* children with connector lines */}
      {hasChildren && !isCollapsed && (
        <ul className="relative ml-7 space-y-3 border-l border-border pl-6 sm:ml-8 sm:pl-7">
          {children.map((c) => (
            <li key={c.member.id} className="relative before:absolute before:-left-6 before:top-6 before:h-px before:w-6 before:bg-border sm:before:-left-7 sm:before:w-7">
              <Node node={c} collapsed={collapsed} onToggle={onToggle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
