'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  DEPARTMENT_COLORS,
  ROLE_LABELS,
  ROLE_TONE,
  currencySymbol,
  fmtDate,
  minutesToHours,
  type BadgeTone,
} from '@/lib/format'
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Info,
  Lock,
  Network,
  PencilLine,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------- local types (API shapes from worklog T1-a/T1-c/T3-a) ----------

interface OrgDetail {
  id: string
  name: string
  slug: string
  description: string | null
  industry: string | null
  orgType: string | null
  website: string | null
  country: string | null
  timezone: string
  currency: string
  plan: string
  ownerId: string
  createdAt: string
}

interface DepartmentItem {
  id: string
  name: string
  description: string | null
  color: string | null
  memberCount: number
  teamCount: number
}

interface TeamItem {
  id: string
  name: string
  memberCount: number
}

/** GET /api/hr/leave-types item (T3-a). */
interface LeaveTypeItem {
  id: string
  name: string
  daysPerYear: number
  color: string | null
  paid: boolean
  requestCount: number
}

/** GET /api/hr/holidays item + workDays (T5-a frozen contract). */
interface HolidayItem {
  id: string
  name: string
  type: string
  startDate: string
  endDate: string
  days: number
  description: string | null
}

/** GET /api/settings/policy → { policy } (T3-a + T5 late-penalty fields). */
interface PolicyItem {
  id: string
  orgId: string
  checkInTime: string
  checkOutTime: string
  lateGraceMins: number
  halfDayMins: number
  fullDayMins: number
  workDays: string // CSV, Mon=1..Sun=7
  overtimeEnabled: boolean
  payrollDay: number
  latePenaltyEnabled: boolean
  latePenaltyThreshold: number // 1..31
  latePenaltyMode: string // 'HALF_DAY' | 'AMOUNT'
  latePenaltyAmount: number
}

/** GET /api/settings/access item (T3-a). */
interface AccessItem {
  module: string
  role: string
  level: 'FULL' | 'VIEW' | 'HIDDEN'
}

// ---------- static vocabularies ----------

const ORG_TYPES = ['Company', 'Startup', 'Agency', 'Team', 'Consultancy', 'Nonprofit', 'Community', 'Other'] as const

const CURRENCIES: Array<{ code: string; label: string }> = [
  { code: 'BDT', label: 'BDT — Bangladeshi Taka (৳)' },
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — Pound Sterling (£)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
  { code: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
]

const TIMEZONES = [
  'Asia/Dhaka',
  'UTC',
  'Asia/Kolkata',
  'Europe/London',
  'America/New_York',
  'Asia/Singapore',
  'Asia/Dubai',
] as const

const PLAN_TONE: Record<string, BadgeTone> = {
  Free: 'muted',
  Starter: 'outline',
  Growth: 'info',
  Business: 'success',
  Enterprise: 'warning',
}

const WEEKDAYS: Array<{ v: number; label: string }> = [
  { v: 1, label: 'Mon' },
  { v: 2, label: 'Tue' },
  { v: 3, label: 'Wed' },
  { v: 4, label: 'Thu' },
  { v: 5, label: 'Fri' },
  { v: 6, label: 'Sat' },
  { v: 7, label: 'Sun' },
]

/** The 19 matrix modules in ACCESS_MODULES order (server contract) with friendly labels. */
const ACCESS_MODULES: Array<{ id: string; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'reports', label: 'Reports' },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'crm-leads', label: 'Leads' },
  { id: 'crm-deals', label: 'Deals' },
  { id: 'crm-contacts', label: 'Contacts & Clients' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'hr-employees', label: 'Employees' },
  { id: 'hr-attendance', label: 'Attendance' },
  { id: 'hr-leave', label: 'Leave' },
  { id: 'org-structure', label: 'Org Structure' },
  { id: 'recruit-jobs', label: 'Jobs' },
  { id: 'recruit-candidates', label: 'Candidates' },
  { id: 'finance-invoices', label: 'Invoices' },
  { id: 'finance-expenses', label: 'Expenses' },
  { id: 'finance-payroll', label: 'Payroll' },
  { id: 'documents', label: 'Documents' },
  { id: 'announcements', label: 'Announcements' },
]

/** Matrix columns: OWNER (locked) + the 7 editable roles. */
const MATRIX_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE', 'EMPLOYEE', 'CONTRACTOR', 'INTERN'] as const

const LEVEL_KEYS = ['FULL', 'VIEW', 'HIDDEN'] as const
type LevelKey = (typeof LEVEL_KEYS)[number]

const LEVEL_META: Record<LevelKey, { label: string; cellLabel: string; description: string; icon: LucideIcon }> = {
  FULL: {
    label: 'Full',
    cellLabel: 'Full',
    description: 'View and manage everything in the module',
    icon: ShieldCheck,
  },
  VIEW: {
    label: 'View-only',
    cellLabel: 'View',
    description: 'See the module data but not change it',
    icon: Eye,
  },
  HIDDEN: {
    label: 'Hidden',
    cellLabel: 'Hidden',
    description: 'Invisible in the sidebar and blocked at the API',
    icon: EyeOff,
  },
}

const LEVEL_CELL_CLASSES: Record<LevelKey, string> = {
  FULL: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/20',
  VIEW: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20',
  HIDDEN: 'border-border bg-muted/60 text-muted-foreground hover:bg-muted',
}

const LEVEL_TEXT_CLASSES: Record<LevelKey, string> = {
  FULL: 'text-emerald-600 dark:text-emerald-400',
  VIEW: 'text-amber-600 dark:text-amber-400',
  HIDDEN: 'text-muted-foreground',
}

const LEVEL_TONE: Record<string, BadgeTone> = { FULL: 'success', VIEW: 'warning', HIDDEN: 'muted' }

// ---------- helpers ----------

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function intIn(raw: string, min: number, max: number): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  if (n < min || n > max) return null
  return n
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function workDaysLabel(days: number[]): string {
  if (days.length === 7) return 'Every day'
  if (days.length === 0) return '—'
  return days
    .map((d) => WEEKDAYS.find((w) => w.v === d)?.label)
    .filter(Boolean)
    .join(', ')
}

// ---------- holiday helpers (T5) ----------

const HOLIDAY_TYPE_LABELS: Record<string, string> = { GOVT: 'Government', COMPANY: 'Company', CUSTOM: 'Custom' }
const HOLIDAY_TYPE_TONE: Record<string, BadgeTone> = { GOVT: 'warning', COMPANY: 'info', CUSTOM: 'muted' }

/** Holiday ISO dates are UTC midnights — parse the date part at local noon for stable display. */
function holidayDate(iso: string): string {
  return fmtDate(iso.slice(0, 10) + 'T12:00:00')
}

