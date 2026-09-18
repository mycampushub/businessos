'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { UserAvatar } from '@/components/app/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog'
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
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { fmtDate, relativeTime } from '@/lib/format'
import {
  CloudUpload,
  Eye,
  File,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  HardDrive,
  Info,
  Search,
  Sheet,
  Trash2,
  TriangleAlert,
  Image as ImageIcon,
} from 'lucide-react'

// ---------- local types (API shapes from worklog T1-d) ----------

interface MemberRef {
  id: string
  role: string
  title: string | null
  user: { id: string; name: string; avatarUrl: string | null }
}

interface DocItem {
  id: string
  orgId: string
  projectId: string | null
  folder: string
  name: string
  mimeType: string | null
  size: number | null
  storageKey: string
  version: number
  uploadedById: string | null
  createdAt: string
  project: { id: string; name: string; color: string | null } | null
  uploadedBy: MemberRef | null
  uploadedByName: string | null
}

interface DocumentsData {
  items: DocItem[]
  folders: string[]
}

interface ProjectLite {
  id: string
  name: string
  color: string | null
}

// ---------- helpers ----------

type DocKind = 'pdf' | 'word' | 'excel' | 'image' | 'other'

function docKind(mimeType: string | null, name: string): DocKind {
  const mt = (mimeType ?? '').toLowerCase()
  if (mt.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf'
  if (mt.includes('word') || mt.includes('document') || /\.(docx?|rtf)$/i.test(name)) return 'word'
  if (mt.includes('sheet') || mt.includes('excel') || mt.includes('csv') || /\.(xlsx?|csv)$/i.test(name)) return 'excel'
  if (mt.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|fig)$/i.test(name)) return 'image'
  return 'other'
}

