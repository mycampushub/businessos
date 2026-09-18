'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { fmtDate, ROLE_LABELS, ROLE_TONE, ROLES, EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPES, type BadgeTone } from '@/lib/format'
import { Briefcase, Building2, CalendarPlus, ChevronRight, Search, Users, UserRoundSearch, PencilLine, Save } from 'lucide-react'

// ---------- local types ----------

interface Employee {
  id: string // membership id — PATCH uses this
  userId: string
  employeeCode: string | null
  name: string
  email: string
  avatarUrl: string | null
  phone: string | null
  title: string | null
  role: string
  status: string
  employmentType: string
  joinedAt: string
  departmentId: string | null
  departmentName: string | null
  managerId: string | null
  managerName: string | null
}

interface Department {
  id: string
  name: string
  color: string | null
}

const MEMBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active', ON_LEAVE: 'On leave', PROBATION: 'Probation', RESIGNED: 'Resigned', TERMINATED: 'Terminated', ALUMNI: 'Alumni',
}
const MEMBER_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success', ON_LEAVE: 'info', PROBATION: 'warning', RESIGNED: 'muted', TERMINATED: 'destructive', ALUMNI: 'muted',
}

const NONE = '__none__'

const NEW_QUARTER_MS = 90 * 24 * 60 * 60 * 1000

