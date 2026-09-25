import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str } from '@/lib/server/api'
import { requirePlatform, platformAudit } from '../guard'
import { notifyUsers } from '@/lib/server/api'
import { checkRate } from '@/lib/server/rate-limit'

// POST /api/platform/broadcast — platform-wide operational announcement.
// Creates a pinned Announcement in every ACTIVE org (author = null → "OrgOS Platform")
// and notifies each org's members (owners + admins get it in every org they manage;
// members get it once per org). Audit-logged per org.
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const denied = requirePlatform(ctx)
  if (denied) return denied

  // M24 fix: rate-limit broadcasts to 1 per 10 minutes per platform admin. A single
  // broadcast fans out to N orgs × M members (notifications) + N announcements — an
  // accidental double-click or a runaway script would create thousands of rows.
  const rl = checkRate(`broadcast:${ctx.user.id}`, 1, 10 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many broadcasts. Please wait before sending another.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const b = await body<Record<string, unknown>>(req)
  const title = str(b.title, 'title', { max: 160 }).trim()
  const message = str(b.body, 'body', { max: 2000 }).trim()
  if (!title) return fail('Title is required', 422)
  if (!message) return fail('Message is required', 422)

  const orgs = await db.organization.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, ownerId: true },
  })
  if (!orgs.length) return fail('No active organizations to broadcast to', 422)

  await db.$transaction(async (tx) => {
    await tx.announcement.createMany({
      data: orgs.map((o) => ({
        orgId: o.id,
        authorMembershipId: null, // platform-authored
        title,
        body: message,
        pinned: true,
      })),
    })
  })

  for (const o of orgs) {
    const memberUserIds = await db.membership.findMany({
      where: { orgId: o.id, status: 'ACTIVE' },
      select: { userId: true },
    })
    await notifyUsers({
      orgId: o.id,
      userIds: memberUserIds.map((m) => m.userId),
      type: 'SYSTEM',
      title: `Platform announcement: ${title}`,
      body: message.slice(0, 280),
      module: 'announcements',
    })
    await platformAudit({
      orgId: o.id,
      action: 'platform.broadcast_sent',
      entity: 'Announcement',
      newValues: { title, by: ctx.user.name, recipients: memberUserIds.length },
    })
  }

  return ok({ sentTo: orgs.length, title })
})
