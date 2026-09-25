import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, withAuth, requireOrg, body, str, oneOf, logActivity, audit } from '@/lib/server/api'
import { requireAccess } from '@/lib/server/access'
import { money, salariesInclude, salaryItem } from '../../payroll-helpers'
import { toCents } from '@/lib/server/money'

// PATCH /api/finance/payroll/salaries/[membershipId] - baseSalary and/or full component set, finance-payroll FULL
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params
  return withAuth(async (_req, ctx) => {
    const { membership, org } = requireOrg(ctx)
    const denied = requireAccess(ctx, 'finance-payroll', 'full')
    if (denied) return denied

    const target = await db.membership.findFirst({
      where: { id: membershipId, orgId: org.id },
      include: salariesInclude,
    })
    if (!target) return fail('Member not found', 404)

    const b = await body(req)

    // C7 fix: baseSalary + components[].amount arrive as dollars (floats) from the
    // client → convert to cents (Int) before writing to the DB.
    let baseSalary: number | null | undefined
    if (b.baseSalary !== undefined) {
      if (b.baseSalary === null) {
        baseSalary = null
      } else if (typeof b.baseSalary === 'number' && Number.isFinite(b.baseSalary) && b.baseSalary >= 0) {
        baseSalary = toCents(b.baseSalary)
      } else {
        return fail('baseSalary must be a number of at least 0 (or null to clear)', 422)
      }
    }

    let components: Array<{ label: string; kind: string; amount: number }> | undefined
    if (b.components !== undefined) {
      if (!Array.isArray(b.components)) return fail('components must be an array', 422)
      components = []
      for (const raw of b.components as unknown[]) {
        const it = raw as Record<string, unknown>
        const label = str(it.label, 'components[].label', { max: 100 })
        const kind = oneOf(it.kind, ['ALLOWANCE', 'DEDUCTION'] as const)
        const amount = it.amount
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
          return fail('components[].amount must be a number of at least 0', 422)
        }
        components.push({ label, kind, amount: toCents(amount)! })
      }
    }

    if (baseSalary === undefined && components === undefined) return fail('Nothing to update', 422)

    const updated = await db.$transaction(async (tx) => {
      if (baseSalary !== undefined) {
        await tx.membership.update({ where: { id: target.id }, data: { baseSalary } })
      }
      if (components !== undefined) {
        await tx.salaryComponent.deleteMany({ where: { membershipId: target.id } })
        if (components.length) {
          await tx.salaryComponent.createMany({
            data: components.map((c) => ({ orgId: org.id, membershipId: target.id, ...c })),
          })
        }
      }
      return tx.membership.findUnique({ where: { id: target.id }, include: salariesInclude })
    })

    await audit({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'salary.updated',
      entity: 'MEMBERSHIP',
      entityId: target.id,
      oldValues: { baseSalary: target.baseSalary, componentsCount: target.salaryComponents.length },
      newValues: { baseSalary: updated?.baseSalary ?? null, componentsCount: updated?.salaryComponents.length ?? 0 },
      impersonatedBy: ctx.session?.impersonatedBy?.id ?? null, // MA-1 #8 fix
    })
    await logActivity({
      orgId: org.id,
      actorMembershipId: membership.id,
      action: 'salary.updated',
      entityType: 'MEMBERSHIP',
      entityId: target.id,
      message: 'Salary for ' + target.user.name + ' updated - base ' + money(updated?.baseSalary ?? 0),
    })

    return ok(updated ? salaryItem(updated) : null)
  })(req)
}
