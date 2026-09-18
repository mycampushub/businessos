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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { money, dueLabel, fmtDate, relativeTime, csv, APPLICATION_STAGE_LABELS, APPLICATION_STAGE_TONE, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, WORK_MODES, WORK_MODE_LABELS } from '@/lib/format'
import { Briefcase, BriefcaseBusiness, CalendarClock, CircleAlert, Coins, Eye, Globe2, MapPin, MoreHorizontal, PauseCircle, PencilLine, Plus, Search, Send, Star, Trash2, UserRoundSearch, UsersRound } from 'lucide-react'

// ---------- local types ----------

interface Job {
  id: string
  title: string
  description: string
  responsibilities: string | null
  requirements: string | null
  skills: string | null
  experienceLevel: string | null
  employmentType: string
  location: string | null
  workMode: string
  salaryMin: number | null
  salaryMax: number | null
  currency: string
  deadline: string | null
  openings: number
  visibility: string
  status: string
  departmentId: string | null
  departmentName: string | null
  hiringManagerName: string | null
  applicationCount: number
  createdAt: string
}

interface PublicJob extends Job {
  org: { id: string; name: string; logoUrl: string | null }
}

interface Department { id: string; name: string }

/** Applicant row from GET /api/recruitment/applications?jobId= (notes stripped server-side for non-mgmt). */
interface Applicant {
  id: string
  candidateName: string
  email: string
  phone: string | null
  stage: string
  rating: number | null
  experienceYears: number | null
  skills: string | null
  source: string
  createdAt: string
  decidedAt: string | null
  jobTitle: string
  user: { id: string; name: string; avatarUrl: string | null } | null
}

const NONE = '__none__'
const EXPERIENCE_LEVELS = ['ENTRY', 'MID', 'SENIOR', 'LEAD'] as const
const EXPERIENCE_LABELS: Record<string, string> = { ENTRY: 'Entry', MID: 'Mid-level', SENIOR: 'Senior', LEAD: 'Lead' }
const VISIBILITIES = ['PUBLIC', 'PLATFORM', 'PRIVATE'] as const
const VISIBILITY_LABELS: Record<string, string> = { PUBLIC: 'Public — visible to everyone', PLATFORM: 'Platform members only', PRIVATE: 'Private — direct links' }
const JOB_STATUS_LABELS: Record<string, string> = { OPEN: 'Open', PAUSED: 'Paused', CLOSED: 'Closed' }
const JOB_STATUS_TONE: Record<string, 'success' | 'warning' | 'muted'> = { OPEN: 'success', PAUSED: 'warning', CLOSED: 'muted' }

function salaryRange(j: Job): string {
  if (j.salaryMin == null && j.salaryMax == null) return '—'
  if (j.salaryMin != null && j.salaryMax != null) return `${money(j.salaryMin, j.currency)} – ${money(j.salaryMax, j.currency)}/mo`
  return `${j.salaryMin != null ? money(j.salaryMin, j.currency) : money(j.salaryMax, j.currency)}/mo`
}