function holidayWeekday(h: HolidayItem): string {
  const start = new Date(h.startDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
  if (h.days === 1) return start
  const end = new Date(h.endDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
  return `${start} – ${end}`
}

function HolidayTypeBadge({ type }: { type: string }) {
  return <StatusBadge label={HOLIDAY_TYPE_LABELS[type] ?? type} tone={HOLIDAY_TYPE_TONE[type] ?? 'outline'} dot={false} />
}

function lockNotice(text: string) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{text}</p>
    </div>
  )
}

// ---------- Rules tab state (hoisted so unsaved changes survive tab switches) ----------

interface PolicyForm {
  checkInTime: string
  checkOutTime: string
  lateGraceMins: string
  halfDayMins: string
  fullDayMins: string
  workDays: number[]
  overtimeEnabled: boolean
  payrollDay: string
  latePenaltyEnabled: boolean
  latePenaltyThreshold: string
  latePenaltyMode: string
  latePenaltyAmount: string
}

type PolicyStringField =
  | 'checkInTime'
  | 'checkOutTime'
  | 'lateGraceMins'
  | 'halfDayMins'
  | 'fullDayMins'
  | 'payrollDay'
  | 'latePenaltyThreshold'
  | 'latePenaltyAmount'

function policyToForm(p: PolicyItem): PolicyForm {
  return {
    checkInTime: p.checkInTime,
    checkOutTime: p.checkOutTime,
    lateGraceMins: String(p.lateGraceMins),
    halfDayMins: String(p.halfDayMins),
    fullDayMins: String(p.fullDayMins),
    workDays: p.workDays
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => n >= 1 && n <= 7)
      .sort((a, b) => a - b),
    overtimeEnabled: p.overtimeEnabled,
    payrollDay: String(p.payrollDay),
    latePenaltyEnabled: p.latePenaltyEnabled,
    latePenaltyThreshold: String(p.latePenaltyThreshold),
    latePenaltyMode: p.latePenaltyMode === 'AMOUNT' ? 'AMOUNT' : 'HALF_DAY',
    latePenaltyAmount: String(p.latePenaltyAmount),
  }
}

function useRulesTab(canEdit: boolean) {
  const { data, loading, refresh } = useData<{ policy: PolicyItem }>(canEdit ? '/api/settings/policy' : null)
  const [form, setForm] = useState<PolicyForm | null>(null)
  const [snapshot, setSnapshot] = useState<PolicyForm | null>(null)
  const [saving, setSaving] = useState(false)

  // Re-sync from the server whenever fresh policy data arrives.
  useEffect(() => {
    const p = data?.policy
    if (!p) {
      setForm(null)
      setSnapshot(null)
      return
    }
    const f = policyToForm(p)
    setForm(f)
    setSnapshot(f)
  }, [data])

  const dirty = useMemo(() => {
    if (!form || !snapshot) return false
    return (
      form.checkInTime !== snapshot.checkInTime ||
      form.checkOutTime !== snapshot.checkOutTime ||
      Number(form.lateGraceMins) !== Number(snapshot.lateGraceMins) ||
      Number(form.halfDayMins) !== Number(snapshot.halfDayMins) ||
      Number(form.fullDayMins) !== Number(snapshot.fullDayMins) ||
      form.workDays.join(',') !== snapshot.workDays.join(',') ||
      form.overtimeEnabled !== snapshot.overtimeEnabled ||
      Number(form.payrollDay) !== Number(snapshot.payrollDay) ||
      form.latePenaltyEnabled !== snapshot.latePenaltyEnabled ||
      Number(form.latePenaltyThreshold) !== Number(snapshot.latePenaltyThreshold) ||
      form.latePenaltyMode !== snapshot.latePenaltyMode ||
      Number(form.latePenaltyAmount) !== Number(snapshot.latePenaltyAmount)
    )
  }, [form, snapshot])

  const setField = useCallback((key: PolicyStringField, value: string) => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }, [])

  const toggleWorkDay = useCallback((d: number) => {
    setForm((f) => {
      if (!f) return f
      const has = f.workDays.includes(d)
      if (has && f.workDays.length === 1) return f // at least one work day must stay on
      const next = has ? f.workDays.filter((x) => x !== d) : [...f.workDays, d].sort((a, b) => a - b)
      return { ...f, workDays: next }
    })
  }, [])

  const setOvertime = useCallback((v: boolean) => {
    setForm((f) => (f ? { ...f, overtimeEnabled: v } : f))
  }, [])

  const setLatePenalty = useCallback((v: boolean) => {
    setForm((f) => (f ? { ...f, latePenaltyEnabled: v } : f))
  }, [])

  const setLatePenaltyMode = useCallback((m: string) => {
    setForm((f) => (f ? { ...f, latePenaltyMode: m } : f))
  }, [])

  const reset = useCallback(() => setForm(snapshot), [snapshot])

  const save = useCallback(async () => {
    if (!form || !snapshot) return
    const payload: Record<string, unknown> = {}
    const failSave = (msg: string) =>
      toast({ title: 'Cannot save rules', description: msg, variant: 'destructive' })

    if (form.checkInTime !== snapshot.checkInTime) {
      if (!HHMM_RE.test(form.checkInTime)) return failSave('Please use HH:MM format')
      payload.checkInTime = form.checkInTime
    }
    if (form.checkOutTime !== snapshot.checkOutTime) {
      if (!HHMM_RE.test(form.checkOutTime)) return failSave('Please use HH:MM format')
      payload.checkOutTime = form.checkOutTime
    }
    if (Number(form.lateGraceMins) !== Number(snapshot.lateGraceMins)) {
      const n = intIn(form.lateGraceMins, 0, 240)
      if (n === null) return failSave('lateGraceMins must be between 0 and 240')
      payload.lateGraceMins = n
    }
    if (Number(form.halfDayMins) !== Number(snapshot.halfDayMins)) {
      const n = intIn(form.halfDayMins, 30, 900)
      if (n === null) return failSave('halfDayMins must be between 30 and 900')
      payload.halfDayMins = n
    }
    if (Number(form.fullDayMins) !== Number(snapshot.fullDayMins)) {
      const n = intIn(form.fullDayMins, 30, 900)
      if (n === null) return failSave('fullDayMins must be between 30 and 900')
      payload.fullDayMins = n
    }
    if (form.workDays.join(',') !== snapshot.workDays.join(',')) {
      if (form.workDays.length === 0) return failSave('workDays must include at least one weekday (1-7)')
      payload.workDays = form.workDays.join(',')
    }
    if (form.overtimeEnabled !== snapshot.overtimeEnabled) {
      payload.overtimeEnabled = form.overtimeEnabled
    }
    if (Number(form.payrollDay) !== Number(snapshot.payrollDay)) {
      const n = intIn(form.payrollDay, 1, 28)
      if (n === null) return failSave('payrollDay must be between 1 and 28')
      payload.payrollDay = n
    }
    if (form.latePenaltyEnabled !== snapshot.latePenaltyEnabled) {
      payload.latePenaltyEnabled = form.latePenaltyEnabled
    }
    if (Number(form.latePenaltyThreshold) !== Number(snapshot.latePenaltyThreshold)) {
      const n = intIn(form.latePenaltyThreshold, 1, 31)
      if (n === null) return failSave('latePenaltyThreshold must be between 1 and 31')
      payload.latePenaltyThreshold = n
    }
    if (form.latePenaltyMode !== snapshot.latePenaltyMode) {
      if (form.latePenaltyMode !== 'HALF_DAY' && form.latePenaltyMode !== 'AMOUNT') {
        return failSave('latePenaltyMode must be HALF_DAY or AMOUNT')
      }
      payload.latePenaltyMode = form.latePenaltyMode
    }
    if (Number(form.latePenaltyAmount) !== Number(snapshot.latePenaltyAmount)) {
      const n = Number(form.latePenaltyAmount)
      if (form.latePenaltyAmount.trim() === '' || Number.isNaN(n) || n < 0 || n > 1_000_000) {
        return failSave('latePenaltyAmount must be between 0 and 1000000')
      }
      payload.latePenaltyAmount = n
    }

    if (Object.keys(payload).length === 0) {
      toast({ title: 'Nothing to save', description: 'No rule fields were changed.' })
      return
    }

    setSaving(true)
    try {
      await api('/api/settings/policy', { method: 'PUT', body: payload })
      toast({ title: 'Rules updated', description: 'Work & attendance rules have been saved.' })
      refresh()
    } catch {
      /* api() already toasts (e.g. HH:MM / range 422s) */
    } finally {
      setSaving(false)
    }
  }, [form, snapshot, refresh])

  return {
    loading, refresh, form, snapshot, dirty, saving, setField, toggleWorkDay, setOvertime,
    setLatePenalty, setLatePenaltyMode, reset, save,
  }
}

