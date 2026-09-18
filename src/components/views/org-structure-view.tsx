'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar, AvatarStack } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { DEPARTMENT_COLORS, ROLE_LABELS, ROLE_TONE } from '@/lib/format'
import { Building2, ChevronDown, CornerDownRight, FoldVertical, GitBranch, Layers, Network, PencilLine, Plus, Search, Trash2, TriangleAlert, UnfoldVertical, UserCog, UserX, Users } from 'lucide-react'

// ---------- local types ----------

interface Department {
  id: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
  memberCount: number
  teamCount: number
}

interface TeamMember {
  id: string
  membershipId: string
  name: string
  avatarUrl: string | null
  role: string | null
}

interface Team {
  id: string
  name: string
  description: string | null
  departmentId: string | null
  departmentName: string | null
  members: TeamMember[]
  memberCount: number
}

interface Employee {
  id: string
  name: string
  avatarUrl: string | null
  title: string | null
  role: string
  departmentId: string | null
  departmentName: string | null
  managerId: string | null
}

const NONE = '__none__'
const UNASSIGNED_KEY = '__unassigned__'
const DEFAULT_EXPAND_DEPTH = 2

/** Reporting-tree node. `employee` is null for the "Unassigned reporting" pseudo-root. */
interface OrgNode {
  key: string
  employee: Employee | null
  children: OrgNode[]
  depth: number
}

/** OWNER first, then ADMIN, then everyone else — ties broken by name. */
const roleRank = (role: string) => (role === 'OWNER' ? 0 : role === 'ADMIN' ? 1 : 2)
const byRoleThenName = (a: Employee, b: Employee) =>
  roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name)

/**
 * CSS org-chart connector classes (Tailwind arbitrary pseudo-element variants,
 * so no globals.css changes are needed):
 * - OC_ITEM_*: each child draws a horizontal rail half on its left + right and
 *   a vertical stem (border-r of the left half) down to its own card;
 *   first/last children drop their outer stubs so the rail spans center-to-center
 * - OC_GROUP_*: a children row draws one vertical stem from the parent card
 */
const OC_ITEM_CONNECTED = [
  'relative px-1.5 pt-4',
  "before:absolute before:top-0 before:left-0 before:h-4 before:w-1/2 before:border-t before:border-r before:border-border before:content-['']",
  'first:before:border-t-0',
  "after:absolute after:top-0 after:left-1/2 after:h-0 after:w-1/2 after:border-t after:border-border after:content-['']",
  'last:after:hidden',
].join(' ')
const OC_GROUP = [
  'relative flex flex-nowrap items-start pt-4',
  "before:absolute before:top-0 before:left-1/2 before:h-4 before:border-l before:border-border before:content-['']",
].join(' ')

