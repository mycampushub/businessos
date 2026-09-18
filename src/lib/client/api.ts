'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/hooks/use-toast'

export interface ApiErrorShape {
  ok: false
  error: string
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; silent?: boolean } = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    const msg = 'Network error — please try again'
    if (!opts.silent) toast({ title: 'Request failed', description: msg, variant: 'destructive' })
    throw new Error(msg)
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
  }, [path, tick, ...deps])

  return { data, loading, error, refresh, setData }
}
