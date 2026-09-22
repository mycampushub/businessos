'use client'

import { useMemo, useState } from 'react'
import { useWorkspace, type ModuleId } from '@/lib/client/store'
import { api } from '@/lib/client/api'
import { cn } from '@/lib/utils'
import { UserAvatar } from './user-avatar'
import { CreateOrgDialog } from './onboarding'
import { OrgOsLogo } from './logo'
import { toast } from '@/hooks/use-toast'
import { ROLE_LABELS } from '@/lib/format'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard, KanbanSquare, FolderKanban, CheckSquare, Target, Users, UserRound,
  CalendarCheck2, CalendarDays, Network, Briefcase, UserRoundSearch, Receipt, Wallet,
  FileText, Megaphone, Settings, UserRoundCog, PanelLeft, Building2, Plus, ChevronsUpDown,
  BarChart3, LogOut, Sun, Banknote, ShieldCheck, Video, CreditCard } from 'lucide-react'

interface NavItem {
  id: ModuleId
  label: string
  icon: typeof LayoutDashboard
}

interface NavGroup {
  title: string
  items: NavItem[]
}

/** SaaS platform console — visible to platform administrators only, never access-filtered. */
const PLATFORM_NAV: NavGroup = {
  title: 'Platform',
  items: [{ id: 'platform-admin', label: 'Platform admin', icon: ShieldCheck }],
}

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { id: 'my-day', label: 'My Workspace', icon: Sun },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Work',
    items: [
      { id: 'my-tasks', label: 'My Tasks', icon: CheckSquare },
      { id: 'projects', label: 'Projects', icon: FolderKanban },
      { id: 'tasks', label: 'All Tasks', icon: KanbanSquare },
    ],
  },
  {
    title: 'CRM',
    items: [
      { id: 'crm-leads', label: 'Leads', icon: Target },
      { id: 'crm-deals', label: 'Deals & Pipeline', icon: Briefcase },
      { id: 'crm-contacts', label: 'Contacts & Clients', icon: Users },
      { id: 'meetings', label: 'Meetings', icon: Video },
    ],
  },
  {
    title: 'People',
    items: [
      { id: 'hr-employees', label: 'Employees', icon: UserRound },
      { id: 'hr-attendance', label: 'Attendance', icon: CalendarCheck2 },
      { id: 'hr-leave', label: 'Leave', icon: CalendarDays },
      { id: 'org-structure', label: 'Org Structure', icon: Network },
    ],
  },
  {
    title: 'Recruitment',
    items: [
      { id: 'recruit-jobs', label: 'Jobs', icon: FileText },
      { id: 'recruit-candidates', label: 'Candidates', icon: UserRoundSearch },
    ],
  },
  {
    title: 'Finance',
    items: [
      { id: 'finance-invoices', label: 'Invoices', icon: Receipt },
      { id: 'finance-expenses', label: 'Expenses', icon: Wallet },
      { id: 'finance-payroll', label: 'Payroll', icon: Banknote },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { id: 'documents', label: 'Documents', icon: FileText },
      { id: 'announcements', label: 'Announcements', icon: Megaphone },
      { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
    ],
  },
]