export default function RecruitJobsView() {
  const { role } = useWorkspace()
  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'HR'

  const jobsData = useData<{ items: Job[] }>('/api/recruitment/jobs')
  const publicData = useData<{ items: PublicJob[] }>('/api/jobs/public')
  const deptData = useData<{ items: Department[] }>('/api/departments')

  const jobs = jobsData.data?.items ?? []
  const publicJobs = publicData.data?.items ?? []
  const departments = deptData.data?.items ?? []

  const open = jobs.filter((j) => j.status === 'OPEN').length
  const paused = jobs.filter((j) => j.status === 'PAUSED').length
  const totalApps = jobs.reduce((s, j) => s + (j.applicationCount ?? 0), 0)

  // marketplace filters
  const [mq, setMq] = useState('')
  const [mDept, setMDept] = useState('all')
  // delete-confirmation state for our jobs
  const [deleting, setDeleting] = useState<Job | null>(null)
  // per-job applicants dialog (opened from the table + the job preview dialog)
  const [applicantsJob, setApplicantsJob] = useState<Job | null>(null)
  const marketDepartments = useMemo(() => [...new Set(publicJobs.map((j) => j.departmentName).filter((x): x is string => !!x))].sort(), [publicJobs])
  const filteredMarket = useMemo(() => {
    const q = mq.trim().toLowerCase()
    return publicJobs.filter((j) => {
      if (mDept !== 'all' && j.departmentName !== mDept) return false
      if (!q) return true
      return (
        j.title.toLowerCase().includes(q) ||
        (j.org?.name ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q) ||
        csv(j.skills).some((s) => s.toLowerCase().includes(q))
      )
    })
  }, [publicJobs, mq, mDept])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BriefcaseBusiness}
        title="Recruitment"
        description="Manage your job postings and browse the platform job marketplace."
      />

      <Tabs defaultValue="ours">
        <TabsList>
          <TabsTrigger value="ours">Our jobs</TabsTrigger>
          <TabsTrigger value="market">Job marketplace</TabsTrigger>
        </TabsList>

        {/* ---------------- Our jobs ---------------- */}
        <TabsContent value="ours" className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Open jobs" value={jobsData.loading ? 0 : open} sub="Actively hiring" icon={Briefcase} tone="success" loading={jobsData.loading} />
            <StatCard label="Paused" value={jobsData.loading ? 0 : paused} sub="On hold" icon={PauseCircle} tone="warning" loading={jobsData.loading} />
            <StatCard label="Total applications" value={jobsData.loading ? 0 : totalApps} sub="Across all jobs" icon={UsersRound} tone="info" loading={jobsData.loading} />
          </div>

          {canManage && (
            <div className="flex justify-end">
              <JobFormDialog
                departments={departments}
                onSaved={() => jobsData.refresh()}
                trigger={<Button className="min-h-11"><Plus className="mr-1.5 size-4" aria-hidden /> Post a job</Button>}
              />
            </div>
          )}

          {jobsData.loading ? (
            <Card className="py-0">
              <CardContent className="flex flex-col gap-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </CardContent>
            </Card>
          ) : jobsData.error ? (
            <EmptyState icon={CircleAlert} title="Could not load jobs" description={jobsData.error} />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No job postings yet"
              description={canManage ? 'Post your first job to start collecting applications.' : 'Your organization has not posted any jobs yet.'}
              action={canManage ? (
                <JobFormDialog
                  departments={departments}
                  onSaved={() => jobsData.refresh()}
                  trigger={<Button><Plus className="mr-1.5 size-4" aria-hidden /> Post a job</Button>}
                />
              ) : undefined}
            />
          ) : (
            <Card className="py-0 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-56">Title</TableHead>
                      <TableHead className="min-w-44">Type</TableHead>
                      <TableHead className="hidden min-w-32 md:table-cell">Location</TableHead>
                      <TableHead className="min-w-40 text-right">Salary</TableHead>
                      <TableHead className="hidden min-w-20 text-center sm:table-cell">Openings</TableHead>
                      <TableHead className="min-w-24 text-center">Applicants</TableHead>
                      <TableHead className="hidden min-w-28 lg:table-cell">Deadline</TableHead>
                      <TableHead className="min-w-24">Status</TableHead>
                      <TableHead className="w-28 text-right"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => {
                      const dl = j.deadline ? dueLabel(j.deadline) : null
                      return (
                        <TableRow key={j.id} className={cn(j.status === 'CLOSED' && 'opacity-60')}>
                          <TableCell>
                            <JobPreviewDialog
                              job={j}
                              canManage={canManage}
                              onViewApplicants={setApplicantsJob}
                              trigger={
                                <button className="text-left text-sm font-semibold hover:underline" aria-label={`View ${j.title}`}>
                                  <span className="flex items-center gap-1.5">
                                    {j.title}
                                    <Eye className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                  </span>
                                </button>
                              }
                            />
                            <p className="truncate text-xs text-muted-foreground">{j.departmentName ?? 'No department'}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-xs">{EMPLOYMENT_TYPE_LABELS[j.employmentType] ?? j.employmentType}</Badge>
                              <Badge variant="outline" className="text-xs">{WORK_MODE_LABELS[j.workMode] ?? j.workMode}</Badge>
                              {j.experienceLevel && <Badge variant="secondary" className="text-xs">{EXPERIENCE_LABELS[j.experienceLevel] ?? j.experienceLevel}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{j.location ?? 'Anywhere'}</TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">{salaryRange(j)}</TableCell>
                          <TableCell className="hidden text-center text-sm tabular-nums sm:table-cell">{j.openings}</TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 gap-1.5"
                              onClick={() => setApplicantsJob(j)}
                              aria-label={`View applicants for ${j.title}`}
                            >
                              <UsersRound className="size-3.5 text-muted-foreground" aria-hidden />
                              <Badge variant="secondary" className="tabular-nums">{j.applicationCount}</Badge>
                            </Button>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {dl ? (
                              <span className={cn('text-sm', dl.overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                                {dl.text}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell><StatusBadge label={JOB_STATUS_LABELS[j.status] ?? j.status} tone={JOB_STATUS_TONE[j.status] ?? 'outline'} /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canManage && (
                                <JobFormDialog
                                  departments={departments}
                                  editing={j}
                                  onSaved={() => jobsData.refresh()}
                                  trigger={<Button variant="ghost" size="icon" className="size-9" aria-label={`Edit ${j.title}`}><PencilLine className="size-4" /></Button>}
                                />
                              )}
                              {canManage && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="size-9" aria-label={`More actions for ${j.title}`}><MoreHorizontal className="size-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuLabel>Set status</DropdownMenuLabel>
                                    {(['OPEN', 'PAUSED', 'CLOSED'] as const).map((s) => (
                                      <DropdownMenuItem
                                        key={s}
                                        disabled={j.status === s}
                                        onClick={async () => {
                                          try {
                                            await api(`/api/recruitment/jobs/${j.id}`, { method: 'PATCH', body: { status: s } })
                                            toast({ title: s === 'OPEN' ? 'Job reopened' : s === 'PAUSED' ? 'Job paused' : 'Job closed', description: j.title })
                                            jobsData.refresh()
                                          } catch { /* api() toasts */ }
                                        }}
                                      >
                                        {s === 'OPEN' ? 'Open' : s === 'PAUSED' ? 'Pause' : 'Close'}{j.status === s ? ' (current)' : ''}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(j)}>
                                      <Trash2 className="mr-2 size-4" aria-hidden /> Delete job
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                {jobs.length} posting{jobs.length === 1 ? '' : 's'} · {totalApps} application{totalApps === 1 ? '' : 's'} in total
              </p>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- Job marketplace ---------------- */}
        <TabsContent value="market" className="flex flex-col gap-6">
          <Card className="py-0">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Search title, org, skill, location…" className="pl-9" aria-label="Search marketplace jobs" />
              </div>
              <Select value={mDept} onValueChange={setMDept}>
                <SelectTrigger className="w-full sm:w-[190px]" aria-label="Filter by department">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {marketDepartments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {publicData.loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </div>
          ) : publicData.error ? (
            <EmptyState icon={CircleAlert} title="Could not load the marketplace" description={publicData.error} />
          ) : filteredMarket.length === 0 ? (
            <EmptyState
              icon={Globe2}
              title="No open public jobs"
              description={publicJobs.length === 0 ? 'No organizations are publicly hiring right now.' : 'Try a different search or department.'}
              action={publicJobs.length > 0 ? <Button variant="outline" onClick={() => { setMq(''); setMDept('all') }}>Clear filters</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredMarket.map((j) => {
                const dl = j.deadline ? dueLabel(j.deadline) : null
                return (
                  <Card key={`${j.org.id}-${j.id}`} className="py-0 transition-shadow hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={j.org?.name ?? 'Org'} avatarUrl={j.org?.logoUrl ?? null} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{j.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{j.org?.name ?? 'Unknown org'}{j.departmentName ? ` · ${j.departmentName}` : ''}</p>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{j.description}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">{WORK_MODE_LABELS[j.workMode] ?? j.workMode}</Badge>
                        <Badge variant="outline" className="text-xs">{EMPLOYMENT_TYPE_LABELS[j.employmentType] ?? j.employmentType}</Badge>
                        {j.experienceLevel && <Badge variant="secondary" className="text-xs">{EXPERIENCE_LABELS[j.experienceLevel] ?? j.experienceLevel}</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Coins className="size-3.5" aria-hidden /> {salaryRange(j)}</span>
                        {j.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {j.location}</span>}
                        <span className="flex items-center gap-1"><UsersRound className="size-3.5" aria-hidden /> {j.applicationCount} applied</span>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                        <span className={cn('text-xs', dl?.overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                          {dl ? `${dl.text} · ${fmtDate(j.deadline)}` : 'No deadline'}
                        </span>
                        <ApplyDialog job={j} onApplied={() => publicData.refresh()} />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* per-job applicants dialog */}
      <ApplicantsDialog job={applicantsJob} open={!!applicantsJob} onOpenChange={(o) => { if (!o) setApplicantsJob(null) }} />

      {/* delete job confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The posting and its {deleting?.applicationCount ?? 0} application{deleting?.applicationCount === 1 ? '' : 's'} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return
                try {
                  await api(`/api/recruitment/jobs/${deleting.id}`, { method: 'DELETE' })
                  toast({ title: 'Job deleted', description: `${deleting.title} was removed.` })
                  jobsData.refresh()
                } catch {
                  // api() toasts the error
                } finally {
                  setDeleting(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- job preview dialog ----------

function JobPreviewDialog({
  job, canManage, onViewApplicants, trigger,
}: {
  job: Job
  /** managers/HR see the “View applicants” shortcut in the footer */
  canManage?: boolean
  onViewApplicants?: (job: Job) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job.title}</DialogTitle>
          <DialogDescription>
            {[job.departmentName, job.hiringManagerName && `Hiring manager: ${job.hiringManagerName}`].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={JOB_STATUS_LABELS[job.status] ?? job.status} tone={JOB_STATUS_TONE[job.status] ?? 'outline'} />
          <Badge variant="outline" className="text-xs">{EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType}</Badge>
          <Badge variant="outline" className="text-xs">{WORK_MODE_LABELS[job.workMode] ?? job.workMode}</Badge>
          {job.experienceLevel && <Badge variant="outline" className="text-xs">{EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel}</Badge>}
        </div>
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5"><Coins className="size-4 text-muted-foreground" aria-hidden /> {salaryRange(job)}</span>
            <span className="flex items-center gap-1.5"><MapPin className="size-4 text-muted-foreground" aria-hidden /> {job.location ?? 'Anywhere'}</span>
            <span className="flex items-center gap-1.5"><UsersRound className="size-4 text-muted-foreground" aria-hidden /> {job.openings} opening{job.openings === 1 ? '' : 's'}</span>
            <span className="flex items-center gap-1.5"><CalendarClock className="size-4 text-muted-foreground" aria-hidden /> {job.deadline ? fmtDate(job.deadline) : 'No deadline'}</span>
          </div>
          <Separator />
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
            <p className="whitespace-pre-line leading-relaxed">{job.description}</p>
          </section>
          {job.responsibilities && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsibilities</h3>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{job.responsibilities}</p>
            </section>
          )}
          {job.requirements && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirements</h3>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{job.requirements}</p>
            </section>
          )}
          {csv(job.skills).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {csv(job.skills).map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              </div>
            </section>
          )}
        </div>
        {canManage && onViewApplicants && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onViewApplicants(job)}
              aria-label={`View applicants for ${job.title}`}
            >
              <UsersRound className="size-4" aria-hidden />
              View {job.applicationCount} applicant{job.applicationCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- per-job applicants dialog ----------

function ApplicantsDialog({
  job, open, onOpenChange,
}: {
  job: Job | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { navigate } = useWorkspace()
  // Lazy: only fetch while the dialog is open (payroll payslips pattern).
  const appsData = useData<{ items: Applicant[] }>(
    open && job ? `/api/recruitment/applications?jobId=${job.id}` : null
  )
  const applicants = appsData.data?.items ?? []

  function openInCandidates() {
    if (!job) return
    onOpenChange(false)
    navigate('recruit-candidates', { jobId: job.id })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-base">
            <span className="truncate">Applicants — {job?.title}</span>
            {appsData.data && (
              <Badge variant="secondary" className="tabular-nums">{applicants.length}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>Candidates who applied to this posting.</DialogDescription>
        </DialogHeader>

        {appsData.loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : appsData.error ? (
          <EmptyState icon={CircleAlert} title="Could not load applicants" description={appsData.error} />
        ) : applicants.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No applicants yet"
            description="Share the posting to start collecting applications."
          />
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {applicants.map((a) => {
              const skills = csv(a.skills).slice(0, 3)
              return (
                <li key={a.id} className="rounded-lg border bg-card p-3">
                  <button
                    type="button"
                    onClick={openInCandidates}
                    className="flex w-full items-start gap-3 rounded-md text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    aria-label={`Open ${a.candidateName} in Candidates`}
                  >
                    <UserAvatar name={a.candidateName} avatarUrl={a.user?.avatarUrl ?? null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-bold">{a.candidateName}</p>
                        <StatusBadge
                          label={APPLICATION_STAGE_LABELS[a.stage] ?? a.stage}
                          tone={APPLICATION_STAGE_TONE[a.stage] ?? 'outline'}
                        />
                        {a.rating != null && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Star className="size-3.5" aria-hidden />
                            {a.rating}
                          </span>
                        )}
                        {a.experienceYears != null && (
                          <span className="text-xs text-muted-foreground">· {a.experienceYears} {a.experienceYears === 1 ? 'yr' : 'yrs'}</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.email}{a.phone ? ` · ${a.phone}` : ''} · applied {relativeTime(a.createdAt)}
                      </p>
                      {skills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {skills.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={openInCandidates} disabled={!job}>
            <UserRoundSearch className="size-4" aria-hidden />
            Open in Candidates
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- job create/edit form ----------

function JobFormDialog({
  departments, editing, onSaved, trigger,
}: {
  departments: Department[]
  editing?: Job
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    departmentId: NONE,
    description: '',
    responsibilities: '',
    requirements: '',
    skills: '',
    experienceLevel: NONE,
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    location: '',
    salaryMin: '',
    salaryMax: '',
    deadline: '',
    openings: '1',
    visibility: 'PUBLIC',
  })

  function reset() {
    setForm({
      title: editing?.title ?? '',
      departmentId: editing?.departmentId ?? NONE,
      description: editing?.description ?? '',
      responsibilities: editing?.responsibilities ?? '',
      requirements: editing?.requirements ?? '',
      skills: editing?.skills ?? '',
      experienceLevel: editing?.experienceLevel ?? NONE,
      employmentType: editing?.employmentType ?? 'FULL_TIME',
      workMode: editing?.workMode ?? 'ONSITE',
      location: editing?.location ?? '',
      salaryMin: editing?.salaryMin != null ? String(editing.salaryMin) : '',
      salaryMax: editing?.salaryMax != null ? String(editing.salaryMax) : '',
      deadline: editing?.deadline ? editing.deadline.slice(0, 10) : '',
      openings: String(editing?.openings ?? 1),
      visibility: editing?.visibility ?? 'PUBLIC',
    })
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: 'Missing details', description: 'Title and description are required.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        departmentId: form.departmentId === NONE ? null : form.departmentId,
        responsibilities: form.responsibilities.trim() || null,
        requirements: form.requirements.trim() || null,
        skills: form.skills.trim() || null,
        experienceLevel: form.experienceLevel === NONE ? null : form.experienceLevel,
        employmentType: form.employmentType,
        workMode: form.workMode,
        location: form.location.trim() || null,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        deadline: form.deadline || null,
        openings: Number(form.openings) || 1,
        visibility: form.visibility,
      }
      if (editing) {
        await api(`/api/recruitment/jobs/${editing.id}`, { method: 'PATCH', body: payload })
        toast({ title: 'Job updated', description: `${form.title.trim()} was saved.` })
      } else {
        await api('/api/recruitment/jobs', { method: 'POST', body: payload })
        toast({ title: 'Job posted', description: `${form.title.trim()} is now live.` })
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.title}` : 'Post a job'}</DialogTitle>
          <DialogDescription>{editing ? 'Update the posting details.' : 'Publish a new opening for your organization.'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="job-title">Title *</Label>
            <Input id="job-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Senior Product Designer" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Department</Label>
            <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
              <SelectTrigger className="w-full" aria-label="Job department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No department</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="job-location">Location</Label>
            <Input id="job-location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Dhaka, Bangladesh" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="job-desc">Description *</Label>
            <Textarea id="job-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What the role is about…" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="job-resp">Responsibilities</Label>
            <Textarea id="job-resp" value={form.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} rows={2} placeholder="One per line…" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="job-req">Requirements</Label>
            <Textarea id="job-req" value={form.requirements} onChange={(e) => set('requirements', e.target.value)} rows={2} placeholder="What you expect…" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="job-skills">Skills (comma-separated)</Label>
            <Input id="job-skills" value={form.skills} onChange={(e) => set('skills', e.target.value)} placeholder="React, TypeScript, SQL" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Experience level</Label>
            <Select value={form.experienceLevel} onValueChange={(v) => set('experienceLevel', v)}>
              <SelectTrigger className="w-full" aria-label="Experience level"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any level</SelectItem>
                {EXPERIENCE_LEVELS.map((l) => <SelectItem key={l} value={l}>{EXPERIENCE_LABELS[l]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Employment type</Label>
            <Select value={form.employmentType} onValueChange={(v) => set('employmentType', v)}>
              <SelectTrigger className="w-full" aria-label="Employment type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Work mode</Label>
            <Select value={form.workMode} onValueChange={(v) => set('workMode', v)}>
              <SelectTrigger className="w-full" aria-label="Work mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_MODES.map((w) => <SelectItem key={w} value={w}>{WORK_MODE_LABELS[w]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="job-openings">Openings</Label>
            <Input id="job-openings" type="number" min={1} value={form.openings} onChange={(e) => set('openings', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="job-smin">Salary min (monthly)</Label>
            <Input id="job-smin" type="number" min={0} value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} placeholder="e.g. 40000" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="job-smax">Salary max (monthly)</Label>
            <Input id="job-smax" type="number" min={0} value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} placeholder="e.g. 70000" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="job-deadline">Application deadline</Label>
            <Input id="job-deadline" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Visibility</Label>
            <Select value={form.visibility} onValueChange={(v) => set('visibility', v)}>
              <SelectTrigger className="w-full" aria-label="Visibility"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((v) => <SelectItem key={v} value={v}>{VISIBILITY_LABELS[v]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.title.trim() || !form.description.trim()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Post job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- apply dialog ----------

function ApplyDialog({ job, onApplied }: { job: PublicJob; onApplied: () => void }) {
  const [open, setOpen] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await api('/api/recruitment/applications', {
        method: 'POST',
        body: {
          jobId: job.id,
          coverLetter: coverLetter.trim() || undefined,
          phone: phone.trim() || undefined,
        },
      })
      toast({ title: 'Application submitted', description: `Your application for ${job.title} at ${job.org?.name ?? 'the org'} was sent.` })
      onApplied()
      setOpen(false)
      setCoverLetter('')
      setPhone('')
    } catch {
      // api() toasts (e.g. 400 'Job is not open')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9"><Send className="mr-1.5 size-3.5" aria-hidden /> Apply</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply — {job.title}</DialogTitle>
          <DialogDescription>
            You are applying to <strong>{job.org?.name}</strong>. Your profile name and email will be attached.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{WORK_MODE_LABELS[job.workMode] ?? job.workMode}</Badge>
            <Badge variant="outline">{EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType}</Badge>
            <span>{salaryRange(job)}</span>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="apply-cover">Cover letter</Label>
            <Textarea
              id="apply-cover"
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={5}
              placeholder="Why you, why them…"
              aria-describedby="apply-hint"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="apply-phone">Phone (optional)</Label>
            <Input
              id="apply-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8801…"
              aria-describedby="apply-hint"
            />
            <p id="apply-hint" className="text-xs text-muted-foreground">Your profile name and email are attached automatically. Applications only work while the job is open.</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Submitting…' : 'Submit application'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
