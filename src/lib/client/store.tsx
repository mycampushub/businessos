'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

// ---------- module registry ----------

export type ModuleId =
  | 'dashboard' | 'reports' | 'profile'
  | 'my-tasks' | 'tasks' | 'projects'
  | 'crm-leads' | 'crm-deals' | 'crm-contacts'
  | 'hr-employees' | 'hr-attendance' | 'hr-leave' | 'org-structure'
  | 'recruit-jobs' | 'recruit-candidates'
  | 'finance-invoices' | 'finance-expenses' | 'finance-payroll'
  | 'documents' | 'announcements' | 'settings' | 'my-day'
  | 'meetings' | 'platform-admin' | 'billing'

/** Modules that are always available to every member (never access-guarded). */
export const SELF_MODULES: ModuleId[] = ['my-day', 'my-tasks', 'profile', 'settings']

export type AccessLevel = 'FULL' | 'VIEW' | 'HIDDEN'

export interface NavState {
  module: ModuleId
  params?: Record<string, string | undefined>
}

export interface MeShape {
  user: {
    id: string; email: string; name: string; avatarUrl: string | null; headline: string | null
    phone: string | null; location: string | null; bio: string | null; skills: string | null
    platformAdmin: boolean; status: string
  }
  memberships: Array<{
    id: string; role: string; title: string | null; orgId: string; status: string
    org: { id: string; name: string; slug: string; logoUrl: string | null; currency: string; plan: string }
  }>
  activeOrgId: string | null
  /** Module access map for the ACTIVE org's role ({} when no active org) — see T3-a. */
  access?: Partial<Record<ModuleId, AccessLevel>>
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  module: string | null
  readAt: string | null
  createdAt: string
}

interface WorkspaceCtx {
  me: MeShape | null
  loadingMe: boolean
  refreshMe: () => Promise<MeShape | null>
  logout: () => Promise<void>
  // active org
  org: MeShape['memberships'][number]['org'] | null
  membership: MeShape['memberships'][number] | null
  role: string
  // module access (derived from me.access of the active org)
  access: Record<string, string>
  can: (module: string) => boolean
  canView: (module: string) => boolean
  // navigation
  nav: NavState
  navigate: (module: ModuleId, params?: Record<string, string | undefined>) => void
  // notifications
  notifications: NotificationItem[]
  unreadCount: number
  refreshNotifications: () => void
}

const Ctx = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeShape | null>(null)
  const [loadingMe, setLoadingMe] = useState(true)
  const [nav, setNav] = useState<NavState>({ module: 'dashboard' })
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifTick, setNotifTick] = useState(0)

  const refreshMe = useCallback(async () => {
    setLoadingMe(true)
    try {
      // /api/auth/me answers 200 + null for anonymous visitors (by design —
      // see the route), so no console noise for signed-out users.
      const data = await api<MeShape | null>('/api/auth/me', { silent: true })
      const resolved = data && data.user ? data : null
      setMe(resolved)
      return resolved
    } catch {
      setMe(null)
      return null
    } finally {
      setLoadingMe(false)
    }
  }, [])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  // load notifications whenever the active user/org changes
  useEffect(() => {
    if (!me?.user) {
      setNotifications([])
      return
    }
    let cancelled = false
    api<NotificationItem[]>('/api/notifications', { silent: true })
      .then((d) => {
        if (!cancelled) setNotifications(Array.isArray(d) ? d : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [me?.user, me?.activeOrgId, notifTick])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST', silent: true }).catch(() => {})
    setMe(null)
    setNotifications([])
  }, [])

  const refreshNotifications = useCallback(() => setNotifTick((t) => t + 1), [])

  const activeMembership = useMemo(
    () => me?.memberships.find((m) => m.orgId === me?.activeOrgId) ?? null,
    [me]
  )

  // Module access of the active org's role — derived from me so it refreshes
  // automatically after refreshMe() / login / org switch.
  const accessMap = useMemo<Record<string, string>>(
    () => (me?.access ? { ...me.access } : {}),
    [me?.access, me?.activeOrgId]
  )

  const navigate = useCallback(
    (module: ModuleId, params?: Record<string, string | undefined>) => {
      const isSelf = SELF_MODULES.includes(module)
      // SaaS platform console: only platform administrators may enter it.
      if (module === 'platform-admin' && !me?.user.platformAdmin) {
        setNav({ module: 'my-day' })
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
        return
      }
      // Without an active org the only destinations are the platform console
      // (for SaaS admins), self modules — everything else has no data to show.
      if (!me?.activeOrgId && !isSelf && module !== 'platform-admin') {
        setNav({ module: me?.user.platformAdmin ? 'platform-admin' : 'my-day' })
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
        return
      }
      // Guard: hidden modules redirect to the personal workspace (self modules are never guarded).
      if (!isSelf && accessMap[module] === 'HIDDEN') {
        setNav({ module: 'my-day' })
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
        return
      }
      setNav({ module, params })
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
    },
    [accessMap, me?.activeOrgId, me?.user.platformAdmin]
  )

  const can = useCallback((module: string) => accessMap[module] === 'FULL', [accessMap])
  const canView = useCallback(
    (module: string) => {
      const level = accessMap[module]
      // missing key → treat as VIEW so unknown modules stay visible
      return level === 'FULL' || level === 'VIEW' || level === undefined
    },
    [accessMap]
  )

  // Memoized so consumers only re-render when one of these inputs actually
  // changes — the value object itself stays referentially stable between
  // unrelated state updates (e.g. notification ticks).
  const value = useMemo<WorkspaceCtx>(
    () => ({
      me,
      loadingMe,
      refreshMe,
      logout,
      org: activeMembership?.org ?? null,
      membership: activeMembership,
      role: activeMembership?.role ?? '',
      access: accessMap,
      can,
      canView,
      nav,
      navigate,
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
      refreshNotifications,
    }),
    [
      me, loadingMe, refreshMe, logout, activeMembership, accessMap, can, canView,
      nav, navigate, notifications, refreshNotifications,
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
