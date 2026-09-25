'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { useWorkspace } from '@/lib/client/store'
import { api } from '@/lib/client/api'
import { cn } from '@/lib/utils'
import { UserAvatar } from './user-avatar'
import { relativeTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Bell, CheckCheck, LogOut, UserRoundCog, Megaphone, CheckSquare, FolderKanban, CalendarDays, Receipt, Target, Users2, Briefcase, Settings,
  FileText, Users, TrendingUp, Video, Search, Loader2, Sun, Moon,
} from 'lucide-react'

const NOTIF_ICONS: Record<string, typeof Bell> = {
  TASK: CheckSquare, PROJECT: FolderKanban, LEAVE: CalendarDays, FINANCE: Receipt,
  CRM: Target, HR: Users2, RECRUITMENT: Briefcase, SYSTEM: Settings,
}

// ---------- global search ----------

interface SearchItem {
  type: 'project' | 'task' | 'member' | 'document' | 'job' | 'deal' | 'lead' | 'contact' | 'meeting'
  id: string
  title: string
  subtitle?: string
  module: string
  params?: Record<string, string>
}

const SEARCH_TYPE_META: Record<SearchItem['type'], { label: string; icon: typeof Bell }> = {
  project: { label: 'Projects', icon: FolderKanban },
  task: { label: 'Tasks', icon: CheckSquare },
  member: { label: 'Members', icon: Users2 },
  document: { label: 'Documents', icon: FileText },
  job: { label: 'Jobs', icon: Briefcase },
  deal: { label: 'Deals', icon: Target },
  lead: { label: 'Leads', icon: TrendingUp },
  contact: { label: 'Contacts', icon: Users },
  meeting: { label: 'Meetings', icon: Video },
}