const KIND_META: Record<DocKind, { icon: typeof FileText; tile: string; label: string }> = {
  pdf: { icon: FileText, tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', label: 'PDF' },
  word: { icon: FileType, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', label: 'Word' },
  excel: { icon: Sheet, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'Excel' },
  image: { icon: ImageIcon, tile: 'bg-teal-500/10 text-teal-600 dark:text-teal-300', label: 'Image' },
  other: { icon: File, tile: 'bg-muted text-muted-foreground', label: 'File' },
}

/** Bytes (API) → human size. */
function fmtSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

const MIMETYPE_OPTIONS: Array<{ value: DocKind; label: string; mime: string | undefined }> = [
  { value: 'pdf', label: 'PDF document', mime: 'application/pdf' },
  { value: 'word', label: 'Word document', mime: 'application/msword' },
  { value: 'excel', label: 'Excel spreadsheet', mime: 'application/vnd.ms-excel' },
  { value: 'image', label: 'Image', mime: 'image/png' },
  { value: 'other', label: 'Other', mime: undefined },
]

const NEW_FOLDER = '__new__'
const DEFAULT_FOLDER = '__default__'
const NO_PROJECT = 'none'

// ---------- view ----------

export default function DocumentsView() {
  const { membership, role } = useWorkspace()
  const { data, loading, error, refresh } = useData<DocumentsData>('/api/documents')
  const { data: projectsData } = useData<{ items: ProjectLite[] }>('/api/projects')

  const [folder, setFolder] = useState<string | null>(null) // null = All files
  const [q, setQ] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>(NO_PROJECT)

  // upload dialog
  const [uploadOpen, setUploadOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    folderChoice: DEFAULT_FOLDER,
    newFolder: '',
    projectId: NO_PROJECT,
    kind: 'pdf' as DocKind,
    sizeKb: '',
  })
  const [saving, setSaving] = useState(false)

  const [detailsDoc, setDetailsDoc] = useState<DocItem | null>(null)
  const [deleteDoc, setDeleteDoc] = useState<DocItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const items = data?.items ?? []
  const folders = data?.folders ?? []
  const projects = projectsData?.items ?? []

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of items) map.set(d.folder, (map.get(d.folder) ?? 0) + 1)
    return map
  }, [items])

  const docProjects = useMemo(() => {
    const map = new Map<string, ProjectLite>()
    for (const d of items) if (d.project) map.set(d.project.id, d.project)
    return [...map.values()]
  }, [items])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter(
      (d) =>
        (folder === null || d.folder === folder) &&
        (projectFilter === NO_PROJECT || d.projectId === projectFilter) &&
        (!needle || d.name.toLowerCase().includes(needle))
    )
  }, [items, folder, projectFilter, q])

  const totalSize = useMemo(() => items.reduce((sum, d) => sum + (d.size ?? 0), 0), [items])

  const canDelete = (d: DocItem) =>
    !!membership && (d.uploadedById === membership.id || role === 'OWNER' || role === 'ADMIN')

  const openUpload = () => {
    setForm((f) => ({ ...f, name: '', newFolder: '', sizeKb: '', folderChoice: DEFAULT_FOLDER, projectId: NO_PROJECT, kind: 'pdf' }))
    setUploadOpen(true)
  }

  const submitUpload = async () => {
    const name = form.name.trim()
    if (!name) {
      toast({ title: 'Name required', description: 'Give the document a file name.', variant: 'destructive' })
      return
    }
    const folderName =
      form.folderChoice === NEW_FOLDER
        ? form.newFolder.trim()
        : form.folderChoice === DEFAULT_FOLDER
          ? 'General'
          : form.folderChoice || 'General'
    if (form.folderChoice === NEW_FOLDER && !folderName) {
      toast({ title: 'Folder name required', description: 'Enter a name for the new folder.', variant: 'destructive' })
      return
    }
    const mime = MIMETYPE_OPTIONS.find((o) => o.value === form.kind)?.mime
    const kb = Number(form.sizeKb)
    setSaving(true)
    try {
      await api('/api/documents', {
        method: 'POST',
        body: {
          name,
          folder: folderName,
          projectId: form.projectId === NO_PROJECT ? undefined : form.projectId,
          mimeType: mime,
          size: form.sizeKb.trim() !== '' && !Number.isNaN(kb) ? Math.round(kb * 1024) : undefined,
        },
      })
      toast({ title: 'Document uploaded', description: `${name} added to ${folderName}.` })
      setUploadOpen(false)
      refresh()
    } catch {
      /* api() already toasts */
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteDoc) return
    setDeleting(true)
    try {
      await api(`/api/documents/${deleteDoc.id}`, { method: 'DELETE' })
      toast({ title: 'Document deleted', description: `${deleteDoc.name} was removed from the library.` })
      setDeleteDoc(null)
      setDetailsDoc(null)
      refresh()
    } catch {
      /* api() already toasts */
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = folder !== null || projectFilter !== NO_PROJECT || q.trim() !== ''
  const clearFilters = () => {
    setFolder(null)
    setProjectFilter(NO_PROJECT)
    setQ('')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderOpen}
        title="Documents"
        description="Organization library — every file, organized and searchable"
        actions={
          <Button onClick={openUpload}>
            <CloudUpload className="size-4" aria-hidden />
            Upload document
          </Button>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total files" value={items.length} sub="across all folders" icon={FileText} loading={loading} />
        <StatCard
          label="Folders"
          value={folders.length}
          sub={folders.slice(0, 3).join(', ') + (folders.length > 3 ? '…' : '') || '—'}
          icon={Folder}
          tone="success"
          loading={loading}
        />
        <StatCard label="Library size" value={fmtSize(totalSize)} sub="across the library" icon={HardDrive} tone="warning" loading={loading} />
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={TriangleAlert} title="Could not load documents" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents yet"
          description="Upload the first contract, policy or spec — every member of the organization can browse the library."
          action={
            <Button onClick={openUpload}>
              <CloudUpload className="size-4" aria-hidden />
              Upload document
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* folder rail — horizontal chips on mobile, vertical rail on desktop */}
          <nav aria-label="Document folders" className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
            <button
              type="button"
              onClick={() => setFolder(null)}
              aria-current={folder === null}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors lg:justify-start lg:flex-none',
                folder === null
                  ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-border text-foreground hover:bg-muted/60'
              )}
            >
              <FolderOpen className="size-4 shrink-0" aria-hidden />
              <span className="truncate">All files</span>
              <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
            </button>
            {folders.map((f) => {
              const active = folder === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFolder(active ? null : f)}
                  aria-current={active}
                  className={cn(
                    'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors lg:justify-start lg:flex-none',
                    active
                      ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-border text-foreground hover:bg-muted/60'
                  )}
                >
                  <Folder className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{f}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{folderCounts.get(f) ?? 0}</span>
                </button>
              )
            })}
          </nav>

          {/* main area */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by file name…"
                  aria-label="Search documents by name"
                  className="pl-9"
                />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Filter by project">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>All projects</SelectItem>
                  {docProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* list */}
            {visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching documents"
                description="No files match the current folder, project or search."
                action={
                  hasFilters ? (
                    <Button variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="flex flex-col gap-2" role="list">
                {visible.map((d) => {
                  const kind = docKind(d.mimeType, d.name)
                  const KindIcon = KIND_META[kind].icon
                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm sm:p-4"
                    >
                      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', KIND_META[kind].tile)}>
                        <KindIcon className="size-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          {d.version > 1 && (
                            <Badge variant="outline" className="px-1.5 text-[10px] text-muted-foreground">
                              v{d.version}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="max-w-28 truncate px-1.5 text-[10px] font-medium">
                            {d.folder}
                          </Badge>
                          {d.project && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: d.project.color ?? '#10b981' }}
                                aria-hidden
                              />
                              <span className="truncate">{d.project.name}</span>
                            </span>
                          )}
                          <span className="hidden sm:inline" aria-hidden>
                            ·
                          </span>
                          <span>{fmtSize(d.size)}</span>
                          <span aria-hidden>·</span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <UserAvatar name={d.uploadedByName} avatarUrl={d.uploadedBy?.user.avatarUrl} size="xs" />
                            <span className="truncate">{d.uploadedByName ?? 'Former member'}</span>
                          </span>
                          <span aria-hidden>·</span>
                          <span title={fmtDate(d.createdAt)}>{relativeTime(d.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 text-muted-foreground hover:text-foreground sm:size-9"
                          onClick={() => setDetailsDoc(d)}
                          aria-label={`View details of ${d.name}`}
                        >
                          <Eye className="size-4" aria-hidden />
                        </Button>
                        {canDelete(d) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 text-muted-foreground hover:text-destructive sm:size-9"
                            onClick={() => setDeleteDoc(d)}
                            aria-label={`Delete ${d.name}`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>Register a file in the organization library.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-name">File name</Label>
              <Input
                id="doc-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. MSA — Acme (signed).pdf"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Folder</Label>
                <Select
                  value={form.folderChoice}
                  onValueChange={(v) => setForm((f) => ({ ...f, folderChoice: v }))}
                >
                  <SelectTrigger className="w-full" aria-label="Select folder">
                    <SelectValue placeholder="General" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_FOLDER}>General (default)</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_FOLDER}>New folder…</SelectItem>
                  </SelectContent>
                </Select>
                {form.folderChoice === NEW_FOLDER && (
                  <Input
                    value={form.newFolder}
                    onChange={(e) => setForm((f) => ({ ...f, newFolder: e.target.value }))}
                    placeholder="New folder name"
                    aria-label="New folder name"
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Project (optional)</Label>
                <Select
                  value={form.projectId}
                  onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                >
                  <SelectTrigger className="w-full" aria-label="Link to project">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>File type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as DocKind }))}>
                  <SelectTrigger className="w-full" aria-label="File type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIMETYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-size">Size (KB)</Label>
                <Input
                  id="doc-size"
                  type="number"
                  min="0"
                  value={form.sizeKb}
                  onChange={(e) => setForm((f) => ({ ...f, sizeKb: e.target.value }))}
                  placeholder="e.g. 240"
                />
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p>
                Files are organized as <span className="font-mono">{'{org-slug}/{folder}/{name}'}</span> — names must be
                unique inside a folder.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitUpload} disabled={saving}>
              {saving ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* details dialog */}
      <Dialog open={!!detailsDoc} onOpenChange={(open) => !open && setDetailsDoc(null)}>
        <DialogContent className="sm:max-w-lg">
          {detailsDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8 text-base">{detailsDoc.name}</DialogTitle>
                <DialogDescription>Document metadata</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Folder</dt>
                  <dd className="mt-0.5 text-sm font-medium">{detailsDoc.folder}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</dt>
                  <dd className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium">
                    {detailsDoc.project ? (
                      <>
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: detailsDoc.project.color ?? '#10b981' }}
                          aria-hidden
                        />
                        {detailsDoc.project.name}
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {detailsDoc.mimeType ?? KIND_META[docKind(detailsDoc.mimeType, detailsDoc.name)].label}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Size</dt>
                  <dd className="mt-0.5 text-sm font-medium">{fmtSize(detailsDoc.size)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</dt>
                  <dd className="mt-0.5 text-sm font-medium">v{detailsDoc.version}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uploaded</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {fmtDate(detailsDoc.createdAt)}{' '}
                    <span className="font-normal text-muted-foreground">({relativeTime(detailsDoc.createdAt)})</span>
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uploaded by</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <UserAvatar
                      name={detailsDoc.uploadedByName}
                      avatarUrl={detailsDoc.uploadedBy?.user.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{detailsDoc.uploadedByName ?? 'Former member'}</p>
                      {detailsDoc.uploadedBy?.title && (
                        <p className="truncate text-xs text-muted-foreground">{detailsDoc.uploadedBy.title}</p>
                      )}
                    </div>
                  </dd>
                </div>
              </dl>
              <div className="rounded-lg bg-muted p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Storage key
                </p>
                <code className="break-all font-mono text-xs">{detailsDoc.storageKey}</code>
              </div>
              <DialogFooter>
                {canDelete(detailsDoc) && (
                  <Button
                    variant="outline"
                    className="mr-auto text-destructive hover:text-destructive"
                    onClick={() => setDeleteDoc(detailsDoc)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Delete
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailsDoc(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteDoc?.name}” will be removed from the library for every member of the organization. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete document'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