export default function HrEmployeesView() {
  const { role } = useWorkspace()
  const canEdit = role === 'OWNER' || role === 'ADMIN' || role === 'HR'

  const empData = useData<{ items: Employee[] }>('/api/hr/employees')
  const deptData = useData<{ items: Department[] }>('/api/departments')

  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selected, setSelected] = useState<Employee | null>(null)

  const employees = empData.data?.items ?? []
  const departments = deptData.data?.items ?? []
  const deptColor = useMemo(() => {
    const m = new Map<string, string>()
    departments.forEach((d) => m.set(d.id, d.color ?? '#10b981'))
    return m
  }, [departments])

  // ---------- stats ----------
  const total = employees.length
  const newThisQuarter = employees.filter((e) => Date.now() - new Date(e.joinedAt).getTime() < NEW_QUARTER_MS).length
  const contractors = employees.filter((e) => e.employmentType === 'CONTRACT' || e.employmentType === 'FREELANCE').length

  // ---------- client-side filters ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (deptFilter !== 'all' && (e.departmentId ?? NONE) !== deptFilter) return false
      if (roleFilter !== 'all' && e.role !== roleFilter) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.title ?? '').toLowerCase().includes(q) ||
        (e.employeeCode ?? '').toLowerCase().includes(q) ||
        (e.departmentName ?? '').toLowerCase().includes(q)
      )
    })
  }, [employees, search, deptFilter, roleFilter])

  const loading = empData.loading || deptData.loading

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Users}
        title="Employees"
        description="Directory, roles and employment details of everyone in the organization."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total employees" value={loading ? 0 : total} sub="Active organization members" icon={Users} tone="success" loading={loading} />
        <StatCard label="Departments" value={loading ? 0 : departments.length} sub="Across the org" icon={Building2} tone="info" loading={loading} />
        <StatCard label="New this quarter" value={loading ? 0 : newThisQuarter} sub="Joined in last 90 days" icon={CalendarPlus} tone="warning" loading={loading} />
        <StatCard label="Contractors" value={loading ? 0 : contractors} sub="Contract & freelance" icon={Briefcase} tone="danger" loading={loading} />
      </div>

      {/* Filters */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, title, code…"
              className="pl-9"
              aria-label="Search employees"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by department">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter by role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Directory table */}
      {loading ? (
        <Card className="py-0">
          <CardContent className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : empData.error ? (
        <EmptyState icon={UserRoundSearch} title="Could not load employees" description={empData.error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="No employees match"
          description={employees.length === 0 ? 'No members have joined this organization yet.' : 'Try adjusting your search or filters.'}
          action={
            employees.length > 0 ? (
              <Button variant="outline" onClick={() => { setSearch(''); setDeptFilter('all'); setRoleFilter('all') }}>Clear filters</Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="py-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Manager</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(e)}
                    aria-label={`Open ${e.name}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={e.name} avatarUrl={e.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{e.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{e.title ?? 'No title'}</p>
                          {e.employeeCode && <p className="font-mono text-[10px] text-muted-foreground">{e.employeeCode}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {e.departmentName ? (
                        <span className="flex items-center gap-2 text-sm">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: deptColor.get(e.departmentId ?? '') ?? '#10b981' }} aria-hidden />
                          {e.departmentName}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-36 truncate text-sm text-muted-foreground lg:table-cell">{e.managerName ?? '—'}</TableCell>
                    <TableCell><StatusBadge label={ROLE_LABELS[e.role] ?? e.role} tone={ROLE_TONE[e.role] ?? 'outline'} /></TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{EMPLOYMENT_TYPE_LABELS[e.employmentType] ?? e.employmentType}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{fmtDate(e.joinedAt)}</TableCell>
                    <TableCell>
                      <StatusBadge label={MEMBER_STATUS_LABELS[e.status] ?? e.status} tone={MEMBER_STATUS_TONE[e.status] ?? 'outline'} />
                    </TableCell>
                    <TableCell className="text-muted-foreground"><ChevronRight className="size-4" aria-hidden /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {total} employees · click a row for the full profile{canEdit ? ' and edit' : ''}
          </p>
        </Card>
      )}

      {/* Detail / edit dialog */}
      <EmployeeDialog
        employee={selected}
        canEdit={canEdit}
        employees={employees}
        departments={departments}
        onClose={() => setSelected(null)}
        onSaved={() => { empData.refresh(); deptData.refresh() }}
      />
    </div>
  )
}

// ---------- detail + edit dialog ----------

interface FormState {
  role: string
  title: string
  departmentId: string // sentinel NONE
  managerId: string // sentinel NONE
  employmentType: string
  status: string
  phone: string
}

function EmployeeDialog({
  employee, canEdit, employees, departments, onClose, onSaved,
}: {
  employee: Employee | null
  canEdit: boolean
  employees: Employee[]
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const open = !!employee

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {employee && (
          <EmployeeDialogBody
            key={employee.id}
            employee={employee}
            canEdit={canEdit}
            employees={employees}
            departments={departments}
            saving={saving}
            setSaving={setSaving}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EmployeeDialogBody({
  employee, canEdit, employees, departments, saving, setSaving, onClose, onSaved,
}: {
  employee: Employee
  canEdit: boolean
  employees: Employee[]
  departments: Department[]
  saving: boolean
  setSaving: (v: boolean) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>({
    role: employee.role,
    title: employee.title ?? '',
    departmentId: employee.departmentId ?? NONE,
    managerId: employee.managerId ?? NONE,
    employmentType: employee.employmentType,
    status: employee.status,
    phone: employee.phone ?? '',
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    // only send fields that actually changed — avoids re-sending the OWNER role
    // (backend rejects OWNER assignment from non-owners) and empty PATCHes
    const payload: Record<string, unknown> = {}
    if (form.role !== employee.role) payload.role = form.role
    if (form.title !== (employee.title ?? '')) payload.title = form.title
    const deptId = form.departmentId === NONE ? '' : form.departmentId
    if (deptId !== (employee.departmentId ?? '')) payload.departmentId = deptId
    const mgrId = form.managerId === NONE ? '' : form.managerId
    if (mgrId !== (employee.managerId ?? '')) payload.managerId = mgrId
    if (form.employmentType !== employee.employmentType) payload.employmentType = form.employmentType
    if (form.status !== employee.status) payload.status = form.status
    if (form.phone !== (employee.phone ?? '')) payload.phone = form.phone

    if (!Object.keys(payload).length) {
      toast({ title: 'Nothing to update', description: 'No changes were made to this record.' })
      onClose()
      return
    }
    setSaving(true)
    try {
      await api(`/api/hr/employees/${employee.id}`, { method: 'PATCH', body: payload })
      toast({ title: 'Employee updated', description: `${employee.name}'s record was saved.` })
      onSaved()
      onClose()
    } catch {
      // api() already toasts the error
    } finally {
      setSaving(false)
    }
  }

  const managers = employees.filter((e) => e.id !== employee.id)

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-4">
          <UserAvatar name={employee.name} avatarUrl={employee.avatarUrl} size="lg" />
          <div className="min-w-0">
            <DialogTitle className="truncate">{employee.name}</DialogTitle>
            <DialogDescription className="truncate">
              {employee.title ?? 'No title'} · {employee.email}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Employee code</p><p className="font-mono text-xs">{employee.employeeCode ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">Role</p><StatusBadge label={ROLE_LABELS[employee.role] ?? employee.role} tone={ROLE_TONE[employee.role] ?? 'outline'} /></div>
        <div><p className="text-xs text-muted-foreground">Department</p><p className="truncate">{employee.departmentName ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">Manager</p><p className="truncate">{employee.managerName ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">Joined</p><p>{fmtDate(employee.joinedAt)}</p></div>
        <div><p className="text-xs text-muted-foreground">Employment</p><p>{EMPLOYMENT_TYPE_LABELS[employee.employmentType] ?? employee.employmentType}</p></div>
        <div><p className="text-xs text-muted-foreground">Phone</p><p className="truncate">{employee.phone ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">Status</p><p>{MEMBER_STATUS_LABELS[employee.status] ?? employee.status}</p></div>
      </div>

      {canEdit ? (
        <>
          <div className="flex items-center gap-2 pt-1 text-sm font-medium">
            <PencilLine className="size-4 text-muted-foreground" aria-hidden /> Edit employment record
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="emp-role">Role</Label>
              <Select value={form.role} onValueChange={(v) => set('role', v)}>
                <SelectTrigger id="emp-role" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="emp-title">Title</Label>
              <Input id="emp-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Senior Engineer" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="emp-dept">Department</Label>
              <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
                <SelectTrigger id="emp-dept" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="emp-manager">Manager</Label>
              <Select value={form.managerId} onValueChange={(v) => set('managerId', v)}>
                <SelectTrigger id="emp-manager" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No manager</SelectItem>
                  {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="emp-type">Employment type</Label>
              <Select value={form.employmentType} onValueChange={(v) => set('employmentType', v)}>
                <SelectTrigger id="emp-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="emp-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger id="emp-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MEMBER_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input id="emp-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+8801…" />
            </div>
          </div>
          <DialogFooter className="mt-2 gap-2">
            <Badge variant="outline" className="mr-auto gap-1.5 text-muted-foreground">
              <Save className="size-3" aria-hidden /> Saving writes an audit entry
            </Badge>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      )}
    </>
  )
}
