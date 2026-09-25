'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, useData } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge, PriorityDot } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { CreateOrgDialog } from '@/components/app/onboarding'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { dueLabel, csv, ROLE_LABELS, ROLE_TONE, TASK_STATUS_LABELS, TASK_STATUS_TONE } from '@/lib/format'
import { Mail, MapPin, Phone, Loader2, Plus, ListTodo, CheckCircle2, Check } from 'lucide-react'

// ---------- local types ----------

interface MyTask {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  projectName: string | null
}

interface ProfileForm {
  name: string
  headline: string
  bio: string
  location: string
  phone: string
  skills: string
}

// ---------- view ----------

export default function ProfileView() {
  const { me, loadingMe, membership, role, refreshMe, navigate } = useWorkspace()
  const { data: tasksData, loading: tasksLoading } = useData<{ items: MyTask[] }>('/api/tasks?view=mine')

  const [form, setForm] = useState<ProfileForm>({ name: '', headline: '', bio: '', location: '', phone: '', skills: '' })
  const [busy, setBusy] = useState(false)
  // M16-ui: inline "Saved ✓" indicator next to the Save button.
  const [saved, setSaved] = useState(false)
  const [orgDialogOpen, setOrgDialogOpen] = useState(false)

  const user = me?.user
  const myTasks = tasksData?.items ?? []
  const topTasks = myTasks.slice(0, 5)

  // keep the form in sync with the session user (loads once, re-syncs after save)
  const syncFormFromUser = (u: NonNullable<typeof user>) =>
    setForm({
      name: u.name ?? '',
      headline: u.headline ?? '',
      bio: u.bio ?? '',
      location: u.location ?? '',
      phone: u.phone ?? '',
      skills: u.skills ?? '',
    })

  // M23-fe: only sync the form from `me.user` on initial mount. Re-running this
  // effect whenever `me.user` changes (e.g. after `refreshMe()` from another
  // component, or after a server-side update) would overwrite the user's
  // in-progress edits. Empty-deps array → runs exactly once. The "Reset" button
  // below calls syncFormFromUser(user) explicitly for the rare case the user
  // wants to discard their edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const u = me?.user
    if (u) syncFormFromUser(u)
  }, [])

  // M15-ui: dirty flag for the beforeunload guard. Compare the live form values
  // to the current `me.user` snapshot — after a successful save, `refreshMe()`
  // updates `me.user` to match the saved form, so dirty goes back to false; if
  // the user types anything, dirty becomes true; if they Reset, the form is
  // re-synced to `me.user` and dirty goes back to false.
  const isDirty = useMemo(() => {
    if (!user) return false
    return (
      form.name !== (user.name ?? '') ||
      form.headline !== (user.headline ?? '') ||
      form.bio !== (user.bio ?? '') ||
      form.location !== (user.location ?? '') ||
      form.phone !== (user.phone ?? '') ||
      form.skills !== (user.skills ?? '')
    )
  }, [form, user])

  // M15-ui: warn before closing the tab / navigating to an external URL when
  // there are unsaved edits. In-app sidebar navigation can't be intercepted by
  // beforeunload — that would need a route blocker — but this minimum-viable
  // guard catches the most common "discard by accident" paths (close tab,
  // reload, type a new URL). The `!busy` guard avoids firing during a save.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && !busy) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, busy])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/profile', { method: 'PATCH', body: form })
      await refreshMe()
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' })
      // M16-ui: flash an inline "Saved ✓" next to the Save button for 2s.
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // api() already surfaced the error via toast
    } finally {
      setBusy(false)
    }
  }

  if (loadingMe || !me || !user) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My profile" description="Loading your profile…" />
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  const skillChips = csv(user.skills)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My profile"
        description="Personal information, organizations and open work"
      />

      {/* header card */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="lg" className="size-20 shrink-0 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{user.name}</h2>
              {membership && (
                <StatusBadge label={ROLE_LABELS[role] ?? role} tone={ROLE_TONE[role] ?? 'outline'} dot={false} />
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {user.headline ?? membership?.title ?? ROLE_LABELS[role] ?? 'Member'}
            </p>
            <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
              <span className="flex items-center gap-1.5 truncate"><Mail className="size-3.5 shrink-0" aria-hidden />{user.email}</span>
              {user.location && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />{user.location}
                </span>
              )}
              {user.phone && (
                <span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0" aria-hidden />{user.phone}</span>
              )}
            </div>
            {user.bio && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{user.bio}</p>}
            {skillChips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skillChips.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* editable profile form */}
        <Card className="py-0 lg:col-span-2">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={saveProfile} className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold">Profile details</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Visible to teammates across your organizations. Your email address cannot be changed.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pf-name">Full name</Label>
                  <Input
                    id="pf-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                    required
                    maxLength={120}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pf-headline">Headline</Label>
                  <Input
                    id="pf-headline"
                    value={form.headline}
                    onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                    placeholder="e.g. Founder & CEO"
                    maxLength={160}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pf-location">Location</Label>
                  <Input
                    id="pf-location"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Dhaka, Bangladesh"
                    maxLength={160}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pf-phone">Phone</Label>
                  <Input
                    id="pf-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. +880 1XXX-XXXXXX"
                    maxLength={40}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="pf-skills">Skills</Label>
                  <Input
                    id="pf-skills"
                    value={form.skills}
                    onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
                    placeholder="Comma-separated, e.g. React, Product Strategy, Design"
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground">Separate skills with commas.</p>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="pf-bio">Bio</Label>
                  <Textarea
                    id="pf-bio"
                    rows={4}
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="A short introduction about you"
                    maxLength={1000}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => user && syncFormFromUser(user)}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Save changes
                </Button>
                {/* M16-ui: inline "Saved ✓" indicator next to the Save button. */}
                {saved && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  >
                    <Check className="size-3.5" aria-hidden /> Saved
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* right column */}
        <div className="flex flex-col gap-6">
          {/* open task count */}
          <StatCard
            label="Open Tasks"
            value={myTasks.length}
            sub={tasksLoading ? 'Loading…' : 'Assigned to you, not done yet'}
            tone="info"
            icon={ListTodo}
            loading={tasksLoading}
            onClick={() => navigate('my-tasks')}
          />

          {/* my organizations */}
          <Card className="overflow-hidden py-0">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-semibold">My organizations</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{me.memberships.length} workspace{me.memberships.length === 1 ? '' : 's'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOrgDialogOpen(true)}>
                <Plus className="size-3.5" aria-hidden /> New
              </Button>
            </div>
            {me.memberships.length === 0 ? (
              <EmptyState className="m-4" icon={ListTodo} title="No organizations" description="Create a workspace to get started." />
            ) : (
              <ul className="divide-y divide-border">
                {me.memberships.map((m) => {
                  const active = m.orgId === me.activeOrgId
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <UserAvatar name={m.org.name} avatarUrl={m.org.logoUrl} size="sm" className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {m.org.name}
                          {active && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                              <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden /> Active
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.title ?? ROLE_LABELS[m.role] ?? m.role} · {m.org.plan.charAt(0) + m.org.plan.slice(1).toLowerCase()} plan
                        </p>
                      </div>
                      <StatusBadge label={ROLE_LABELS[m.role] ?? m.role} tone={ROLE_TONE[m.role] ?? 'outline'} dot={false} />
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
              Switch organizations anytime from the org switcher in the sidebar.
            </p>
          </Card>

          {/* my open tasks */}
          <Card className="overflow-hidden py-0">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-semibold">My open tasks</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Top 5, due soonest first</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('my-tasks')}>
                <ListTodo className="size-3.5" aria-hidden /> Go to My Tasks
              </Button>
            </div>
            {tasksLoading ? (
              <div className="flex flex-col gap-3 p-4 sm:p-5">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : topTasks.length === 0 ? (
              <EmptyState className="m-4" icon={CheckCircle2} title="No open tasks" description="Nothing is assigned to you right now." />
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {topTasks.map((t) => {
                  const due = dueLabel(t.dueDate)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate('my-tasks')}
                        className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <PriorityDot priority={t.priority} />
                            <span className="truncate text-sm font-medium">{t.title}</span>
                          </span>
                          <StatusBadge label={TASK_STATUS_LABELS[t.status] ?? t.status} tone={TASK_STATUS_TONE[t.status] ?? 'outline'} />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{t.projectName ?? 'No project'}</span>
                          <span className={due.overdue ? 'shrink-0 font-medium text-rose-600 dark:text-rose-400' : 'shrink-0'}>{due.text}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <CreateOrgDialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen} />
    </div>
  )
}