type RulesState = ReturnType<typeof useRulesTab>

// ---------- Access tab state (hoisted so pending changes survive tab switches) ----------

function useAccessMatrix(canEdit: boolean) {
  const { data, loading, refresh } = useData<{ items: AccessItem[] }>(canEdit ? '/api/settings/access' : null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const serverMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const it of data?.items ?? []) m[`${it.module}:${it.role}`] = it.level
    return m
  }, [data])

  // Re-sync local edits whenever fresh server data arrives (also clears after save).
  useEffect(() => {
    setOverrides({})
  }, [serverMap])

  const levelOf = useCallback(
    (module: string, role: string) => overrides[`${module}:${role}`] ?? serverMap[`${module}:${role}`] ?? 'HIDDEN',
    [overrides, serverMap]
  )

  const isDirtyCell = useCallback(
    (module: string, role: string) => {
      const key = `${module}:${role}`
      return overrides[key] !== undefined && serverMap[key] !== overrides[key]
    },
    [overrides, serverMap]
  )

  const changes = useMemo(() => {
    const list: Array<{ module: string; role: string; level: string }> = []
    for (const [key, level] of Object.entries(overrides)) {
      const idx = key.indexOf(':')
      const moduleId = key.slice(0, idx)
      const role = key.slice(idx + 1)
      if (role === 'OWNER') continue // OWNER rows are locked
      if (serverMap[key] === level) continue
      list.push({ module: moduleId, role, level })
    }
    return list
  }, [overrides, serverMap])

  const setLevel = useCallback(
    (module: string, role: string, level: string) => {
      setOverrides((o) => {
        const key = `${module}:${role}`
        if (serverMap[key] === level) {
          if (!(key in o)) return o
          const next = { ...o }
          delete next[key]
          return next
        }
        return { ...o, [key]: level }
      })
    },
    [serverMap]
  )

  const discard = useCallback(() => setOverrides({}), [])

  const save = useCallback(async () => {
    if (!changes.length) return
    setSaving(true)
    try {
      await api('/api/settings/access', { method: 'PUT', body: { changes } })
      toast({
        title: 'Access rules updated',
        description: 'Members will see the change on their next login/refresh.',
      })
      refresh()
    } catch {
      /* api() already toasts (422 invalid module/role/level) */
    } finally {
      setSaving(false)
    }
  }, [changes, refresh])

  return { loading, refresh, levelOf, isDirtyCell, changes, setLevel, discard, save, saving }
}

type AccessState = ReturnType<typeof useAccessMatrix>

// ---------- view ----------

