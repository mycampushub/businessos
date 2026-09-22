'use client'

/**
 * Shared candidate/application detail pieces for the recruitment module.
 * Used by both the Candidates pipeline view (recruit-candidates-view) and the
 * Jobs view (recruit-jobs-view) so applicants can be inspected with their full
 * application from either place.
 */

import { useState } from 'react'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { APPLICATION_STAGE_LABELS, APPLICATION_STAGE_TONE, relativeTime, csv } from '@/lib/format'
import { Briefcase, FileText, Handshake, Mail, Phone, Star, XCircle } from 'lucide-react'

// ---------- shared types ----------

export interface Application {
  id: string
  jobId: string
  candidateName: string
  email: string
  phone: string | null
  resumeUrl: string | null
  coverLetter: string | null
  skills: string | null
  experienceYears: number | null
  stage: string
  rating: number | null
  notes: string | null
  source: string
  createdAt: string
  decidedAt: string | null
  jobTitle: string
  user: { id: string; name: string; avatarUrl: string | null } | null
}

// ---------- star rating ----------

export function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return null
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rated ${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('size-3.5', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} aria-hidden />
      ))}
    </span>
  )
}

// ---------- application detail dialog ----------

export function ApplicationDetailDialog({
  application, canManage, stageList, acting, onClose, onMove, onTerminal,
}: {
  application: Application | null
  canManage: boolean
  stageList: string[]
  acting: boolean
  onClose: () => void
  onMove: (a: Application, stage: string) => Promise<void>
  onTerminal: (a: Application, action: 'hire' | 'reject') => Promise<void>
}) {
  const [hireOpen, setHireOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const open = !!application

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setHireOpen(false); setRejectOpen(false) } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {application && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <UserAvatar name={application.candidateName} avatarUrl={application.user?.avatarUrl ?? null} size="lg" />
                  <div className="min-w-0">
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                      <span className="truncate">{application.candidateName}</span>
                      {application.user && <Badge variant="secondary" className="text-[10px]">Platform user</Badge>}
                    </DialogTitle>
                    <DialogDescription className="truncate">
                      Applied for <strong className="font-medium">{application.jobTitle}</strong> · {relativeTime(application.createdAt)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={APPLICATION_STAGE_LABELS[application.stage] ?? application.stage} tone={APPLICATION_STAGE_TONE[application.stage] ?? 'outline'} />
                <StarRating rating={application.rating} />
                {application.experienceYears != null && <Badge variant="outline" className="text-xs">{application.experienceYears} year{application.experienceYears === 1 ? '' : 's'} experience</Badge>}
                <Badge variant="outline" className="text-xs">via {application.source.toLowerCase()}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2 truncate"><Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {application.email}</div>
                <div className="flex items-center gap-2 truncate"><Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {application.phone ?? '—'}</div>
                <div className="flex items-center gap-2 truncate"><Briefcase className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {application.jobTitle}</div>
                {application.resumeUrl && (
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <a
                      href={application.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                      aria-label={`Open resume of ${application.candidateName} in a new tab`}
                    >
                      Resume
                    </a>
                  </div>
                )}
              </div>

              {csv(application.skills).length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {csv(application.skills).map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                  </div>
                </div>
              )}

              {application.coverLetter && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cover letter</h3>
                  <p className="whitespace-pre-line rounded-lg bg-muted/30 p-4 text-sm leading-relaxed">{application.coverLetter}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</h3>
                <p className={cn('rounded-lg border border-dashed p-4 text-sm', application.notes ? 'leading-relaxed' : 'text-muted-foreground')}>
                  {application.notes ?? 'No internal notes yet.'}
                </p>
                <p className="text-[11px] text-muted-foreground">Notes are read-only in this view and captured during intake.</p>
              </div>

              <Separator />

              {canManage ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Move to stage</Label>
                    <Select
                      value={application.stage}
                      onValueChange={(v) => { void onMove(application, v) }}
                      disabled={acting}
                    >
                      <SelectTrigger className="w-full" aria-label="Move candidate to stage"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stageList.map((s) => (
                          <SelectItem key={s} value={s} disabled={s === application.stage}>
                            {APPLICATION_STAGE_LABELS[s] ?? s}{s === application.stage ? ' (current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {application.stage !== 'HIRED' && application.stage !== 'REJECTED' && (
                    <DialogFooter className="gap-2">
                      <AlertDialog open={hireOpen} onOpenChange={setHireOpen}>
                        <AlertDialogTrigger asChild>
                          <Button className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={acting}>
                            <Handshake className="mr-1.5 size-4" aria-hidden /> Hire
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Hire {application.candidateName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {application.candidateName} moves to Hired for {application.jobTitle} and an employee
                              record is created (account + membership, on probation). Managers are notified and the
                              candidate is informed. If they don&apos;t have an account yet, one is created with a
                              temporary password you can share.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-emerald-700 text-white hover:bg-emerald-800"
                              onClick={() => { void onTerminal(application, 'hire') }}
                            >
                              Confirm hire
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        disabled={acting}
                        onClick={() => setRejectOpen(true)}
                      >
                        <XCircle className="mr-1.5 size-4" aria-hidden /> Reject
                      </Button>
                      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reject {application.candidateName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The candidate moves to Rejected for {application.jobTitle}. This ends their pipeline run — managers are notified.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => { void onTerminal(application, 'reject') }}
                            >
                              Confirm reject
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DialogFooter>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Pipeline actions are limited to owners, admins, managers and HR.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
