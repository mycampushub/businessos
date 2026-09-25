/**
 * Zod schemas for OrgOS create/edit forms.
 *
 * These mirror the *form state* of each form (string-based values coming
 * straight from `<Input>` / `<Textarea>` / `<Select>` controls — not the
 * coerced number/boolean payload that ultimately gets POSTed to the API).
 * This lets a view call `validate(schema, form)` directly against its
 * existing `useState` shape without rewriting the form in react-hook-form.
 *
 * Field names line up 1-to-1 with the form keys used by the views, so the
 * per-field error returned by `useFormErrors` can be looked up by the same
 * key the view uses to read/write the field.
 *
 * Reusable for any form that posts to the corresponding API route.
 */

import { z } from 'zod'
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  DEAL_STATUSES,
  EXPENSE_CATEGORIES,
  EMPLOYMENT_TYPES,
  WORK_MODES,
} from '@/lib/format'

// ---------- shared building blocks -----------------------------------------

/** Plain-string field that must either be empty or parse to a non-negative number. */
const optionalNonNegNumberStr = (msg = 'Must be 0 or greater') =>
  z.string().refine(
    (v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    { error: msg },
  )

/** Plain-string field that must parse to a non-negative number (no empty allowed). */
const requiredNonNegNumberStr = (msg = 'Must be 0 or greater') =>
  z.string().refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0,
    { error: msg },
  )

/** Plain-string field that must parse to a positive number (> 0). */
const requiredPositiveNumberStr = (msg = 'Must be greater than 0') =>
  z.string().refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0,
    { error: msg },
  )

/** Plain-string field that must be empty or a valid ISO date (yyyy-mm-dd). */
const optionalDateStr = (msg = 'Enter a valid date') =>
  z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), { error: msg })

/** Plain-string field that must be a valid ISO date (no empty allowed). */
const requiredDateStr = (msg = 'Date is required') =>
  z.string()
    .min(1, { error: msg })
    .refine((v) => !Number.isNaN(Date.parse(v)), { error: 'Enter a valid date' })

/** Loosely matches an email (the form makes this field optional, so empty is OK). */
const optionalEmailStr = (msg = 'Enter a valid email') =>
  z
    .string()
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { error: msg })

// ---------- enums ----------------------------------------------------------
// The recruitment module uses these sentinels for "no selection" in <Select>.

export const JOB_NONE = '__none__' as const

export const EXPERIENCE_LEVELS = ['ENTRY', 'MID', 'SENIOR', 'LEAD'] as const
export const JOB_VISIBILITIES = ['PUBLIC', 'PLATFORM', 'PRIVATE'] as const

// ---------- lead schema ----------------------------------------------------
// Matches `LeadForm` in src/components/views/crm-leads-view.tsx.
// {
//   name, company, email, phone, source, value: string, notes
// }

export const leadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(120, { error: 'Name must be 120 characters or fewer' }),
  company: z.string().max(200, { error: 'Company name is too long' }),
  email: optionalEmailStr(),
  phone: z.string().max(50, { error: 'Phone is too long' }),
  source: z.enum(LEAD_SOURCES, { error: 'Select a source' }),
  value: optionalNonNegNumberStr('Value must be 0 or greater'),
  notes: z.string().max(2000, { error: 'Notes are too long' }),
  // `status` is set via the row dropdown, not the form — included so the
  // schema can be reused for the PATCH /status path if needed.
  status: z.enum(LEAD_STATUSES, { error: 'Invalid status' }).optional(),
})
export type LeadSchemaValues = z.infer<typeof leadSchema>

// ---------- deal schema ----------------------------------------------------
// Matches the deal create/edit form shape (string-based values).

export const dealSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(120, { error: 'Name must be 120 characters or fewer' }),
  value: requiredNonNegNumberStr('Value must be 0 or greater'),
  stageId: z.string().min(1, { error: 'Select a stage' }),
  probability: z.string().refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100,
    { error: 'Probability must be 0–100' },
  ),
  status: z.enum(DEAL_STATUSES, { error: 'Invalid status' }),
  expectedCloseDate: optionalDateStr(),
})
export type DealSchemaValues = z.infer<typeof dealSchema>

// ---------- invoice schema -------------------------------------------------
// Matches `InvoiceForm` in src/components/views/finance-invoices-view.tsx.
// {
//   clientId, number, issueDate, dueDate,
//   items: { description, qty, rate }[],  // string values
//   taxRate, discount, notes
// }

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, { error: 'Description is required' }),
  qty: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, {
    error: 'Qty must be greater than 0',
  }),
  rate: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, {
    error: 'Rate must be 0 or greater',
  }),
})
export type InvoiceItemSchemaValues = z.infer<typeof invoiceItemSchema>

