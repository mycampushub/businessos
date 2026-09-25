'use client'

/**
 * useFormErrors — lightweight per-field error overlay for useState-based forms.
 *
 * OrgOS forms are intentionally *not* rewritten with react-hook-form (which
 * would be a large refactor and a regression risk). Instead, each form keeps
 * its existing `useState` shape and this hook provides a thin validation
 * layer on top:
 *
 *   1. The submit handler calls `validate(schema, form)` before `api()`.
 *   2. On failure, the schema's `error.issues` are reduced to a flat
 *      `{ [fieldKey]: firstErrorMessage }` map.
 *   3. Each input renders `{errors.fieldKey && <p role="alert">…</p>}` and
 *      binds `aria-invalid` / `aria-describedby`.
 *   4. The form clears a field's error as soon as the user edits it
 *      (`clearError('fieldKey')` in the onChange) — same UX as RHF.
 *
 * The hook is intentionally generic — it works with any zod schema and any
 * form shape, so it can be rolled out to the remaining forms one at a time.
 */

import { useCallback, useState } from 'react'
import type { z } from 'zod'

type FieldErrors = Record<string, string>

export interface UseFormErrorsResult {
  /** Map of `formKey -> first error message` for the last validate() call. */
  errors: FieldErrors
  /**
   * Run a zod schema against `data`. On success, clears all errors and
   * returns `true`. On failure, populates `errors` with the first message
   * for each top-level field key (issues with no path are stored under
   * `'_form'`) and returns `false`.
   *
   * The schema and data are typed independently so the caller can pass a
   * schema whose inferred type is narrower than the form's runtime type
   * (e.g. the form stores `string` while the schema declares `z.enum(...)`)
   * — zod's `safeParse` accepts `unknown` so the runtime check still runs.
   */
  validate: <S extends z.ZodType, T>(schema: S, data: T) => boolean
  /** Remove a single field's error (call from `onChange`). */
  clearError: (field: string) => void
  /** Remove all errors (call when the dialog closes or the form resets). */
  clearAll: () => void
}

export function useFormErrors(): UseFormErrorsResult {
  const [errors, setErrors] = useState<FieldErrors>({})

  const validate = useCallback(
    <S extends z.ZodType, T>(schema: S, data: T): boolean => {
      const result = schema.safeParse(data)
      if (result.success) {
        setErrors({})
        return true
      }
      const fieldErrors: FieldErrors = {}
      for (const issue of result.error.issues) {
        // The hook only surfaces the *first* issue per top-level field key,
        // matching the existing one-error-per-field inline-error UX.
        const key = issue.path && issue.path.length > 0 ? String(issue.path[0]) : '_form'
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return false
    },
    [],
  )

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearAll = useCallback(() => setErrors({}), [])

  return { errors, validate, clearError, clearAll }
}
