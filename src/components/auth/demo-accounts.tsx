'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const DEMO_ACCOUNTS = [
  { email: 'owner@orgos.dev', role: 'Owner', who: 'Tanvir · Founder, Meridian Labs', initial: 'T' },
  { email: 'farhan@orgos.dev', role: 'Manager', who: 'Farhan · CTO', initial: 'F' },
  { email: 'nusrat@orgos.dev', role: 'HR', who: 'Nusrat · HR Manager', initial: 'N' },
  { email: 'rafi@orgos.dev', role: 'Employee', who: 'Rafi · Developer', initial: 'R' },
  { email: 'saas@orgos.dev', role: 'SaaS admin', who: 'Platform console', initial: 'S' },
]

/** One-click demo logins — a sandbox showcase affordance for /signin. */
export function DemoAccounts({
  onPick,
  busy,
  pendingEmail,
}: {
  onPick: (email: string) => void
  busy: boolean
  pendingEmail: string | null
}) {
  return (
    <section
      aria-label="Demo accounts"
      className="rounded-xl border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <h2 className="text-xs font-semibold tracking-wide uppercase">Explore with a demo account</h2>
      </div>
      <ul className="divide-y">
        {DEMO_ACCOUNTS.map((d) => {
          const pending = busy && pendingEmail === d.email
          return (
            <li key={d.email}>
              <button
                type="button"
                onClick={() => onPick(d.email)}
                disabled={busy}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  'hover:bg-emerald-600/[0.06] focus-visible:bg-emerald-600/[0.06] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600/60',
                  'disabled:pointer-events-none disabled:opacity-60'
                )}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  aria-hidden
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : d.initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.role}</span>
                    <span className="rounded-full border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      {d.email}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{d.who}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        Demo data · password <code className="rounded bg-muted px-1 py-px font-mono">password123</code>
      </p>
    </section>
  )
}
