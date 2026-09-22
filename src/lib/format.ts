/** Shared formatting + status vocabulary for OrgOS (client & server safe). */

// ---------- money ----------

const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', AED: 'د.إ', SGD: 'S$',
}

export function currencySymbol(currency = 'BDT'): string {
  return CURRENCY_SYMBOLS[currency] ?? currency + ' '
}

export function money(n: number | null | undefined, currency = 'BDT', compact = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const sym = currencySymbol(currency)
  const abs = Math.abs(n)
  if (compact && abs >= 100000) return `${n < 0 ? '-' : ''}${sym}${(abs / 100000).toFixed(abs >= 1000000 ? 0 : 1)}L`
  if (compact && abs >= 1000) return `${n < 0 ? '-' : ''}${sym}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`
  return `${n < 0 ? '-' : ''}${sym}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// ---------- dates ----------

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = date.getTime() - Date.now() // positive = future
  const future = diff > 0
  const mins = Math.floor(Math.abs(diff) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`
  return fmtDate(date)
}

export function dueLabel(d: string | Date | null | undefined): { text: string; overdue: boolean } {
  if (!d) return { text: 'No due date', overdue: false }
  const date = typeof d === 'string' ? new Date(d) : d
  const today = new Date()
  const overdue = date.getTime() < today.getTime() - 24 * 60 * 60 * 1000
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)
  let text: string
  if (diffDays === 0) text = 'Today'
  else if (diffDays === 1) text = 'Tomorrow'
  else if (diffDays === -1) text = 'Yesterday'
  else if (diffDays < 0) text = `${Math.abs(diffDays)}d overdue`
  else if (diffDays < 7) text = `in ${diffDays}d`
  else text = fmtDate(date)
  return { text, overdue: overdue || diffDays < 0 }
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function minutesToHours(m: number | null | undefined): string {
  if (!m && m !== 0) return '—'
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? `${h}h ${mm ? mm + 'm' : ''}`.trim() : `${mm}m`
}

// ---------- shared vocabulary (labels) ----------

export const TASK_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const
export const TASK_STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'In Review', DONE: 'Done',
}
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export const PRIORITY_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' }

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planning', ACTIVE: 'Active', ON_HOLD: 'On Hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled', ARCHIVED: 'Archived',
}

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'] as const
export const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', UNQUALIFIED: 'Unqualified', CONVERTED: 'Converted',
}

export const DEAL_STATUSES = ['OPEN', 'WON', 'LOST'] as const
export const DEAL_STATUS_LABELS: Record<string, string> = { OPEN: 'Open', WON: 'Won', LOST: 'Lost' }

export const APPLICATION_STAGES = ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED'] as const
export const APPLICATION_STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied', SCREENING: 'Screening', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interview', ASSESSMENT: 'Assessment', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
}

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const
export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', VIEWED: 'Viewed', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled',
}

export const EXPENSE_STATUSES = ['SUBMITTED', 'MANAGER_APPROVED', 'FINANCE_APPROVED', 'PAID', 'REJECTED'] as const
export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted', MANAGER_APPROVED: 'Manager Approved', FINANCE_APPROVED: 'Finance Approved', PAID: 'Paid', REJECTED: 'Rejected',
}

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
export const LEAVE_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' }

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY'] as const
export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Present', LATE: 'Late', HALF_DAY: 'Half Day', ABSENT: 'Absent', LEAVE: 'On Leave', HOLIDAY: 'Holiday',
}

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'HR', 'FINANCE', 'EMPLOYEE', 'CONTRACTOR', 'INTERN'] as const
export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner', ADMIN: 'Administrator', MANAGER: 'Manager', HR: 'HR', FINANCE: 'Finance', EMPLOYEE: 'Employee', CONTRACTOR: 'Contractor', INTERN: 'Intern',
}

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERN', 'TEMPORARY', 'VOLUNTEER'] as const
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', FREELANCE: 'Freelance', INTERN: 'Intern', TEMPORARY: 'Temporary', VOLUNTEER: 'Volunteer',
}

export const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'AD', 'OUTREACH', 'EVENT', 'IMPORT', 'MANUAL'] as const
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  WEBSITE: 'Website', REFERRAL: 'Referral', SOCIAL: 'Social Media', AD: 'Advertisement', OUTREACH: 'Cold Outreach', EVENT: 'Event', IMPORT: 'Import', MANUAL: 'Manual',
}

export const EXPENSE_CATEGORIES = ['GENERAL', 'TRAVEL', 'MEALS', 'SOFTWARE', 'EQUIPMENT', 'MARKETING', 'OFFICE', 'TRAINING'] as const
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'General', TRAVEL: 'Travel', MEALS: 'Meals', SOFTWARE: 'Software', EQUIPMENT: 'Equipment', MARKETING: 'Marketing', OFFICE: 'Office', TRAINING: 'Training',
}

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const
export const WORK_MODE_LABELS: Record<string, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site' }

export const DEPARTMENT_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#14b8a6', '#8b5cf6', '#ec4899', '#84cc16']

// ---------- badge tone mapping (consistent across all views) ----------

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'muted'

export const TASK_STATUS_TONE: Record<string, BadgeTone> = {
  BACKLOG: 'muted', TODO: 'outline', IN_PROGRESS: 'info', REVIEW: 'warning', DONE: 'success',
}
export const PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: 'muted', MEDIUM: 'outline', HIGH: 'warning', URGENT: 'destructive',
}
export const PROJECT_STATUS_TONE: Record<string, BadgeTone> = {
  PLANNING: 'outline', ACTIVE: 'info', ON_HOLD: 'warning', COMPLETED: 'success', CANCELLED: 'destructive', ARCHIVED: 'muted',
}
export const LEAD_STATUS_TONE: Record<string, BadgeTone> = {
  NEW: 'info', CONTACTED: 'outline', QUALIFIED: 'warning', UNQUALIFIED: 'muted', CONVERTED: 'success',
}
export const DEAL_STATUS_TONE: Record<string, BadgeTone> = { OPEN: 'info', WON: 'success', LOST: 'destructive' }
export const APPLICATION_STAGE_TONE: Record<string, BadgeTone> = {
  APPLIED: 'outline', SCREENING: 'info', SHORTLISTED: 'info', INTERVIEW: 'warning', ASSESSMENT: 'warning', OFFER: 'success', HIRED: 'success', REJECTED: 'destructive',
}
export const INVOICE_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: 'muted', SENT: 'outline', VIEWED: 'outline', PARTIALLY_PAID: 'warning', PAID: 'success', OVERDUE: 'destructive', CANCELLED: 'destructive',
}
export const EXPENSE_STATUS_TONE: Record<string, BadgeTone> = {
  SUBMITTED: 'outline', MANAGER_APPROVED: 'info', FINANCE_APPROVED: 'info', PAID: 'success', REJECTED: 'destructive',
}
export const LEAVE_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'destructive', CANCELLED: 'muted',
}
export const ATTENDANCE_STATUS_TONE: Record<string, BadgeTone> = {
  PRESENT: 'success', LATE: 'warning', HALF_DAY: 'warning', ABSENT: 'destructive', LEAVE: 'info', HOLIDAY: 'muted',
}
export const ROLE_TONE: Record<string, BadgeTone> = {
  OWNER: 'success', ADMIN: 'info', MANAGER: 'info', HR: 'warning', FINANCE: 'warning', EMPLOYEE: 'outline', CONTRACTOR: 'muted', INTERN: 'muted',
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export function csv(s: string | null | undefined): string[] {
  return (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
}