export default function SettingsView() {
  const { me, org, role, navigate, refreshMe } = useWorkspace()

  const { data: departmentsData, loading: departmentsLoading } = useData<{ items: DepartmentItem[] }>(
    '/api/departments'
  )
  const { data: teamsData, loading: teamsLoading } = useData<{ items: TeamItem[] }>('/api/teams')

  const canEdit = role === 'OWNER' || role === 'ADMIN'
  const isOwner = role === 'OWNER'

  // Rules + Access state lives here (not inside TabsContent) so unsaved edits survive tab switches.
  const rules = useRulesTab(canEdit)
  const access = useAccessMatrix(canEdit)

  // full org row — available after the first PATCH (API returns it); store org is a lite shape
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null)

  // active settings tab (controlled — the Leave & Holidays card can jump to Rules)
  const [activeTab, setActiveTab] = useState('general')

  const [form, setForm] = useState<ProfileForm>({
    name: '',
    description: '',
    industry: '',
    orgType: 'Company',
    website: '',
    country: '',
    currency: 'BDT',
    timezone: 'Asia/Dhaka',
  })
  const [snapshot, setSnapshot] = useState<ProfileForm>({ ...form })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const base: ProfileForm = {
      name: orgDetail?.name ?? org?.name ?? '',
      description: orgDetail?.description ?? '',
      industry: orgDetail?.industry ?? '',
      orgType: orgDetail?.orgType ?? 'Company',
      website: orgDetail?.website ?? '',
      country: orgDetail?.country ?? '',
      currency: orgDetail?.currency ?? org?.currency ?? 'BDT',
      timezone: orgDetail?.timezone ?? 'Asia/Dhaka',
    }
    setForm(base)
    setSnapshot(base)
  }, [org, orgDetail])

  const dirtyCount = useMemo(
    () => FORM_KEYS.filter((k) => form[k].trim() !== snapshot[k].trim()).length,
    [form, snapshot]
  )

  const setField = (key: keyof ProfileForm, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', description: 'The organization name cannot be empty.', variant: 'destructive' })
      return
    }
    const payload: Record<string, string> = {}
    for (const k of FORM_KEYS) {
      const v = form[k].trim()
      if (v !== snapshot[k].trim()) payload[k] = v
    }
    if (Object.keys(payload).length === 0) {
      toast({ title: 'Nothing to save', description: 'No profile fields were changed.' })
      return
    }
    setSaving(true)
    try {
      const res = await api<{ org: OrgDetail }>('/api/orgs', { method: 'PATCH', body: payload })
      toast({ title: 'Organization updated', description: 'Profile changes have been saved.' })
      setOrgDetail(res.org)
      await refreshMe()
    } catch {
      /* api() already toasts */
    } finally {
      setSaving(false)
    }
  }

  const departments = departmentsData?.items ?? []
  const teams = teamsData?.items ?? []
  const maxDeptMembers = Math.max(1, ...departments.map((d) => d.memberCount))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Organization profile, structure, rules, leave and access"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <TabsList className="w-full max-w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="leave">Leave &amp; Holidays</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
        </TabsList>

        {/* ---------------- General ---------------- */}
        <TabsContent value="general" className="flex flex-col gap-6">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle>Organization profile</CardTitle>
              <CardDescription>
                Core identity for {org?.name ?? 'your organization'} — used across the workspace, invoices and
                documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {!canEdit && lockNotice('Only owners and admins can edit the organization profile. Contact an administrator for changes.')}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-name">Name</Label>
                  <Input
                    id="org-name"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="Organization name"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-industry">Industry</Label>
                  <Input
                    id="org-industry"
                    value={form.industry}
                    onChange={(e) => setField('industry', e.target.value)}
                    placeholder="e.g. Software & IT"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Organization type</Label>
                  <Select
                    value={form.orgType}
                    onValueChange={(v) => setField('orgType', v)}
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger className="w-full" aria-label="Organization type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-website">Website</Label>
                  <Input
                    id="org-website"
                    value={form.website}
                    onChange={(e) => setField('website', e.target.value)}
                    placeholder="https://…"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-country">Country</Label>
                  <Input
                    id="org-country"
                    value={form.country}
                    onChange={(e) => setField('country', e.target.value)}
                    placeholder="e.g. Bangladesh"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Currency</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) => setField('currency', v)}
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger className="w-full" aria-label="Currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label>Timezone</Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => setField('timezone', v)}
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger className="w-full sm:w-72" aria-label="Timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="org-description">Description</Label>
                  <Textarea
                    id="org-description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="What the organization does…"
                    className="resize-y"
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Only changed fields are submitted — untouched fields keep their current values.
                    {dirtyCount > 0 && <span className="ml-1 font-medium text-foreground">{dirtyCount} pending</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setForm(snapshot)}
                      disabled={saving || dirtyCount === 0}
                    >
                      Discard changes
                    </Button>
                    <Button onClick={save} disabled={saving || dirtyCount === 0}>
                      <Save className="size-4" aria-hidden />
                      {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-4">
            <CardHeader>
              <CardTitle>Workspace details</CardTitle>
              <CardDescription>Read-only identifiers of the active organization.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</dt>
                  <dd className="mt-1 break-all font-mono text-sm">{org?.slug ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan</dt>
                  <dd className="mt-1">
                    <StatusBadge
                      label={orgDetail?.plan ?? org?.plan ?? '—'}
                      tone={PLAN_TONE[orgDetail?.plan ?? org?.plan ?? ''] ?? 'outline'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {isOwner ? (
                      <>
                        <UserAvatar name={me?.user.name} avatarUrl={me?.user.avatarUrl} size="xs" />
                        <span className="truncate text-sm font-medium">{me?.user.name}</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currency</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {orgDetail?.currency ?? org?.currency ?? '—'}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({currencySymbol(orgDetail?.currency ?? org?.currency ?? 'BDT')})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timezone</dt>
                  <dd className="mt-1 text-sm font-medium">{orgDetail?.timezone ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {orgDetail ? fmtDate(orgDetail.createdAt) : '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {isOwner && (
            <Card className="border-destructive/40 gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <TriangleAlert className="size-4" aria-hidden />
                  Danger zone
                </CardTitle>
                <CardDescription>Irreversible organization operations — reserved for the production console.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Transfer ownership</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Move the OWNER role and billing responsibility to another member.
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button variant="outline" className="border-destructive/40 text-destructive" disabled>
                          <UserCog className="size-4" aria-hidden />
                          Transfer ownership
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Available in production console</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Delete organization</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Permanently delete the org, all members and every module&apos;s data.
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button variant="destructive" disabled>
                          <Trash2 className="size-4" aria-hidden />
                          Delete organization
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Available in production console</TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- Structure ---------------- */}
        <TabsContent value="structure" className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Departments"
              value={departments.length}
              sub="org units"
              icon={Building2}
              loading={departmentsLoading}
            />
            <StatCard
              label="Teams"
              value={teams.length}
              sub={`${teams.reduce((s, t) => s + t.memberCount, 0)} team members`}
              icon={Users}
              tone="info"
              loading={teamsLoading}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden />
                  Departments
                </CardTitle>
                <CardDescription>Headcount distribution across the organization.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {departmentsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
                ) : departments.length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title="No departments"
                    description="Create departments in the Org Structure module."
                    action={
                      <Button variant="outline" onClick={() => navigate('org-structure')}>
                        Open Org Structure
                      </Button>
                    }
                  />
                ) : (
                  <ul className="flex max-h-72 flex-col gap-2.5 overflow-y-auto pr-1" role="list">
                    {departments.map((d) => (
                      <li key={d.id} className="flex flex-col gap-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: d.color ?? '#10b981' }}
                              aria-hidden
                            />
                            <p className="truncate text-sm font-medium">{d.name}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {d.memberCount} {d.memberCount === 1 ? 'member' : 'members'} · {d.teamCount}{' '}
                            {d.teamCount === 1 ? 'team' : 'teams'}
                          </span>
                        </div>
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          role="presentation"
                          aria-label={`${d.name} headcount bar`}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(4, Math.round((d.memberCount / maxDeptMembers) * 100))}%`,
                              backgroundColor: d.color ?? '#10b981',
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="outline" className="self-start" onClick={() => navigate('org-structure')}>
                  <Network className="size-4" aria-hidden />
                  Manage in Org Structure
                </Button>
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" aria-hidden />
                  Teams
                </CardTitle>
                <CardDescription>Cross-functional squads and their sizes.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {teamsLoading ? (
                  <Skeleton className="h-16 w-full rounded-lg" />
                ) : teams.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No teams"
                    description="Teams are created in the Org Structure module."
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teams.map((t) => (
                      <Badge
                        key={t.id}
                        variant="outline"
                        className="gap-1.5 px-2.5 py-1.5 text-xs font-medium"
                      >
                        {t.name}
                        <span className="text-muted-foreground">
                          · {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </Badge>
                    ))}
                  </div>
                )}
                <Button variant="outline" className="self-start" onClick={() => navigate('org-structure')}>
                  <Network className="size-4" aria-hidden />
                  Manage in Org Structure
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- Rules ---------------- */}
        <TabsContent value="rules" className="flex flex-col gap-6">
          <RulesTab canEdit={canEdit} rules={rules} />
        </TabsContent>

        {/* ---------------- Leave & Holidays ---------------- */}
        <TabsContent value="leave" className="flex flex-col gap-6">
          <LeaveTab onGoToRules={() => setActiveTab('rules')} />
        </TabsContent>

        {/* ---------------- Access ---------------- */}
        <TabsContent value="access" className="flex flex-col gap-6">
          <AccessTab canEdit={canEdit} access={access} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------- Rules tab ----------

function RulesTab({ canEdit, rules }: { canEdit: boolean; rules: RulesState }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            Work &amp; attendance rules
          </CardTitle>
          <CardDescription>Used for attendance statuses, late tracking and payroll.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!canEdit ? (
            lockNotice(
              'Only owners and admins can view and edit work & attendance rules. Contact an administrator for changes.'
            )
          ) : rules.loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : !rules.form ? (
            <EmptyState
              icon={Clock}
              title="Rules unavailable"
              description="Work & attendance rules could not be loaded. Try again."
              action={
                <Button variant="outline" onClick={rules.refresh}>
                  Reload
                </Button>
              }
            />
          ) : (
            <RulesForm rules={rules} />
          )}
        </CardContent>
      </Card>

      <RulesInfoCard form={rules.form} />
    </div>
  )
}

function RulesForm({ rules }: { rules: RulesState }) {
  const { org } = useWorkspace()
  const form = rules.form
  if (!form) return null
  const currency = org?.currency ?? 'BDT'
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-checkin">Check-in time</Label>
          <Input
            id="policy-checkin"
            type="time"
            value={form.checkInTime}
            onChange={(e) => rules.setField('checkInTime', e.target.value)}
            disabled={rules.saving}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-checkout">Check-out time</Label>
          <Input
            id="policy-checkout"
            type="time"
            value={form.checkOutTime}
            onChange={(e) => rules.setField('checkOutTime', e.target.value)}
            disabled={rules.saving}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-grace">Late grace period (minutes)</Label>
          <Input
            id="policy-grace"
            type="number"
            min={0}
            max={240}
            value={form.lateGraceMins}
            onChange={(e) => rules.setField('lateGraceMins', e.target.value)}
            disabled={rules.saving}
          />
          <p className="text-xs text-muted-foreground">0–240 minutes of leeway after the check-in time.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-halfday">Half-day threshold (minutes)</Label>
          <Input
            id="policy-halfday"
            type="number"
            min={30}
            max={900}
            value={form.halfDayMins}
            onChange={(e) => rules.setField('halfDayMins', e.target.value)}
            disabled={rules.saving}
          />
          <p className="text-xs text-muted-foreground">30–900 minutes of total worked time per day.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-fullday">Full-day (minutes)</Label>
          <Input
            id="policy-fullday"
            type="number"
            min={30}
            max={900}
            value={form.fullDayMins}
            onChange={(e) => rules.setField('fullDayMins', e.target.value)}
            disabled={rules.saving}
          />
          <p className="text-xs text-muted-foreground">30–900 minutes expected per work day.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-payrollday">Payroll day</Label>
          <Input
            id="policy-payrollday"
            type="number"
            min={1}
            max={28}
            value={form.payrollDay}
            onChange={(e) => rules.setField('payrollDay', e.target.value)}
            disabled={rules.saving}
          />
          <p className="text-xs text-muted-foreground">Day of month payroll is paid.</p>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Work days</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Work days">
            {WEEKDAYS.map((d) => {
              const on = form.workDays.includes(d.v)
              const onlyOne = on && form.workDays.length === 1
              return (
                <button
                  key={d.v}
                  type="button"
                  aria-pressed={on}
                  disabled={onlyOne || rules.saving}
                  onClick={() => rules.toggleWorkDay(d.v)}
                  className={cn(
                    'min-h-9 rounded-full border px-3.5 text-xs font-medium transition-colors',
                    on
                      ? 'border-emerald-600/40 bg-emerald-600/12 text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted',
                    onlyOne && 'cursor-not-allowed opacity-60'
                  )}
                  title={onlyOne ? 'At least one work day must stay on' : undefined}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            At least one day must stay on — off-day check-ins are still marked PRESENT.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3.5 sm:col-span-2">
          <div className="min-w-0">
            <Label htmlFor="policy-overtime" className="text-sm">
              Overtime tracking
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Track hours worked beyond the standard work window.
            </p>
          </div>
          <Switch
            id="policy-overtime"
            checked={form.overtimeEnabled}
            onCheckedChange={(v) => rules.setOvertime(v)}
            disabled={rules.saving}
          />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border p-3.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="policy-latepenalty" className="text-sm">
                Late arrival penalties
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Charge payroll after repeated late arrivals in a month.
              </p>
            </div>
            <Switch
              id="policy-latepenalty"
              checked={form.latePenaltyEnabled}
              onCheckedChange={(v) => rules.setLatePenalty(v)}
              disabled={rules.saving}
            />
          </div>
          {form.latePenaltyEnabled && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="policy-latethreshold">Lates per month per penalty</Label>
                <Input
                  id="policy-latethreshold"
                  type="number"
                  min={1}
                  max={31}
                  value={form.latePenaltyThreshold}
                  onChange={(e) => rules.setField('latePenaltyThreshold', e.target.value)}
                  disabled={rules.saving}
                />
                <p className="text-xs text-muted-foreground">
                  Every N late arrivals in a month counts as one penalty occurrence.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Penalty mode</Label>
                <Select
                  value={form.latePenaltyMode}
                  onValueChange={(v) => rules.setLatePenaltyMode(v)}
                  disabled={rules.saving}
                >
                  <SelectTrigger className="w-full" aria-label="Late penalty mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HALF_DAY">Half-day salary deduction</SelectItem>
                    <SelectItem value="AMOUNT">Fixed amount deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.latePenaltyMode === 'AMOUNT' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="policy-lateamount">Deduction per penalty</Label>
                  <Input
                    id="policy-lateamount"
                    type="number"
                    min={0}
                    value={form.latePenaltyAmount}
                    onChange={(e) => rules.setField('latePenaltyAmount', e.target.value)}
                    disabled={rules.saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Org currency ({currency} for this workspace).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Only changed fields are submitted — untouched rules keep their current values.
          {rules.dirty && <span className="ml-1 font-medium text-foreground">Unsaved changes</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={rules.reset} disabled={rules.saving || !rules.dirty}>
            Reset
          </Button>
          <Button onClick={rules.save} disabled={rules.saving || !rules.dirty}>
            <Save className="size-4" aria-hidden />
            {rules.saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </>
  )
}

function RulesInfoCard({ form }: { form: PolicyForm | null }) {
  const { org } = useWorkspace()
  const checkIn = HHMM_RE.test(form?.checkInTime ?? '') ? form!.checkInTime : '09:00'
  const checkOut = HHMM_RE.test(form?.checkOutTime ?? '') ? form!.checkOutTime : '17:30'
  const grace = form ? Number(form.lateGraceMins) || 0 : 15
  const half = form ? Number(form.halfDayMins) || 240 : 240
  const full = form ? Number(form.fullDayMins) || 480 : 480
  const payDay = form ? Number(form.payrollDay) || 28 : 28
  const days = form?.workDays ?? [1, 2, 3, 4, 5]
  const lateAt = addMinutes(checkIn, grace)
  const threshold = form ? Number(form.latePenaltyThreshold) || 3 : 3
  const penaltyDeduction =
    form?.latePenaltyMode === 'AMOUNT'
      ? `${currencySymbol(org?.currency ?? 'BDT')}${Number(form.latePenaltyAmount) || 0}`
      : "half a day's salary"
  const latePenaltyBody = form
    ? form.latePenaltyEnabled
      ? `Every ${threshold} late arrivals in a month deduct ${penaltyDeduction} from that month's payroll.`
      : 'Late arrivals are tracked but carry no payroll penalty.'
    : 'Payroll late penalties follow the rules your administrators configure.'

  const rows = [
    {
      title: 'Office hours',
      body: `The office day runs ${checkIn} to ${checkOut} — attendance, late tracking and payroll use this window.`,
    },
    {
      title: 'Late arrivals',
      body: `A check-in after ${lateAt} (${checkIn} plus ${grace} min grace) is marked LATE for the day.`,
    },
    {
      title: 'Late penalties',
      body: latePenaltyBody,
    },
    {
      title: 'Half days',
      body: `Checking out with less than ${minutesToHours(half)} of total worked time marks the day HALF_DAY.`,
    },
    {
      title: 'Full days',
      body: `${minutesToHours(full)} is the expected daily total used for attendance and reporting.`,
    },
    {
      title: 'Work days',
      body: `${workDaysLabel(days)} — check-ins on other days are PRESENT (off-day work) and approved leave only fills work days.`,
    },
    {
      title: 'Payroll day',
      body: `Payroll runs are paid out on day ${payDay} of each month.`,
    },
  ]

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-4 text-muted-foreground" aria-hidden />
          How these rules apply
        </CardTitle>
        <CardDescription>
          {form ? 'Live values from the rules above.' : 'Rules are set by your organization administrators.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3" role="list">
          {rows.map((r) => (
            <li key={r.title} className="flex items-start gap-3">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-600/70" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------- Leave tab ----------

function LeaveTab({ onGoToRules }: { onGoToRules: () => void }) {
  const { role, navigate } = useWorkspace()
  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'HR'
  const { data, loading, error, refresh } = useData<{ items: LeaveTypeItem[] }>('/api/hr/leave-types')
  const holidaysQ = useData<{ items: HolidayItem[]; workDays: number[] }>('/api/hr/holidays')

  const items = data?.items ?? []
  const totalDays = items.reduce((s, lt) => s + lt.daysPerYear, 0)
  const unpaidCount = items.filter((lt) => !lt.paid).length

  // ---------- holiday calendar (T5) ----------
  const holidays = holidaysQ.data?.items ?? []
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const in30 = new Date(todayStart.getTime() + 30 * 86_400_000)
  const thisYear = now.getFullYear()
  const holidaysThisYear = holidays.filter((h) => Number(h.startDate.slice(0, 4)) === thisYear).length
  const upcomingHolidays = holidays.filter((h) => {
    const start = new Date(h.startDate.slice(0, 10) + 'T12:00:00')
    const end = new Date(h.endDate.slice(0, 10) + 'T12:00:00')
    return end >= todayStart && start <= in30
  }).length
  const govtHolidays = holidays.filter((h) => h.type === 'GOVT').length

  const [templateBusy, setTemplateBusy] = useState(false)
  async function applyBdTemplate() {
    setTemplateBusy(true)
    try {
      const res = await api<{ created: number }>('/api/hr/holidays', {
        method: 'POST',
        body: { template: 'BD_2026' },
      })
      if (res.created > 0) {
        toast({
          title: `Added ${res.created} public holidays`,
          description: 'Bangladesh 2026 government holidays are on the calendar.',
        })
      } else {
        toast({
          title: 'All template holidays already exist',
          description: 'Every Bangladesh 2026 template holiday is already on your calendar.',
        })
      }
      holidaysQ.refresh()
    } catch {
      /* api() toasts the 403 role guard / 422s */
    } finally {
      setTemplateBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Leave types"
          value={items.length}
          sub="types defined"
          icon={CalendarCheck}
          loading={loading}
        />
        <StatCard
          label="Total entitled days"
          value={totalDays}
          sub="days per member / year"
          icon={CalendarDays}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Unpaid types"
          value={unpaidCount}
          sub="deducted in payroll"
          icon={Wallet}
          tone="warning"
          loading={loading}
        />
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-muted-foreground" aria-hidden />
            Leave types &amp; entitlements
          </CardTitle>
          <CardDescription>
            Days per year each member is entitled to, by leave type. Types with requests cannot be deleted.
          </CardDescription>
          {canManage && (
            <CardAction>
              <LeaveTypeDialog onSaved={refresh} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!canManage &&
            lockNotice(
              'Leave types are managed by owners, admins and HR — the table below is read-only for your role.'
            )}
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)
          ) : error ? (
            <EmptyState
              icon={CalendarCheck}
              title="Leave types unavailable"
              description={error}
              action={
                <Button variant="outline" onClick={refresh}>
                  Reload
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No leave types"
              description="Add the first leave type so members can request time off."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave type</TableHead>
                    <TableHead>Entitlement</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((lt) => (
                    <TableRow key={lt.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: lt.color ?? '#10b981' }}
                            aria-hidden
                          />
                          <span className="font-medium">{lt.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {lt.daysPerYear} {lt.daysPerYear === 1 ? 'day' : 'days'} / year
                      </TableCell>
                      <TableCell>
                        {lt.paid ? (
                          <StatusBadge label="Paid" tone="success" dot={false} />
                        ) : (
                          <StatusBadge label="Unpaid" tone="muted" dot={false} />
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {lt.requestCount} {lt.requestCount === 1 ? 'request' : 'requests'}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <LeaveTypeDialog editing={lt} onSaved={refresh} />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9 text-muted-foreground hover:text-destructive"
                                  aria-label={`Delete ${lt.name}`}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {lt.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This permanently removes the leave type and its yearly entitlement for every
                                    member. Types that already have requests cannot be deleted.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                    onClick={async () => {
                                      try {
                                        await api(`/api/hr/leave-types/${lt.id}`, { method: 'DELETE' })
                                        toast({
                                          title: 'Leave type deleted',
                                          description: `${lt.name} was removed.`,
                                        })
                                        refresh()
                                      } catch {
                                        // api() toasts the 400 'Leave type has requests'
                                      }
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground sm:max-w-md">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                How leave flows — members request time off, their manager is notified, and approval updates
                balances while marking attendance for work days.
              </p>
            </div>
            <Button variant="outline" className="self-start" onClick={() => navigate('hr-leave')}>
              Open leave module
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Holiday calendar (T5) ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Holidays this year"
          value={holidaysThisYear}
          sub={`scheduled in ${thisYear}`}
          icon={CalendarDays}
          loading={holidaysQ.loading}
        />
        <StatCard
          label="Upcoming holidays"
          value={upcomingHolidays}
          sub="next 30 days"
          icon={CalendarCheck}
          tone="info"
          loading={holidaysQ.loading}
        />
        <StatCard
          label="Government holidays"
          value={govtHolidays}
          sub="public observances"
          icon={Flag}
          tone="warning"
          loading={holidaysQ.loading}
        />
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            Holiday calendar
          </CardTitle>
          <CardDescription>
            Government and company holidays — weekly holidays come from your work days in Rules.
          </CardDescription>
          {canManage && (
            <CardAction className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={applyBdTemplate} disabled={templateBusy}>
                <Flag className="size-4" aria-hidden />
                {templateBusy ? 'Adding…' : 'Add Bangladesh 2026 holidays'}
              </Button>
              <HolidayDialog onSaved={holidaysQ.refresh} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!canManage &&
            lockNotice(
              'The holiday calendar is managed by owners, admins and HR — the list below is read-only for your role.'
            )}
          {holidaysQ.loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)
          ) : holidaysQ.error ? (
            <EmptyState
              icon={CalendarDays}
              title="Holidays unavailable"
              description={holidaysQ.error}
              action={
                <Button variant="outline" onClick={holidaysQ.refresh}>
                  Reload
                </Button>
              }
            />
          ) : holidays.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No holidays yet"
              description="Add government and company holidays so they appear in calendars, leave and My Day."
              action={
                canManage ? (
                  <Button variant="outline" onClick={applyBdTemplate} disabled={templateBusy}>
                    <Flag className="size-4" aria-hidden />
                    Add Bangladesh 2026 holidays
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-48">Holiday</TableHead>
                    <TableHead className="min-w-44">Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead className="min-w-40">Description</TableHead>
                    {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="font-medium">{h.name}</span>
                          <HolidayTypeBadge type={h.type} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {holidayDate(h.startDate)}
                            {h.days > 1 ? ` – ${holidayDate(h.endDate)}` : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">{holidayWeekday(h)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {h.days} {h.days === 1 ? 'day' : 'days'}
                      </TableCell>
                      <TableCell className="max-w-56">
                        <span className="block truncate text-xs text-muted-foreground" title={h.description ?? undefined}>
                          {h.description ?? '—'}
                        </span>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <HolidayDialog editing={h} onSaved={holidaysQ.refresh} />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9 text-muted-foreground hover:text-destructive"
                                  aria-label={`Delete ${h.name}`}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove {h.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Members will no longer see this holiday in calendars and leave.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                    onClick={async () => {
                                      try {
                                        await api(`/api/hr/holidays/${h.id}`, { method: 'DELETE' })
                                        toast({
                                          title: 'Holiday removed',
                                          description: `${h.name} was deleted from the calendar.`,
                                        })
                                        holidaysQ.refresh()
                                      } catch {
                                        /* api() toasts the 403 role guard */
                                      }
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="sm:max-w-xl">
              Weekly holidays (your off days from Rules) and the holidays above never consume leave days —
              requests are charged work days only.
            </p>
            <Button variant="outline" size="sm" className="shrink-0 self-start" onClick={onGoToRules}>
              <Clock className="size-3.5" aria-hidden />
              Adjust work days in Rules
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- leave type dialog (add / edit) ----------

function LeaveTypeDialog({
  editing,
  onSaved,
}: {
  editing?: LeaveTypeItem
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [days, setDays] = useState('10')
  const [color, setColor] = useState<string>(DEPARTMENT_COLORS[0])
  const [paid, setPaid] = useState(true)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(editing?.name ?? '')
    setDays(String(editing?.daysPerYear ?? 10))
    setColor(editing?.color ?? DEPARTMENT_COLORS[0])
    setPaid(editing?.paid ?? true)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast({ title: 'Name required', description: 'Give the leave type a name.', variant: 'destructive' })
      return
    }
    const n = Number(days)
    if (!/^\d+$/.test(days.trim()) || n < 1 || n > 365) {
      toast({
        title: 'Invalid entitlement',
        description: 'Days per year must be between 1 and 365.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const payload: Record<string, unknown> = {}
        if (trimmed !== editing.name) payload.name = trimmed
        if (n !== editing.daysPerYear) payload.daysPerYear = n
        if (color !== (editing.color ?? DEPARTMENT_COLORS[0])) payload.color = color
        if (paid !== editing.paid) payload.paid = paid
        if (Object.keys(payload).length === 0) {
          toast({ title: 'Nothing to save', description: 'No leave type fields were changed.' })
          return
        }
        await api(`/api/hr/leave-types/${editing.id}`, { method: 'PATCH', body: payload })
        toast({ title: 'Leave type updated', description: `${trimmed} has been saved.` })
      } else {
        await api('/api/hr/leave-types', {
          method: 'POST',
          body: { name: trimmed, daysPerYear: n, color, paid },
        })
        toast({ title: 'Leave type created', description: `${trimmed} is now available for requests.` })
      }
      setOpen(false)
      onSaved()
    } catch {
      /* api() already toasts (403 / 422 validation) */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset() }}>
      <DialogTrigger asChild>
        {editing ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${editing.name}`}
          >
            <PencilLine className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            Add leave type
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add leave type'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the entitlement, color or paid status. Only changed fields are submitted.'
              : 'Members can request this type immediately once created.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="leave-name">Name *</Label>
            <Input
              id="leave-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Study leave"
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="leave-days">Days per year *</Label>
            <Input
              id="leave-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Entitlement per member, 1–365 days.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Leave type color">
              {DEPARTMENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                    color === c ? 'border-foreground' : 'border-transparent'
                  )}
                >
                  <span className="size-5 rounded-full" style={{ backgroundColor: c }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3.5">
            <div className="min-w-0">
              <Label htmlFor="leave-paid" className="text-sm">
                Paid leave
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Unpaid types deduct from payroll through approved unpaid days.
              </p>
            </div>
            <Switch id="leave-paid" checked={paid} onCheckedChange={setPaid} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create leave type'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- holiday dialog (add / edit — T5) ----------

function HolidayDialog({
  editing,
  onSaved,
}: {
  editing?: HolidayItem
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('GOVT')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(editing?.name ?? '')
    setType(editing && HOLIDAY_TYPE_LABELS[editing.type] ? editing.type : 'GOVT')
    setStartDate(editing?.startDate.slice(0, 10) ?? '')
    setEndDate(editing?.endDate.slice(0, 10) ?? '')
    setDescription(editing?.description ?? '')
  }

  /** keep the end date on or after the start date (single-day holidays allowed) */
  function changeStart(v: string) {
    setStartDate(v)
    if (v && (!endDate || endDate < v)) setEndDate(v)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast({ title: 'Name required', description: 'Give the holiday a name.', variant: 'destructive' })
      return
    }
    if (trimmed.length > 120) {
      toast({ title: 'Name too long', description: 'Holiday names are limited to 120 characters.', variant: 'destructive' })
      return
    }
    if (!startDate || !endDate) {
      toast({ title: 'Dates required', description: 'Pick both a start and an end date.', variant: 'destructive' })
      return
    }
    const s = new Date(startDate + 'T12:00:00')
    const e = new Date(endDate + 'T12:00:00')
    if (e < s) {
      toast({ title: 'Invalid date range', description: 'The end date cannot be before the start date.', variant: 'destructive' })
      return
    }
    const span = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
    if (span > 30) {
      toast({ title: 'Range too long', description: 'A holiday cannot span more than 30 days.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: trimmed,
        type,
        startDate,
        endDate,
        description: description.trim() || null,
      }
      if (editing) {
        await api(`/api/hr/holidays/${editing.id}`, { method: 'PUT', body: payload })
        toast({ title: 'Holiday updated', description: `${trimmed} has been saved.` })
      } else {
        await api('/api/hr/holidays', { method: 'POST', body: payload })
        toast({ title: 'Holiday added', description: `${trimmed} is now on the calendar.` })
      }
      setOpen(false)
      onSaved()
    } catch {
      /* api() toasts (403 role guard / 422 validation) */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset() }}>
      <DialogTrigger asChild>
        {editing ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${editing.name}`}
          >
            <PencilLine className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            Add holiday
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add holiday'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the name, type, dates or description — all fields are re-submitted.'
              : 'A single day or a date range — it will appear in calendars, leave and My Day.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="holiday-name">Name *</Label>
            <Input
              id="holiday-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Victory Day"
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full" aria-label="Holiday type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GOVT">Government</SelectItem>
                <SelectItem value="COMPANY">Company</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-start">Start date *</Label>
              <Input
                id="holiday-start"
                type="date"
                value={startDate}
                onChange={(e) => changeStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-end">End date *</Label>
              <Input
                id="holiday-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Same as the start date for a single-day holiday.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="holiday-desc">Description (optional)</Label>
            <Textarea
              id="holiday-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="e.g. Office closed for the observance…"
              className="resize-y"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !startDate || !endDate}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add holiday'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Access tab ----------

function AccessTab({ canEdit, access }: { canEdit: boolean; access: AccessState }) {
  const { me, role, org } = useWorkspace()

  if (!canEdit) {
    // The matrix API is OWNER/ADMIN-only — everyone else sees their own effective access.
    const myAccess = (me?.access ?? {}) as Record<string, string>
    return (
      <div className="flex flex-col gap-6">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
              Module access matrix
            </CardTitle>
            <CardDescription>
              Three access levels per module and role. Owners always have full access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lockNotice(
              'The full matrix is managed by owners and admins — ask an administrator to change what a role can see. Your own access is listed below.'
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>
              What your {(ROLE_LABELS[role] ?? role) || 'member'} role can see in{' '}
              {org?.name ?? 'this organization'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ACCESS_MODULES.map((m) => {
                const level = (myAccess[m.id] ?? 'VIEW') as LevelKey
                const meta = LEVEL_META[level] ?? LEVEL_META.HIDDEN
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <span className="truncate text-sm">{m.label}</span>
                    <StatusBadge label={meta.label} tone={LEVEL_TONE[level] ?? 'outline'} dot={false} />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <AccessLegendCard />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
            Module access matrix
          </CardTitle>
          <CardDescription>
            Three access levels per module and role. Owners always have full access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {access.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 w-[180px] bg-card">Module</TableHead>
                    {MATRIX_ROLES.map((r) => (
                      <TableHead key={r} className="text-center">
                        <span className="flex justify-center">
                          <StatusBadge
                            label={ROLE_LABELS[r] ?? r}
                            tone={ROLE_TONE[r] ?? 'outline'}
                            dot={false}
                          />
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ACCESS_MODULES.map((m) => (
                    <TableRow key={m.id} className="group">
                      <TableCell className="sticky left-0 z-10 bg-card font-medium group-hover:bg-muted/50">
                        {m.label}
                      </TableCell>
                      {MATRIX_ROLES.map((r) =>
                        r === 'OWNER' ? (
                          <TableCell key={r} className="text-center">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-muted/60 px-2 py-1 text-xs font-medium text-muted-foreground">
                              <Lock className="size-3" aria-hidden /> Full
                            </span>
                          </TableCell>
                        ) : (
                          <TableCell key={r} className="text-center">
                            <AccessLevelCell
                              level={access.levelOf(m.id, r)}
                              dirty={access.isDirtyCell(m.id, r)}
                              onSelect={(l) => access.setLevel(m.id, r, l)}
                              disabled={access.saving}
                            />
                          </TableCell>
                        )
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Changes apply immediately after saving — members see them on their next login or refresh.
          </p>
        </CardContent>
      </Card>

      {access.changes.length > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            {access.changes.length} change{access.changes.length === 1 ? '' : 's'} — unsaved access rules
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={access.discard} disabled={access.saving}>
              Discard
            </Button>
            <Button onClick={access.save} disabled={access.saving}>
              <Save className="size-4" aria-hidden />
              {access.saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      <AccessLegendCard />
    </div>
  )
}

function AccessLevelCell({
  level,
  dirty,
  onSelect,
  disabled,
}: {
  level: string
  dirty: boolean
  onSelect: (level: string) => void
  disabled?: boolean
}) {
  const key = (LEVEL_KEYS as readonly string[]).includes(level) ? (level as LevelKey) : 'HIDDEN'
  const meta = LEVEL_META[key]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Access level: ${meta.label}`}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
            LEVEL_CELL_CLASSES[key],
            dirty && 'border-emerald-600/40 ring-2 ring-emerald-500/60'
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {meta.cellLabel}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {LEVEL_KEYS.map((l) => {
          const m = LEVEL_META[l]
          const LIcon = m.icon
          return (
            <DropdownMenuItem key={l} onClick={() => onSelect(l)} className="gap-2.5 py-2.5">
              <LIcon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.description}</span>
              </span>
              {key === l && <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccessLegendCard() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-4 text-muted-foreground" aria-hidden />
          What the levels mean
        </CardTitle>
        <CardDescription>Every module and role combination uses one of three levels.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LEVEL_KEYS.map((l) => {
            const m = LEVEL_META[l]
            const Icon = m.icon
            return (
              <div key={l} className="flex flex-col gap-1.5 rounded-lg border p-3.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className={cn('size-4', LEVEL_TEXT_CLASSES[l])} aria-hidden />
                  {m.label}
                </span>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
            )
          })}
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Owners always have full access to every module. Self-service modules (My Workspace, My Tasks, Profile,
            Settings) are always available to every member.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- profile form vocab (General tab) ----------

interface ProfileForm {
  name: string
  description: string
  industry: string
  orgType: string
  website: string
  country: string
  currency: string
  timezone: string
}

const FORM_KEYS: Array<keyof ProfileForm> = [
  'name',
  'description',
  'industry',
  'orgType',
  'website',
  'country',
  'currency',
  'timezone',
]
