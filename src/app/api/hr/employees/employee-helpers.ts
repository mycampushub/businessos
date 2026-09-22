import { hasAnyRole } from '@/lib/roles'

/**
 * Directory PII masking (not a route file — plain module, see roles.ts:31
 * "directory is visible to everyone; PII stripped server-side for non-people roles").
 * Roles in PII_ROLES see full contact details; everyone else (FINANCE, EMPLOYEE,
 * CONTRACTOR, INTERN, …) gets masked email/phone — names, titles, departments and
 * avatars stay visible.
 */
export const PII_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR'] as const

export function canSeeEmployeePii(role: string | null | undefined): boolean {
  return hasAnyRole(role, PII_ROLES)
}

/** keep the first char of the local part + the domain: 'j***@acme.com' */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return `${email.slice(0, 1)}***`
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`
}

/** keep only the last 4 digits: '•••• 1234' */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `•••• ${digits.slice(-4)}`.trim()
}