export const invoiceSchema = z
  .object({
    clientId: z.string().min(1, { error: 'Select a client' }),
    number: z
      .string()
      .trim()
      .min(1, { error: 'Invoice number is required' })
      .max(50, { error: 'Invoice number is too long' }),
    issueDate: requiredDateStr('Issue date is required'),
    dueDate: requiredDateStr('Due date is required'),
    items: z.array(invoiceItemSchema).min(1, { error: 'Add at least one line item' }),
    taxRate: z.string().refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100,
      { error: 'Tax rate must be 0–100' },
    ),
    discount: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, {
      error: 'Discount must be 0 or greater',
    }),
    notes: z.string().max(2000, { error: 'Notes are too long' }),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    error: 'Due date must be on or after the issue date',
    path: ['dueDate'],
  })
export type InvoiceSchemaValues = z.infer<typeof invoiceSchema>

// ---------- expense schema -------------------------------------------------
// Matches `ExpenseForm` in src/components/views/finance-expenses-view.tsx.
// {
//   title, amount, category, date, ...string fields
// }

export const expenseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: 'Title is required' })
    .max(120, { error: 'Title must be 120 characters or fewer' }),
  amount: requiredPositiveNumberStr('Amount must be greater than 0'),
  category: z.enum(EXPENSE_CATEGORIES, { error: 'Select a category' }),
  date: requiredDateStr('Date is required'),
})
export type ExpenseSchemaValues = z.infer<typeof expenseSchema>

// ---------- job schema -----------------------------------------------------
// Matches the form state inside `JobFormDialog` in
// src/components/views/recruit-jobs-view.tsx. The form uses the `__none__`
// sentinel for "no department" / "any experience level", and stores numeric
// fields (salaryMin/Max, openings) as strings to match `<Input type="number">`.

export const jobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { error: 'Title is required' })
      .max(120, { error: 'Title must be 120 characters or fewer' }),
    description: z.string().trim().min(1, { error: 'Description is required' }),
    departmentId: z.string(),
    experienceLevel: z.union([z.literal(JOB_NONE), z.enum(EXPERIENCE_LEVELS)]),
    employmentType: z.enum(EMPLOYMENT_TYPES, { error: 'Select an employment type' }),
    workMode: z.enum(WORK_MODES, { error: 'Select a work mode' }),
    salaryMin: optionalNonNegNumberStr('Salary min must be 0 or greater'),
    salaryMax: optionalNonNegNumberStr('Salary max must be 0 or greater'),
    openings: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 1, {
      error: 'Openings must be at least 1',
    }),
    visibility: z.enum(JOB_VISIBILITIES, { error: 'Select a visibility' }),
  })
  .refine(
    (data) =>
      data.salaryMin === '' ||
      data.salaryMax === '' ||
      Number(data.salaryMax) >= Number(data.salaryMin),
    {
      error: 'Salary max must be greater than or equal to salary min',
      path: ['salaryMax'],
    },
  )
export type JobSchemaValues = z.infer<typeof jobSchema>

// ---------- policy schema --------------------------------------------------
// Matches the attendance-policy form in src/components/views/settings-view.tsx.
// All numeric fields are stored as strings to match the form inputs.

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

export const policySchema = z
  .object({
    checkInTime: z.string().regex(HH_MM, { error: 'Use HH:MM format' }),
    checkOutTime: z.string().regex(HH_MM, { error: 'Use HH:MM format' }),
    lateGraceMins: z.string().refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 240,
      { error: 'Late grace must be 0–240 minutes' },
    ),
    halfDayMins: z.string().refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) >= 30 && Number(v) <= 900,
      { error: 'Half-day minutes must be 30–900' },
    ),
    fullDayMins: z.string().refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) >= 30 && Number(v) <= 900,
      { error: 'Full-day minutes must be 30–900' },
    ),
    payrollDay: z.string().refine(
      (v) => {
        const n = Number(v)
        return !Number.isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 28
      },
      { error: 'Payroll day must be 1–28' },
    ),
    workDays: z.string().min(1, { error: 'Pick at least one work day' }),
  })
  .refine((data) => Number(data.fullDayMins) > Number(data.halfDayMins), {
    error: 'Full-day minutes must be greater than half-day minutes',
    path: ['fullDayMins'],
  })
export type PolicySchemaValues = z.infer<typeof policySchema>