export default function OrgStructureView() {
  const { role } = useWorkspace()
  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'HR'

  const deptData = useData<{ items: Department[] }>('/api/departments')
  const teamData = useData<{ items: Team[] }>('/api/teams')
  const empData = useData<{ items: Employee[] }>('/api/hr/employees')

  const departments = deptData.data?.items ?? []
  const teams = teamData.data?.items ?? []
  const employees = empData.data?.items ?? []
  const loading = deptData.loading || teamData.loading

  const unassigned = employees.filter((e) => !e.departmentId).length

  // ordered department list: roots first, each followed by its children (for visual nesting)
  const ordered = useMemo(() => {
    const childrenOf = new Map<string, Department[]>()
    const roots: Department[] = []
    const seen = new Set<string>()
    departments.forEach((d) => {
      if (d.parentId && departments.some((p) => p.id === d.parentId)) {
        const arr = childrenOf.get(d.parentId) ?? []
        arr.push(d)
        childrenOf.set(d.parentId, arr)
      } else {
        roots.push(d)
      }
      seen.add(d.id)
    })
    const out: Array<{ dept: Department; depth: number }> = []
    const walk = (d: Department, depth: number) => {
      out.push({ dept: d, depth })
      ;(childrenOf.get(d.id) ?? []).forEach((c) => walk(c, depth + 1))
    }
    roots.forEach((r) => walk(r, 0))
    // safety: append any unseen (cycle) as roots
    departments.forEach((d) => {
      if (!out.some((o) => o.dept.id === d.id)) out.push({ dept: d, depth: 0 })
    })
    return out
  }, [departments])

  // department id → color (for org chart chips)
  const deptColor = useMemo(() => {
    const map = new Map<string, string>()
    departments.forEach((d) => map.set(d.id, d.color ?? DEPARTMENT_COLORS[0]))
    return map
  }, [departments])

  // ---------- org chart (manager hierarchy from /api/hr/employees) ----------

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<Set<string>>(new Set())

  /**
   * Cycle-safe reporting forest:
   * - roots = members with managerId null (OWNER → ADMIN → others, then name)
   * - a child's managerId is a membership id; children render under that member
   * - nodes whose manager chain never reaches a root (dangling managerId or a
   *   reporting cycle) are attached to an "Unassigned reporting" pseudo-root
   */
  const chart = useMemo(() => {
    const byId = new Map(employees.map((e) => [e.id, e]))
    const childrenOf = new Map<string, Employee[]>()
    const rootEmployees: Employee[] = []
    for (const e of employees) {
      if (!e.managerId) {
        rootEmployees.push(e)
      } else if (byId.has(e.managerId)) {
        const arr = childrenOf.get(e.managerId) ?? []
        arr.push(e)
        childrenOf.set(e.managerId, arr)
      }
      // managerId pointing at a missing membership → orphan, resolved below
    }
    for (const arr of childrenOf.values()) arr.sort(byRoleThenName)
    rootEmployees.sort(byRoleThenName)

    let maxDepth = 0
    const makeNode = (e: Employee, depth: number): OrgNode => {
      maxDepth = Math.max(maxDepth, depth)
      const node: OrgNode = { key: e.id, employee: e, children: [], depth }
      for (const child of childrenOf.get(e.id) ?? []) node.children.push(makeNode(child, depth + 1))
      return node
    }
    const roots = rootEmployees.map((r) => makeNode(r, 1))

    // un-reached members (dangling managerId or a reporting cycle) → pseudo-root subtree
    const reached = new Set<string>()
    const markReached = (e: Employee) => {
      if (reached.has(e.id)) return
      reached.add(e.id)
      for (const c of childrenOf.get(e.id) ?? []) markReached(c)
    }
    rootEmployees.forEach(markReached)
    const unreached = employees.filter((e) => !reached.has(e.id))
    const unassignedChildren: OrgNode[] = []
    if (unreached.length > 0) {
      const unreachedIds = new Set(unreached.map((e) => e.id))
      const claimed = new Set<string>()
      // for each un-reached member, walk up the manager chain to its topmost
      // unclaimed ancestor, then claim that ancestor's whole subtree (breaks cycles)
      const pseudoTops: Employee[] = []
      for (const e of [...unreached].sort(byRoleThenName)) {
        let top = e
        const path = new Set<string>([e.id])
        for (;;) {
          const mgr = top.managerId ? byId.get(top.managerId) : undefined
          if (!mgr || !unreachedIds.has(mgr.id) || path.has(mgr.id) || claimed.has(mgr.id)) break
          path.add(mgr.id)
          top = mgr
        }
        if (claimed.has(top.id)) continue
        claimed.add(top.id)
        pseudoTops.push(top)
        const stack: Employee[] = [top]
        while (stack.length > 0) {
          const cur = stack.pop()!
          for (const c of childrenOf.get(cur.id) ?? []) {
            if (!claimed.has(c.id) && !reached.has(c.id)) {
              claimed.add(c.id)
              stack.push(c)
            }
          }
        }
      }
      // materialize the pseudo subtrees; `built` guard drops cycle back-edges
      const built = new Set<string>()
      const buildPseudo = (e: Employee, depth: number): OrgNode => {
        built.add(e.id)
        maxDepth = Math.max(maxDepth, depth)
        const node: OrgNode = { key: e.id, employee: e, children: [], depth }
        for (const c of childrenOf.get(e.id) ?? []) {
          if (claimed.has(c.id) && !built.has(c.id)) node.children.push(buildPseudo(c, depth + 1))
        }
        return node
      }
      unassignedChildren.push(...pseudoTops.map((t) => buildPseudo(t, 2)))
      unassignedChildren.sort((a, b) => byRoleThenName(a.employee!, b.employee!))
    }
    const unassignedRoot: OrgNode | null =
      unassignedChildren.length > 0
        ? { key: UNASSIGNED_KEY, employee: null, children: unassignedChildren, depth: 1 }
        : null

    const managers = [...childrenOf.entries()].filter(([, arr]) => arr.length > 0).length
    return { roots, unassignedRoot, managers, depth: Math.max(maxDepth, 1), total: employees.length }
  }, [employees])

  const parentKeys = useMemo(() => {
    const keys: string[] = []
    const walk = (n: OrgNode) => {
      if (n.children.length > 0) keys.push(n.key)
      n.children.forEach(walk)
    }
    chart.roots.forEach(walk)
    if (chart.unassignedRoot) walk(chart.unassignedRoot)
    return keys
  }, [chart])

  const isExpanded = (node: OrgNode) =>
    !collapsed.has(node.key) && (node.depth <= DEFAULT_EXPAND_DEPTH || opened.has(node.key))

  const toggleNode = (node: OrgNode) => {
    const key = node.key
    if (isExpanded(node)) {
      setCollapsed((prev) => new Set(prev).add(key))
      setOpened((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    } else {
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      setOpened((prev) => new Set(prev).add(key))
    }
  }

  const expandAll = () => {
    setCollapsed(new Set())
    setOpened(new Set(parentKeys))
  }
  const collapseAll = () => {
    setCollapsed(new Set(parentKeys))
    setOpened(new Set())
  }

  const chartNodeCommon = {
    isExpanded,
    toggleNode,
    deptColor,
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Network}
        title="Org structure"
        description="Departments and teams that shape how work is organized."
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Departments" value={loading ? 0 : departments.length} sub="Top-level units" icon={Building2} tone="success" loading={loading} />
        <StatCard label="Teams" value={loading ? 0 : teams.length} sub="Cross-cutting groups" icon={Users} tone="info" loading={loading} />
        <StatCard label="Unassigned members" value={empData.loading ? 0 : unassigned} sub="No department yet" icon={UserX} tone="warning" loading={empData.loading} />
      </div>

      <Tabs defaultValue="orgchart">
        <TabsList>
          <TabsTrigger value="orgchart">Org chart</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        {/* ---------------- Org chart ---------------- */}
        <TabsContent value="orgchart" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden />
                <span className="font-medium text-foreground">{empData.loading ? '—' : chart.total}</span> members
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserCog className="size-3.5" aria-hidden />
                <span className="font-medium text-foreground">{empData.loading ? '—' : chart.managers}</span> managers
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Layers className="size-3.5" aria-hidden />
                <span className="font-medium text-foreground">{empData.loading ? '—' : chart.depth}</span> level{empData.loading || chart.depth > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="min-h-9" onClick={expandAll}>
                <UnfoldVertical className="size-4" aria-hidden /> Expand all
              </Button>
              <Button variant="outline" size="sm" className="min-h-9" onClick={collapseAll}>
                <FoldVertical className="size-4" aria-hidden /> Collapse all
              </Button>
            </div>
          </div>

          {empData.loading ? (
            <div className="flex flex-col items-center gap-6 py-4" aria-hidden>
              <Skeleton className="h-24 w-56 rounded-xl" />
              <div className="flex flex-wrap justify-center gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-56 rounded-xl" />
                ))}
              </div>
            </div>
          ) : empData.error ? (
            <EmptyState
              icon={TriangleAlert}
              title="Could not load the org chart"
              description={empData.error}
              action={
                <Button variant="outline" onClick={() => empData.refresh()}>
                  Try again
                </Button>
              }
            />
          ) : employees.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No members to chart"
              description="Once people join the organization, their reporting lines appear here."
            />
          ) : (
            <>
              {/* desktop: classic horizontal org chart (scrolls horizontally when wide) */}
              <div className="hidden overflow-x-auto pb-2 md:block">
                <div role="tree" aria-label="Organization reporting chart" className="flex w-max min-w-full items-start justify-center gap-8 py-2">
                  {chart.roots.map((node) => (
                    <OrgChartNode key={node.key} node={node} connected={false} {...chartNodeCommon} />
                  ))}
                  {chart.unassignedRoot && (
                    <OrgChartNode key={chart.unassignedRoot.key} node={chart.unassignedRoot} connected={false} {...chartNodeCommon} />
                  )}
                </div>
              </div>
              {/* mobile: indented list tree with a left rail */}
              <div role="tree" aria-label="Organization reporting chart" className="flex flex-col gap-2 md:hidden">
                {chart.roots.map((node) => (
                  <MobileOrgNode key={node.key} node={node} {...chartNodeCommon} />
                ))}
                {chart.unassignedRoot && <MobileOrgNode node={chart.unassignedRoot} {...chartNodeCommon} />}
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------------- Departments ---------------- */}
        <TabsContent value="departments" className="flex flex-col gap-4">
          {canManage && (
            <div className="flex justify-end">
              <DepartmentDialog
                departments={departments}
                onSaved={() => { deptData.refresh(); empData.refresh() }}
                trigger={
                  <Button className="min-h-11"><Plus className="mr-1.5 size-4" aria-hidden /> Add department</Button>
                }
              />
            </div>
          )}
          {deptData.loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
            </div>
          ) : deptData.error ? (
            <EmptyState icon={Building2} title="Could not load departments" description={deptData.error} />
          ) : departments.length === 0 ? (
            <EmptyState icon={Building2} title="No departments yet" description={canManage ? 'Create your first department to start grouping people.' : 'An admin or HR manager needs to create departments first.'} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ordered.map(({ dept, depth }) => (
                <div key={dept.id} className={cn(depth > 0 && 'md:col-start-1 xl:col-start-1')} style={depth > 0 ? { marginLeft: `${Math.min(depth, 3) * 28}px` } : undefined}>
                  <Card className="py-0">
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          {depth > 0 && <CornerDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: dept.color ?? '#10b981' }} aria-hidden />
                          <p className="truncate font-semibold">{dept.name}</p>
                        </div>
                        {canManage && (
                          <div className="flex shrink-0 gap-1">
                            <DepartmentDialog
                              departments={departments}
                              editing={dept}
                              onSaved={() => { deptData.refresh(); empData.refresh() }}
                              trigger={<Button variant="ghost" size="icon" className="size-9" aria-label={`Edit ${dept.name}`}><PencilLine className="size-4" /></Button>}
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-9 text-destructive hover:bg-destructive/10" aria-label={`Delete ${dept.name}`}>
                                  <Trash2 className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete “{dept.name}”?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    The department will be removed. This fails if members are still assigned to it.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                    onClick={async () => {
                                      try {
                                        await api(`/api/departments/${dept.id}`, { method: 'DELETE' })
                                        toast({ title: 'Department deleted', description: `${dept.name} was removed.` })
                                        deptData.refresh()
                                      } catch {
                                        // api() toasts (e.g. 'Department has members')
                                      }
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                      {dept.description && <p className="line-clamp-2 text-sm text-muted-foreground">{dept.description}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1.5"><Users className="size-3" aria-hidden /> {dept.memberCount} member{dept.memberCount === 1 ? '' : 's'}</Badge>
                        <Badge variant="outline" className="gap-1.5"><GitBranch className="size-3" aria-hidden /> {dept.teamCount} team{dept.teamCount === 1 ? '' : 's'}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Teams ---------------- */}
        <TabsContent value="teams" className="flex flex-col gap-4">
          {canManage && (
            <div className="flex justify-end">
              <TeamDialog
                departments={departments}
                employees={employees}
                onSaved={() => teamData.refresh()}
                trigger={<Button className="min-h-11"><Plus className="mr-1.5 size-4" aria-hidden /> Add team</Button>}
              />
            </div>
          )}
          {teamData.loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
            </div>
          ) : teamData.error ? (
            <EmptyState icon={Users} title="Could not load teams" description={teamData.error} />
          ) : teams.length === 0 ? (
            <EmptyState icon={Users} title="No teams yet" description={canManage ? 'Create a team and assign members to it.' : 'Teams appear here once management creates them.'} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {teams.map((t) => (
                <Card key={t.id} className="py-0">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{t.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {t.departmentName ? (
                            <Badge variant="outline" className="gap-1.5 text-xs"><Building2 className="size-3" aria-hidden /> {t.departmentName}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">No department</Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">{t.memberCount} member{t.memberCount === 1 ? '' : 's'}</Badge>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 gap-1">
                          <TeamDialog
                            departments={departments}
                            employees={employees}
                            editing={t}
                            onSaved={() => teamData.refresh()}
                            trigger={<Button variant="ghost" size="icon" className="size-9" aria-label={`Edit ${t.name}`}><PencilLine className="size-4" /></Button>}
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-9 text-destructive hover:bg-destructive/10" aria-label={`Delete ${t.name}`}>
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete “{t.name}”?</AlertDialogTitle>
                                <AlertDialogDescription>The team and its membership links will be removed. Members themselves are not affected.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      await api(`/api/teams/${t.id}`, { method: 'DELETE' })
                                      toast({ title: 'Team deleted', description: `${t.name} was removed.` })
                                      teamData.refresh()
                                    } catch {
                                      // api() toasts the error
                                    }
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                    {t.description && <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                    <div className="flex flex-col gap-2 border-t pt-3">
                      {t.members.length > 0 ? (
                        <>
                          <AvatarStack users={t.members} max={6} />
                          <ul className="flex flex-wrap gap-x-4 gap-y-1">
                            {t.members.slice(0, 8).map((m) => (
                              <li key={m.id} className="flex items-center gap-1.5 text-xs">
                                <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size="xs" />
                                <span className="font-medium">{m.name}</span>
                                {m.role && <span className="text-muted-foreground">· {m.role}</span>}
                              </li>
                            ))}
                            {t.members.length > 8 && <li className="text-xs text-muted-foreground">+{t.members.length - 8} more</li>}
                          </ul>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No members assigned yet.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------- org chart nodes ----------

interface NodeProps {
  node: OrgNode
  isExpanded: (node: OrgNode) => boolean
  toggleNode: (node: OrgNode) => void
  deptColor: Map<string, string>
}

function nodeBadges(node: OrgNode, deptColor: Map<string, string>, collapsed: boolean) {
  const e = node.employee
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {e && <StatusBadge label={ROLE_LABELS[e.role] ?? e.role} tone={ROLE_TONE[e.role] ?? 'outline'} className="px-2 py-0.5 text-[11px]" />}
      {e?.departmentId && e.departmentName && (
        <span className="inline-flex max-w-36 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: deptColor.get(e.departmentId) ?? DEPARTMENT_COLORS[0] }}
            aria-hidden
          />
          <span className="truncate">{e.departmentName}</span>
        </span>
      )}
      {node.children.length > 0 && collapsed && (
        <Badge variant="secondary" className="px-2 py-0.5 text-[11px]">+{node.children.length}</Badge>
      )}
    </div>
  )
}

function nodeLabel(node: OrgNode) {
  return node.employee?.name ?? 'Unassigned reporting'
}

/**
 * Desktop org-chart node — classic horizontal tree.
 * Connector pattern (pure CSS, no globals.css needed):
 * - the children row (role="group") draws a vertical stem from the parent card
 * - each child draws a horizontal rail half left + right of its center plus a
 *   vertical stem down to its own card; first/last children drop the outer stubs
 */
function OrgChartNode({ node, isExpanded, toggleNode, deptColor, connected }: NodeProps & { connected: boolean }) {
  const e = node.employee
  const hasChildren = node.children.length > 0
  const expanded = isExpanded(node)
  const onCardKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    if (ev.target !== ev.currentTarget) return // the chevron button handles its own keys
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      if (hasChildren) toggleNode(node)
    }
  }
  return (
    <div className={cn('flex flex-col items-center', connected && OC_ITEM_CONNECTED)}>
      <div
        role="treeitem"
        tabIndex={0}
        aria-level={node.depth}
        aria-selected={false}
        aria-expanded={hasChildren ? expanded : undefined}
        onKeyDown={onCardKeyDown}
        className="relative rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card
          className={cn(
            'min-w-56 py-0 transition-shadow hover:shadow-md',
            !e && 'border-dashed bg-muted/40'
          )}
        >
          <CardContent className="flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2.5">
              {e ? (
                <UserAvatar name={e.name} avatarUrl={e.avatarUrl} size="sm" />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background">
                  <UserX className="size-4 text-muted-foreground" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{nodeLabel(node)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e ? e.title ?? 'No title' : `${node.children.length} not linked to a manager`}
                </p>
              </div>
            </div>
            {nodeBadges(node, deptColor, !expanded)}
          </CardContent>
        </Card>
        {hasChildren && (
          <button
            type="button"
            onClick={() => toggleNode(node)}
            aria-label={`Toggle ${nodeLabel(node)}'s reports`}
            aria-expanded={expanded}
            className="absolute -bottom-3 left-1/2 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-muted"
          >
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div role="group" className={OC_GROUP}>
          {node.children.map((child) => (
            <OrgChartNode key={child.key} node={child} connected isExpanded={isExpanded} toggleNode={toggleNode} deptColor={deptColor} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Mobile org-chart node — indented list tree with a left rail + turn markers. */
function MobileOrgNode({ node, isExpanded, toggleNode, deptColor }: NodeProps) {
  const e = node.employee
  const hasChildren = node.children.length > 0
  const expanded = isExpanded(node)
  const onCardKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    if (ev.target !== ev.currentTarget) return
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      if (hasChildren) toggleNode(node)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        role="treeitem"
        tabIndex={0}
        aria-level={node.depth}
        aria-selected={false}
        aria-expanded={hasChildren ? expanded : undefined}
        onKeyDown={onCardKeyDown}
        className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-lg border bg-card p-3',
            !e && 'border-dashed bg-muted/40'
          )}
        >
          {e ? (
            <UserAvatar name={e.name} avatarUrl={e.avatarUrl} size="sm" />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background">
              <UserX className="size-4 text-muted-foreground" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{nodeLabel(node)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {e ? e.title ?? 'No title' : `${node.children.length} not linked to a manager`}
            </p>
            <div className="mt-1.5">{nodeBadges(node, deptColor, !expanded)}</div>
          </div>
          {hasChildren && (
            <button
              type="button"
              onClick={() => toggleNode(node)}
              aria-label={`Toggle ${nodeLabel(node)}'s reports`}
              aria-expanded={expanded}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div role="group" className="ml-4 flex flex-col gap-2 self-stretch border-l border-border pl-4">
          {node.children.map((child) => (
            <div key={child.key} className="relative flex flex-col gap-2">
              <CornerDownRight className="absolute -left-4 top-3.5 size-4 text-muted-foreground/70" aria-hidden />
              <MobileOrgNode node={child} isExpanded={isExpanded} toggleNode={toggleNode} deptColor={deptColor} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- department dialog ----------

function DepartmentDialog({
  departments, editing, onSaved, trigger,
}: {
  departments: Department[]
  editing?: Department
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>(DEPARTMENT_COLORS[0])
  const [parentId, setParentId] = useState(NONE)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setColor(editing?.color ?? DEPARTMENT_COLORS[0])
    setParentId(editing?.parentId ?? NONE)
  }

  // exclude self + descendants from parent options (no cycles)
  const descendantIds = useMemo(() => {
    if (!editing) return new Set<string>()
    const childrenOf = new Map<string, string[]>()
    departments.forEach((d) => {
      if (d.parentId) {
        const arr = childrenOf.get(d.parentId) ?? []
        arr.push(d.id)
        childrenOf.set(d.parentId, arr)
      }
    })
    const banned = new Set<string>([editing.id])
    const queue = [editing.id]
    while (queue.length) {
      const cur = queue.pop()!
      ;(childrenOf.get(cur) ?? []).forEach((c) => {
        if (!banned.has(c)) { banned.add(c); queue.push(c) }
      })
    }
    return banned
  }, [departments, editing])

  async function save() {
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give the department a name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        parentId: parentId === NONE ? null : parentId,
      }
      if (editing) {
        await api(`/api/departments/${editing.id}`, { method: 'PATCH', body: payload })
        toast({ title: 'Department updated', description: `${name.trim()} was saved.` })
      } else {
        await api('/api/departments', { method: 'POST', body: payload })
        toast({ title: 'Department created', description: `${name.trim()} is ready for members.` })
      }
      onSaved()
      setOpen(false)
    } catch {
      // api() toasts the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset() }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add department'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update the department details.' : 'Group employees into a department — assign people from the Employees module.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept-name">Name *</Label>
            <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer Success" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept-desc">Description</Label>
            <Textarea id="dept-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this department owns…" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Department color">
              {DEPARTMENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn('flex size-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110', color === c ? 'border-foreground' : 'border-transparent')}
                >
                  <span className="size-5 rounded-full" style={{ backgroundColor: c }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Parent department</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="w-full" aria-label="Parent department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No parent (top level)</SelectItem>
                {departments
                  .filter((d) => !descendantIds.has(d.id))
                  .map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Child departments are shown indented under their parent.</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create department'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- team dialog ----------

function TeamDialog({
  departments, employees, editing, onSaved, trigger,
}: {
  departments: Department[]
  employees: Employee[]
  editing?: Team
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [departmentId, setDepartmentId] = useState(NONE)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setDepartmentId(editing?.departmentId ?? NONE)
    setMemberIds(editing?.members.map((m) => m.membershipId) ?? [])
    setMemberSearch('')
  }

  const visibleEmployees = employees.filter((e) =>
    !memberSearch.trim() || e.name.toLowerCase().includes(memberSearch.trim().toLowerCase())
  )

  function toggleMember(id: string) {
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function save() {
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give the team a name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        departmentId: departmentId === NONE ? null : departmentId,
        memberIds,
      }
      if (editing) {
        await api(`/api/teams/${editing.id}`, { method: 'PATCH', body: payload })
        toast({ title: 'Team updated', description: `${name.trim()} was saved${memberIds.length ? ` with ${memberIds.length} member(s)` : ''}.` })
      } else {
        await api('/api/teams', { method: 'POST', body: payload })
        toast({ title: 'Team created', description: `${name.trim()} is ready.` })
      }
      onSaved()
      setOpen(false)
    } catch {
      // api() toasts the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset() }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add team'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Members you select replace the current team roster.' : 'Create a team and pick its members.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-name">Name *</Label>
              <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Growth Pod" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-full" aria-label="Team department"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="team-desc">Description</Label>
            <Textarea id="team-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this team works on…" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Members ({memberIds.length})</Label>
              <span className="text-xs text-muted-foreground">checkboxes replace the roster on save</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Filter people…" className="pl-9" aria-label="Filter members" />
            </div>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-2" role="group" aria-label="Team members">
              {visibleEmployees.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No people match.</p>
              ) : (
                visibleEmployees.map((e) => (
                  <label key={e.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted/60">
                    <Checkbox checked={memberIds.includes(e.id)} onCheckedChange={() => toggleMember(e.id)} aria-label={`Select ${e.name}`} />
                    <UserAvatar name={e.name} avatarUrl={e.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">{e.departmentName ?? 'No department'}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create team'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
