'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/hooks/use-toast'

export interface ApiErrorShape {
  ok: false
  error: string
}

// M24-fe: a single expired session used to flood the screen with "Something went
// wrong" toasts from every concurrent useData() fetch. Once we've decided to
// redirect to /signin, suppress every subsequent 401's toast and short-circuit
// the redirect so we only navigate once.
let redirectingTo401 = false

// M12-auth: every mutating request carries a custom header so the server's
// withAuth() "double-submit" CSRF check (see src/lib/server/api.ts) can reject
// cross-site form POSTs — a cross-origin form cannot set a custom header
// without a CORS preflight, which we don't grant.
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' } as const

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; silent?: boolean } = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers:
        opts.body !== undefined
          ? { 'Content-Type': 'application/json', ...CSRF_HEADER }
          : { ...CSRF_HEADER },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    const msg = 'Network error — please try again'
    if (!opts.silent) toast({ title: 'Request failed', description: msg, variant: 'destructive' })
    throw new Error(msg)
  }
  // M24-fe: 401 → redirect to /signin ONCE and suppress the error toast.
  // The session has expired; nothing the user can do from this page.
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !redirectingTo401) {
      redirectingTo401 = true
      window.location.href = '/signin?expired=1'
    }
    throw new Error('Session expired')
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; error?: string }
  if (!res.ok || json.ok === false) {
    const msg = json.error || `Request failed (${res.status})`
    if (!opts.silent) toast({ title: 'Something went wrong', description: msg, variant: 'destructive' })
    throw new Error(msg)
  }
  return json.data as T
}

/** api() for multipart uploads — body is FormData (never JSON-encoded, no
 *  content-type header: the browser sets it with the boundary). */
export async function apiForm<T = unknown>(
  path: string,
  form: FormData,
  opts: { silent?: boolean } = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { method: 'POST', headers: { ...CSRF_HEADER }, body: form })
  } catch {
    const msg = 'Network error — please try again'
    if (!opts.silent) toast({ title: 'Request failed', description: msg, variant: 'destructive' })
    throw new Error(msg)
  }
  // M24-fe: 401 → redirect to /signin ONCE and suppress the error toast.
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !redirectingTo401) {
      redirectingTo401 = true
      window.location.href = '/signin?expired=1'
    }
    throw new Error('Session expired')
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; error?: string }
  if (!res.ok || json.ok === false) {
    const msg = json.error || `Request failed (${res.status})`
    if (!opts.silent) toast({ title: 'Something went wrong', description: msg, variant: 'destructive' })
    throw new Error(msg)
  }
  return json.data as T
}

/** Fetch hook with manual refresh; pass null to skip fetching. */
export function useData<T = unknown>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(!!path)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      if (!path) {
        await Promise.resolve()
        if (!cancelled) {
          setData(null)
          setError(null)
          setLoading(false)
        }
        return
      }
      try {
        const d = await api<T>(path, { silent: true })
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // M13-fe: the deps array spreads `deps` so callers can re-fetch when their
    // own inputs change. ESLint can't statically analyze a spread dependency
    // array, so we silence exhaustive-deps here — the pattern is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps])

  return { data, loading, error, refresh, setData }
}
