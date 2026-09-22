import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, withAuth, requireOrg } from '@/lib/server/api'

// ---------- T4-c: global search ----------
// GET /api/search?q= — requireOrg only (no single module guard; results are
// filtered per-type by the caller's module access). q trimmed; < 2 chars → no queries.
// Matching: case-insensitive contains (SQLite LIKE is ASCII-case-insensitive via Prisma
// `contains`), max 4 per type, max 24 total, concatenated per type in a fixed order.
// Assignment scoping: with projects access < FULL, tasks/documents/projects are limited
// to projects the caller manages or is a ProjectMember of (documents-route pattern).

const PER_TYPE = 4
const TOTAL_CAP = 24

type ResultType = 'project' | 'task' | 'member' | 'document' | 'job' | 'deal' | 'lead' | 'contact' | 'meeting'

interface SearchItem {
  type: ResultType
  id: string
  title: string
  subtitle: string
  module: string
  params?: Record<string, string>
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { membership, org } = requireOrg(ctx)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return ok({ results: [] })

  // per-type module access: FULL or VIEW (unknown/missing key → HIDDEN, fail-closed); OWNER is always FULL
  const level = (module: string): string =>
    membership.role === 'OWNER' ? 'FULL' : (ctx.access[module] ?? 'HIDDEN')
  const searchable = (module: string): boolean => {
    const l = level(module)
    return l === 'FULL' || l === 'VIEW'
  }
  const projectsFull = level('projects') === 'FULL'

  // projects the caller manages or is a member of (needed when projects access < FULL)
  const myProjectIds = projectsFull
    ? []
    : (
        await db.project.findMany({
          where: {
            orgId: org.id,
            OR: [
              { managerMembershipId: membership.id },
              { projectMembers: { some: { membershipId: membership.id } } },
            ],
          },
          select: { id: true },
        })
      ).map((p) => p.id)

  const contains = { contains: q }
  const results: SearchItem[] = []

  // projects (deep-link: navigate('projects', { projectId }))
  if (searchable('projects')) {
    const where: Prisma.ProjectWhereInput = {
      orgId: org.id,
      name: contains,
      ...(projectsFull ? {} : { id: { in: myProjectIds } }),
    }
    const rows = await db.project.findMany({
      where,
      select: { id: true, name: true, status: true },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'project' as const,
        id: r.id,
        title: r.name,
        subtitle: r.status,
        module: 'projects',
        params: { projectId: r.id },
      }))
    )
  }

  // tasks (my-tasks-view reads no deep-link param — subtitle carries the project name)
  if (searchable('tasks')) {
    const where: Prisma.TaskWhereInput = {
      orgId: org.id,
      title: contains,
      ...(projectsFull ? {} : { projectId: { in: myProjectIds } }),
    }
    const rows = await db.task.findMany({
      where,
      select: { id: true, title: true, project: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'task' as const,
        id: r.id,
        title: r.title,
        subtitle: r.project?.name ?? 'No project',
        module: 'my-tasks',
      }))
    )
  }

  // members (hr-employees-view reads no deep-link param)
  if (searchable('hr-employees')) {
    const rows = await db.membership.findMany({
      where: {
        orgId: org.id,
        OR: [{ user: { name: contains } }, { user: { email: contains } }],
      },
      select: { id: true, role: true, title: true, user: { select: { id: true, name: true } } },
      take: PER_TYPE,
      orderBy: { joinedAt: 'asc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'member' as const,
        id: r.id,
        title: r.user.name,
        subtitle: [r.title, r.role].filter(Boolean).join(' · '),
        module: 'hr-employees',
      }))
    )
  }

  // documents (same assignment scoping as GET /api/documents)
  if (searchable('documents')) {
    const docsFull = level('documents') === 'FULL'
    const where: Prisma.DocumentWhereInput = {
      orgId: org.id,
      name: contains,
      ...(docsFull
        ? {}
        : {
            OR: [
              { projectId: null },
              { projectId: { in: myProjectIds } },
            ],
          }),
    }
    const rows = await db.document.findMany({
      where,
      select: { id: true, name: true, folder: true },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'document' as const,
        id: r.id,
        title: r.name,
        subtitle: r.folder,
        module: 'documents',
      }))
    )
  }

  // jobs (recruit-jobs-view reads no deep-link param; jobId exposed for future wiring)
  if (searchable('recruit-jobs')) {
    const rows = await db.job.findMany({
      where: { orgId: org.id, title: contains },
      select: { id: true, title: true, status: true, department: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'job' as const,
        id: r.id,
        title: r.title,
        subtitle: [r.department?.name, r.status].filter(Boolean).join(' · '),
        module: 'recruit-jobs',
        params: { jobId: r.id },
      }))
    )
  }

  // deals
  if (searchable('crm-deals')) {
    const rows = await db.deal.findMany({
      where: { orgId: org.id, name: contains },
      select: { id: true, name: true, company: { select: { name: true } }, stage: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'deal' as const,
        id: r.id,
        title: r.name,
        subtitle: [r.company?.name, r.stage.name].filter(Boolean).join(' · '),
        module: 'crm-deals',
      }))
    )
  }

  // leads
  if (searchable('crm-leads')) {
    const rows = await db.lead.findMany({
      where: { orgId: org.id, name: contains },
      select: { id: true, name: true, company: true, status: true },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'lead' as const,
        id: r.id,
        title: r.name,
        subtitle: [r.company, r.status].filter(Boolean).join(' · '),
        module: 'crm-leads',
      }))
    )
  }

  // contacts
  if (searchable('crm-contacts')) {
    const rows = await db.contact.findMany({
      where: { orgId: org.id, name: contains },
      select: { id: true, name: true, position: true, company: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'contact' as const,
        id: r.id,
        title: r.name,
        subtitle: r.company?.name ?? r.position ?? '—',
        module: 'crm-contacts',
      }))
    )
  }

  // meetings
  if (searchable('meetings')) {
    const rows = await db.meeting.findMany({
      where: { orgId: org.id, title: contains },
      select: { id: true, title: true, startsAt: true },
      take: PER_TYPE,
      orderBy: { startsAt: 'desc' },
    })
    results.push(
      ...rows.map((r) => ({
        type: 'meeting' as const,
        id: r.id,
        title: r.title,
        subtitle: r.startsAt.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
        module: 'meetings',
      }))
    )
  }

  return ok({ results: results.slice(0, TOTAL_CAP) })
})