function GlobalSearch() {
  const { navigate, me } = useWorkspace()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced query — 300ms, only when ≥2 chars; aborts stale requests.
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          data?: { results?: SearchItem[] }
          error?: string
        }
        if (!res.ok || json.ok === false) throw new Error(json.error ?? 'Search failed')
        setResults(Array.isArray(json.data?.results) ? json.data.results : [])
        setOpen(true)
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setResults([])
          setOpen(true)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  // '/' focuses the search box — unless the user is already typing somewhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return
      if (!inputRef.current) return
      e.preventDefault()
      inputRef.current.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current)
    },
    []
  )

  const grouped = useMemo(() => {
    const order: SearchItem['type'][] = []
    const map = new Map<SearchItem['type'], SearchItem[]>()
    for (const r of results) {
      if (!map.has(r.type)) {
        map.set(r.type, [])
        order.push(r.type)
      }
      map.get(r.type)!.push(r)
    }
    return order.map((type) => ({ type, items: map.get(type)! }))
  }, [results])

  function clear() {
    setQ('')
    setResults([])
    setOpen(false)
    setLoading(false)
  }

  function choose(item: SearchItem) {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    navigate(item.module as never, item.params)
    clear()
  }

  // Org-less users (SaaS platform admin) have no org data to search.
  if (!me?.activeOrgId) return null

  const dropdownOpen = open && q.trim().length >= 2

  return (
    <div className="relative hidden w-full max-w-md md:block">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current)
          if (q.trim().length >= 2) setOpen(true)
        }}
        onBlur={() => {
          // small delay so result-row clicks still register after the blur
          blurTimer.current = setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            clear()
            inputRef.current?.blur()
          }
        }}
        placeholder="Search projects, tasks, people…"
        aria-label="Search across your workspace"
        role="combobox"
        aria-expanded={dropdownOpen}
        aria-controls="global-search-listbox"
        aria-autocomplete="list"
        className="h-9 pl-9 pr-9"
      />
      {loading && (
        <Loader2
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
      {dropdownOpen && (
        <div
          id="global-search-listbox"
          role="listbox"
          aria-label="Search results"
          className="absolute top-full left-0 z-50 mt-1.5 max-h-80 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg"
        >
          {loading && results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No matches for “{q.trim()}”
            </p>
          ) : (
            grouped.map((g) => {
              const meta = SEARCH_TYPE_META[g.type]
              const Icon = meta.icon
              return (
                <div key={g.type}>
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {meta.label}
                  </p>
                  {g.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => choose(item)}
                      className="flex w-full items-center gap-3 py-2.5 pr-4 pl-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ---------- mobile search (M10-ui) ----------
// The desktop GlobalSearch is `hidden md:block`; on mobile we surface a search
// icon button that opens a Dialog with the same search input + results list.
function MobileGlobalSearch() {
  const { navigate, me } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced query — 300ms, only when ≥2 chars; aborts stale requests.
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          data?: { results?: SearchItem[] }
          error?: string
        }
        if (!res.ok || json.ok === false) throw new Error(json.error ?? 'Search failed')
        setResults(Array.isArray(json.data?.results) ? json.data.results : [])
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setResults([])
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  // Auto-focus the input when the dialog opens; clear on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
    setQ('')
    setResults([])
  }, [open])

  const grouped = useMemo(() => {
    const order: SearchItem['type'][] = []
    const map = new Map<SearchItem['type'], SearchItem[]>()
    for (const r of results) {
      if (!map.has(r.type)) {
        map.set(r.type, [])
        order.push(r.type)
      }
      map.get(r.type)!.push(r)
    }
    return order.map((type) => ({ type, items: map.get(type)! }))
  }, [results])

  function choose(item: SearchItem) {
    navigate(item.module as never, item.params)
    setOpen(false)
  }

  // Org-less users have no org data to search — hide the icon entirely.
  if (!me?.activeOrgId) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:hidden"
        aria-label="Search workspace"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-[calc(100%-2rem)] translate-y-0 gap-0 p-0 sm:max-w-md" showCloseButton={false}>
          <DialogTitle className="sr-only">Search workspace</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="Search projects, tasks, people…"
              aria-label="Search across your workspace"
              role="combobox"
              aria-autocomplete="list"
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search.
              </p>
            ) : loading && results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matches for “{q.trim()}”
              </p>
            ) : (
              grouped.map((g) => {
                const meta = SEARCH_TYPE_META[g.type]
                const Icon = meta.icon
                return (
                  <div key={g.type} role="listbox" aria-label="Search results">
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {meta.label}
                    </p>
                    {g.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => choose(item)}
                        className="flex w-full items-center gap-3 py-2.5 pr-4 pl-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          {item.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------- dark mode toggle ----------

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // Standard next-themes hydration guard: resolvedTheme is undefined until the
  // client mounts, so it must never drive the SSR markup. The icons below are
  // CSS-driven (dark: variants) so server and first client render are identical.
  // (useSyncExternalStore = the lint-safe "mounted" flag: false on the server,
  // true on the client after hydration — no setState-in-effect.)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  function toggle() {
    const dark =
      mounted && resolvedTheme
        ? resolvedTheme === 'dark'
        : typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    setTheme(dark ? 'light' : 'dark')
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label="Toggle dark mode"
      onClick={toggle}
    >
      <Sun className="size-4.5 dark:hidden" aria-hidden />
      <Moon className="hidden size-4.5 dark:block" aria-hidden />
    </Button>
  )
}

export function AppTopbar() {
  const { me, logout, navigate, notifications, unreadCount, refreshNotifications, org } = useWorkspace()
  const [marking, setMarking] = useState(false)
  const user = me?.user

  async function markAll() {
    setMarking(true)
    try {
      await api('/api/notifications', { method: 'PATCH', body: { all: true }, silent: true })
      refreshNotifications()
    } catch {
    } finally {
      setMarking(false)
    }
  }

  async function markOne(id: string) {
    try {
      await api('/api/notifications', { method: 'PATCH', body: { id }, silent: true })
      refreshNotifications()
    } catch {
    }
  }

  return (
    <header className="sticky top-14 z-20 flex items-center gap-3 border-b bg-card/80 px-4 py-2.5 backdrop-blur lg:top-0 lg:px-6">
      <div className="min-w-0 shrink-0 lg:w-56">
        <p className="truncate text-sm font-medium">{org?.name ?? 'OrgOS Platform'}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {org ? 'The Organization Operating System' : 'SaaS administration'}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* M10-ui: mobile-only search icon button → opens a Dialog with the search input. */}
        <MobileGlobalSearch />
        <ThemeToggle />

        <Popover>
          <PopoverTrigger asChild>
            {/* L18-ui: size-11 meets the 44×44px iOS/WCAG touch target (was 36×36). */}
            <Button variant="ghost" size="icon" className="size-11 relative" aria-label={`Notifications (${unreadCount} unread)`}>
              <Bell className="size-4.5" />
              {/* L19-ui: text-[10px] (was text-[9px]) + size-5 (was size-4.5) for legibility. */}
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 sm:w-96">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={markAll} disabled={marking}>
                  <CheckCheck className="size-3.5" /> Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-96">
              <div className="flex flex-col">
                {notifications.length === 0 && (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">You are all caught up.</p>
                )}
                {notifications.slice(0, 25).map((n) => {
                  const Icon = NOTIF_ICONS[n.type] ?? Bell
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        markOne(n.id)
                        if (n.module) navigate(n.module as never)
                      }}
                      className={cn(
                        'flex items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60',
                        !n.readAt && 'bg-emerald-600/5'
                      )}
                    >
                      <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', n.readAt ? 'bg-muted' : 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400')}>
                        <Icon className="size-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-xs', !n.readAt ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
                      </div>
                      {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-600" aria-label="unread" />}
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 sm:flex"
          onClick={() => navigate('announcements')}
          aria-label="Announcements"
        >
          <Megaphone className="size-4" /> Announcements
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-muted" aria-label="Account menu">
              <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="sm" />
              <span className="hidden max-w-28 truncate text-sm font-medium md:block">{user?.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('profile')}>
              <UserRoundCog className="size-4" /> My profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('settings')}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
