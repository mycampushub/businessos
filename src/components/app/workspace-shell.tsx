'use client'

import { useEffect, useRef } from 'react'
import { useWorkspace, type MeShape } from '@/lib/client/store'
import { AppSidebar, AppMobileNav } from './sidebar'
import { AppTopbar } from './topbar'
import { ErrorBoundary } from './error-boundary'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { LifeBuoy, LogOut } from 'lucide-react'

// Views — each module is a self-contained client component (default export, no props).
import DashboardView from '@/components/views/dashboard-view'
import MyTasksView from '@/components/views/my-tasks-view'
import TasksView from '@/components/views/tasks-view'
import ProjectsView from '@/components/views/projects-view'
import CrmLeadsView from '@/components/views/crm-leads-view'
import CrmDealsView from '@/components/views/crm-deals-view'
import CrmContactsView from '@/components/views/crm-contacts-view'
import HrEmployeesView from '@/components/views/hr-employees-view'
import HrAttendanceView from '@/components/views/hr-attendance-view'
import HrLeaveView from '@/components/views/hr-leave-view'
import OrgStructureView from '@/components/views/org-structure-view'
import RecruitJobsView from '@/components/views/recruit-jobs-view'
import RecruitCandidatesView from '@/components/views/recruit-candidates-view'
import FinanceInvoicesView from '@/components/views/finance-invoices-view'
import FinanceExpensesView from '@/components/views/finance-expenses-view'
import DocumentsView from '@/components/views/documents-view'
import AnnouncementsView from '@/components/views/announcements-view'
import ReportsView from '@/components/views/reports-view'
import SettingsView from '@/components/views/settings-view'
import ProfileView from '@/components/views/profile-view'
import MyDayView from '@/components/views/my-day-view'
import PayrollView from '@/components/views/payroll-view'
import PlatformAdminView from '@/components/views/platform-admin-view'
import MeetingsView from '@/components/views/meetings-view'
import BillingView from '@/components/views/billing-view'

const VIEWS: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  'my-day': MyDayView,
  'my-tasks': MyTasksView,
  tasks: TasksView,
  projects: ProjectsView,
  'crm-leads': CrmLeadsView,
  'crm-deals': CrmDealsView,
  'crm-contacts': CrmContactsView,
  'hr-employees': HrEmployeesView,
  'hr-attendance': HrAttendanceView,
  'hr-leave': HrLeaveView,
  'org-structure': OrgStructureView,
  'recruit-jobs': RecruitJobsView,
  'recruit-candidates': RecruitCandidatesView,
  'finance-invoices': FinanceInvoicesView,
  'finance-expenses': FinanceExpensesView,
  'finance-payroll': PayrollView,
  documents: DocumentsView,
  announcements: AnnouncementsView,
  billing: BillingView,
  reports: ReportsView,
  settings: SettingsView,
  profile: ProfileView,
  'platform-admin': PlatformAdminView,
  meetings: MeetingsView,
}

/** T5 frozen contract: me.session.impersonatedBy = {id, name} marks a platform-admin support session. */
interface MeWithSession extends MeShape {
  session?: { impersonatedBy: { id: string; name: string } | null } | null
}

/** Sticky amber context bar shown ONLY during platform-admin support sessions. */
function SupportSessionBanner({ impersonatedBy }: { impersonatedBy: { id: string; name: string } }) {
  const { me, logout } = useWorkspace()
  if (!me) return null

  async function endSupportSession() {
    await logout()
    toast({
      title: 'Signed out of the support session',
      description: 'Sign in again with your platform account.',
    })
  }

  return (
    <div
      role="alert"
      className="w-full border-b border-amber-600/30 bg-amber-100/95 text-amber-900 backdrop-blur dark:bg-amber-500/15 dark:text-amber-200 lg:sticky lg:top-0 lg:z-40"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-start gap-2.5">
          <LifeBuoy className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              Support session — you are signed in as {me.user.name}
            </p>
            <p className="truncate text-xs text-amber-800/80 dark:text-amber-300/90">
              opened by {impersonatedBy.name} · all actions are audit-logged
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-amber-600/40 bg-transparent text-amber-900 hover:bg-amber-600/10 hover:text-amber-900 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
          onClick={() => void endSupportSession()}
        >
          <LogOut className="size-3.5" aria-hidden /> Sign out
        </Button>
      </div>
    </div>
  )
}

export function WorkspaceShell() {
  const { nav, navigate, me, canView } = useWorkspace()
  const impersonatedBy = (me as MeWithSession | null)?.session?.impersonatedBy ?? null

  // Landing guard: the default module is 'dashboard' — members who cannot view the
  // dashboard (e.g. EMPLOYEE with HIDDEN) land on their personal workspace instead.
  // Org-less SaaS platform administrators land on their platform console.
  const redirected = useRef(false)
  useEffect(() => {
    if (redirected.current) return
    if (me && nav.module === 'dashboard') {
      if (me.user.platformAdmin && !me.activeOrgId) {
        redirected.current = true
        navigate('platform-admin')
      } else if (!canView('dashboard')) {
        redirected.current = true
        navigate('my-day')
      }
    }
  }, [me, nav.module, canView, navigate])

  // Support sessions land the impersonated member in their own workspace — the
  // platform console is gated for non-admins. Runs once per impersonated user,
  // using the FRESH identity (the console's own navigate call may still hold the
  // admin's stale closure).
  const supportLandedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!impersonatedBy || !me?.activeOrgId) return
    if (supportLandedFor.current === me.user.id) return
    supportLandedFor.current = me.user.id
    navigate(canView('dashboard') ? 'dashboard' : 'my-day')
  }, [impersonatedBy, me, canView, navigate])

  // Org-less platform admins belong in the console even when a stale module lingers
  // from the previous identity (e.g. right after a support-session sign-out and
  // re-login). Every module except the console and My Profile is org-scoped —
  // including the self modules (My Workspace, My Tasks, Settings) — so those
  // redirect too: they would only render API 403s for an org-less account.
  useEffect(() => {
    if (
      me?.user.platformAdmin && !me?.activeOrgId
      && nav.module !== 'platform-admin' && nav.module !== 'profile'
    ) {
      navigate('platform-admin')
    }
  }, [me, nav.module, navigate])

  const View = VIEWS[nav.module] ?? DashboardView

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <AppMobileNav />
        <AppTopbar />
        {impersonatedBy && <SupportSessionBanner impersonatedBy={impersonatedBy} />}
        <main id="content" className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <ErrorBoundary key={nav.module + (nav.params?.projectId ?? '')}>
              <View />
            </ErrorBoundary>
          </div>
        </main>
        <footer className="mt-auto border-t bg-card px-6 py-3 text-center text-[11px] text-muted-foreground">
          OrgOS — The Organization Operating System · Multi-tenant enterprise SaaS
        </footer>
      </div>
    </div>
  )
}
