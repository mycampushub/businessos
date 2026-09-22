'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, ROLE_TONE, relativeTime } from '@/lib/format'
import { CalendarDays, Megaphone, Pencil, Pin, Plus, Trash2, TriangleAlert } from 'lucide-react'

// ---------- local types (API shape from worklog T1-d) ----------

interface AnnouncementItem {
  id: string
  orgId: string
  authorMembershipId: string | null
  title: string
  body: string
  pinned: boolean
  createdAt: string
  author: {
    id: string
    role: string
    title: string | null
    user: { id: string; name: string; avatarUrl: string | null }
  } | null
  authorName: string | null
}

interface AnnouncementsData {
  items: AnnouncementItem[]
}

const CAN_PUBLISH = ['OWNER', 'ADMIN', 'MANAGER', 'HR']

// ---------- view ----------

export default function AnnouncementsView() {
  const { role, membership, org } = useWorkspace()
  const { data, loading, error, refresh } = useData<AnnouncementsData>('/api/announcements')
  const canPublish = CAN_PUBLISH.includes(role)

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  // edit / delete state — PATCH & DELETE /api/announcements/[id] allow the
  // publisher roles (OWNER/ADMIN/MANAGER/HR) and the original author.
  const [editing, setEditing] = useState<AnnouncementItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editPinned, setEditPinned] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState<AnnouncementItem | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const items = data?.items ?? []

  const pinnedCount = useMemo(() => items.filter((a) => a.pinned).length, [items])
  const weekCount = useMemo(
    () => items.filter((a) => Date.now() - new Date(a.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length,
    [items]
  )

  const openDialog = () => {
    setTitle('')
    setBody('')
    setPinned(false)
    setOpen(true)
  }

  const canManage = (a: AnnouncementItem) =>
    canPublish || (membership?.id != null && a.authorMembershipId === membership.id)

  const openEdit = (a: AnnouncementItem) => {
    setEditTitle(a.title)
    setEditBody(a.body)
    setEditPinned(a.pinned)
    setEditing(a)
  }

  const saveEdit = async () => {
    if (!editing) return
    const t = editTitle.trim()
    const b = editBody.trim()
    if (!t) {
      toast({ title: 'Title required', description: 'Give the announcement a title.', variant: 'destructive' })
      return
    }
    if (!b) {
      toast({ title: 'Body required', description: 'Write the announcement body.', variant: 'destructive' })
      return
    }
    setSavingEdit(true)
    try {
      await api(`/api/announcements/${editing.id}`, {
        method: 'PATCH',
        body: { title: t, body: b, pinned: editPinned },
      })
      toast({ title: 'Announcement updated', description: 'Changes are live for every member.' })
      setEditing(null)
      refresh()
    } catch {
      /* api() already toasts */
    } finally {
      setSavingEdit(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api(`/api/announcements/${deleting.id}`, { method: 'DELETE' })
      toast({
        title: 'Announcement deleted',
        description: `“${deleting.title}” was removed from the feed.`,
      })
      setDeleting(null)
      refresh()
    } catch {
      /* api() already toasts */
    } finally {
      setDeletingBusy(false)
    }
  }

  const submit = async () => {
    const t = title.trim()
    const b = body.trim()
    if (!t) {
      toast({ title: 'Title required', description: 'Give the announcement a title.', variant: 'destructive' })
      return
    }
    if (!b) {
      toast({ title: 'Body required', description: 'Write the announcement body.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/announcements', { method: 'POST', body: { title: t, body: b, pinned } })
      toast({ title: 'Announcement published', description: 'All active members were notified.' })
      setOpen(false)
      refresh()
    } catch {
      /* api() already toasts */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Megaphone}
        title="Announcements"
        description="Organization broadcast feed — reach every member"
        actions={
          canPublish ? (
            <Button onClick={openDialog}>
              <Plus className="size-4" aria-hidden />
              New announcement
            </Button>
          ) : undefined
        }
      />

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Announcements" value={items.length} sub="all time" icon={Megaphone} loading={loading} />
        <StatCard label="Pinned" value={pinnedCount} sub="shown first" icon={Pin} tone="success" loading={loading} />
        <StatCard
          label="This week"
          value={weekCount}
          sub="last 7 days"
          icon={CalendarDays}
          tone="info"
          loading={loading}
        />
      </div>

      {/* feed */}
      {loading && !data ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={TriangleAlert} title="Could not load announcements" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description={
            canPublish
              ? `Broadcasts published here notify every active member of ${org?.name ?? 'your organization'}.`
              : 'When owners, admins, managers or HR publish a broadcast, it appears here.'
          }
          action={
            canPublish ? (
              <Button onClick={openDialog}>
                <Megaphone className="size-4" aria-hidden />
                Publish the first announcement
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1" role="feed" aria-label="Announcements">
          {items.map((a) => (
            <Card
              key={a.id}
              className={cn(
                'gap-0 py-0',
                a.pinned && 'border-emerald-500/40 bg-emerald-500/[0.04] dark:border-emerald-500/40 dark:bg-emerald-500/[0.06]'
              )}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={a.authorName} avatarUrl={a.author?.user.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.authorName ?? 'Former member'}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {a.author && (
                          <StatusBadge
                            label={ROLE_LABELS[a.author.role] ?? a.author.role}
                            tone={ROLE_TONE[a.author.role] ?? 'outline'}
                            dot={false}
                            className="px-1.5 py-0 text-[10px]"
                          />
                        )}
                        <span title={a.createdAt}>{relativeTime(a.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {a.pinned && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-emerald-600/30 bg-emerald-600/10 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                      >
                        <Pin className="size-3" aria-hidden />
                        Pinned
                      </Badge>
                    )}
                    {canManage(a) && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          onClick={() => openEdit(a)}
                          aria-label={`Edit announcement: ${a.title}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(a)}
                          aria-label={`Delete announcement: ${a.title}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{a.title}</h3>
                <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* new announcement dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Published to every active member of {org?.name ?? 'your organization'} — they get a notification
              instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 all-hands — Thursday 4pm"
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ann-body">Body</Label>
              <Textarea
                id="ann-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the broadcast — agenda, context, action items…"
                className="resize-y"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Pin to top</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pinned announcements stay first in the feed for everyone.
                </p>
              </div>
              <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Pin announcement to top" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* edit announcement dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit announcement</DialogTitle>
            <DialogDescription>
              Changes are visible to every member of {org?.name ?? 'your organization'} immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ann-edit-title">Title</Label>
              <Input
                id="ann-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Q4 all-hands — Thursday 4pm"
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ann-edit-body">Body</Label>
              <Textarea
                id="ann-edit-body"
                rows={6}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Write the broadcast — agenda, context, action items…"
                className="resize-y"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Pin to top</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pinned announcements stay first in the feed for everyone.
                </p>
              </div>
              <Switch checked={editPinned} onCheckedChange={setEditPinned} aria-label="Pin announcement to top" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” will be permanently removed from the feed for every member. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancel</AlertDialogCancel>
            {/* preventDefault keeps the dialog open while the DELETE runs */}
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60"
              disabled={deletingBusy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deletingBusy ? 'Deleting…' : 'Delete announcement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
