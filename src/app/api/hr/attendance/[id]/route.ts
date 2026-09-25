import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, requireRole, logActivity, audit } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'

// DELETE /api/hr/attendance/[id] — remove an attendance row created in error (OWNER/ADMIN/HR).
// H5 fix: previously there was no [id] route at all, so HR could not delete bad attendance rows.
// M24-db fix changed AttendanceSession.attendanceId onDelete to Restrict (protects time-tracking
// history), so we must explicitly cascade-delete sessions + their task entries in a transaction.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, ctx) => {
    const { org, membership: actor } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'hr-attendance', 'full')
    if (denied) return denied
    requireRole(ctx, ['ADMIN', 'HR'])

    const target = await db.attendance.findFirst({
      where: { id, orgId: org.id },
      include: { membership: { select: { user: { select: { name: true } } } }, _count: { select: { sessions: true } } },
    })
    if (!target) return fail('Attendance record not found', 404)

    // MA-1 #4 fix: cascade-delete sessions + their task entries before deleting the parent row
    await db.$transaction(async (tx) => {
      const sessions = await tx.attendanceSession.findMany({
        where: { attendanceId: target.id },
        select: { id: true },
      })
      if (sessions.length) {
        await tx.sessionTaskEntry.deleteMany({
          where: { sessionId: { in: sessions.map((s) => s.id) } },
        })
        await tx.attendanceSession.deleteMany({
          where: { attendanceId: target.id },
        })
      }
      await tx.attendance.delete({ where: { id: target.id } })
    })

    await audit({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'attendance.deleted',
      entity: 'Attendance',
      entityId: target.id,
      oldValues: { date: target.date, status: target.status, membershipId: target.membershipId },
      impersonatedBy: ctx.session?.impersonatedBy?.id ?? null,
    })
    await logActivity({
      orgId: org.id,
      actorMembershipId: actor.id,
      action: 'attendance.deleted',
      entityType: 'ATTENDANCE',
      entityId: target.id,
      message: `${ctx.user.name} deleted an attendance record for ${target.membership.user.name} on ${target.date}`,
    })

    return ok({ deleted: true })
  })(req)
}