function OrgSwitcher() {
  const { me, refreshMe, logout } = useWorkspace()
  const [createOpen, setCreateOpen] = useState(false)
  if (!me) return null

  const active = me.memberships.find((m) => m.orgId === me.activeOrgId) ?? me.memberships[0]

  async function switchOrg(orgId: string) {
    try {
      await api('/api/orgs/active', { method: 'POST', body: { orgId }, silent: true })
      await refreshMe()
      toast({ title: 'Workspace switched', description: me?.memberships.find((m) => m.orgId === orgId)?.org.name })
    } catch {
    }
  }

  return (
    <div className="px-3 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 p-2 text-left transition-colors hover:bg-white/10"
            aria-label="Switch organization"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">
              {active?.org.name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{active?.org.name ?? 'No organization'}</p>
              <p className="truncate text-[11px] text-zinc-400">
                {active ? `${ROLE_LABELS[active.role] ?? active.role}${active.title ? ` · ${active.title}` : ''}` : 'Create one to start'}
              </p>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-zinc-400" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs">Your organizations</DropdownMenuLabel>
          {me.memberships.map((m) => (
            <DropdownMenuItem key={m.id} onClick={() => switchOrg(m.orgId)} className="gap-2.5">
              <div className="flex size-6 items-center justify-center rounded bg-emerald-600/15 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                {m.org.name.charAt(0)}
              </div>
              <span className="flex-1 truncate">{m.org.name}</span>
              {m.orgId === me.activeOrgId && <span className="size-1.5 rounded-full bg-emerald-500" aria-label="active" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New organization
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => logout()}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function NavButton({
  item, active, onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-emerald-600/15 font-medium text-emerald-300'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={cn('size-4.5 shrink-0', active ? 'text-emerald-400' : 'text-zinc-500')} aria-hidden />
      <span className="truncate">{item.label}</span>
    </button>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { nav, navigate, me, canView } = useWorkspace()
  const role = me?.memberships.find((m) => m.orgId === me?.activeOrgId)?.role
  const isPlatformAdmin = me?.user.platformAdmin === true
  // Without an active org there is no org-scoped data: org modules (and the plan
  // line) stay hidden — a platform admin keeps the console + self modules.
  const orgless = !me?.activeOrgId

  const groups = useMemo(() => {
    if (orgless) return []
    // Render nav items only when the role can view the module; drop empty groups.
    // Billing & Plan is OWNER/ADMIN-only (it is not part of the access matrix).
    return NAV.map((g) => ({
      ...g,
      items: g.items.filter(
        (item) =>
          canView(item.id) &&
          (item.id !== 'billing' || role === 'OWNER' || role === 'ADMIN')
      ),
    })).filter((g) => g.items.length > 0)
  }, [canView, orgless, role])

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
      {isPlatformAdmin && (
        <div>
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{PLATFORM_NAV.title}</p>
          <div className="flex flex-col gap-0.5">
            {PLATFORM_NAV.items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={nav.module === item.id}
                onClick={() => {
                  navigate(item.id)
                  onNavigate?.()
                }}
              />
            ))}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{g.title}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={nav.module === item.id}
                onClick={() => {
                  navigate(item.id)
                  onNavigate?.()
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-3">
        <button
          onClick={() => {
            navigate('settings')
            onNavigate?.()
          }}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
            nav.module === 'settings' ? 'bg-emerald-600/15 font-medium text-emerald-300' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
          )}
        >
          <Settings className="size-4.5 text-zinc-500" aria-hidden /> Settings
        </button>
        <button
          onClick={() => {
            navigate('profile')
            onNavigate?.()
          }}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
            nav.module === 'profile' ? 'bg-emerald-600/15 font-medium text-emerald-300' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
          )}
        >
          <UserRoundCog className="size-4.5 text-zinc-500" aria-hidden /> My Profile
        </button>
        {role === 'OWNER' && !orgless && (
          <p className="px-2.5 pt-2 text-[10px] text-zinc-600">Plan: {me?.memberships.find((m) => m.orgId === me?.activeOrgId)?.org.plan ?? 'Free'}</p>
        )}
      </div>
    </nav>
  )
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-4">
        <OrgOsLogo dark />
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">Enterprise</span>
      </div>
      <OrgSwitcher />
      <SidebarNav onNavigate={onNavigate} />
    </div>
  )
}

/** Desktop fixed sidebar. Mobile navigation lives in the topbar (AppMobileNav). */
export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/10 lg:block" aria-label="Sidebar">
      <SidebarInner />
    </aside>
  )
}

/** Mobile navigation: header bar + slide-in sheet with the full sidebar. */
export function AppMobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 py-2.5 lg:hidden">
      <OrgOsLogo />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open navigation menu">
            <PanelLeft className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-white/10 bg-sidebar p-0 [&>button]:text-zinc-400">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarInner onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
