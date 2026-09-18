'use client'

import { cn } from '@/lib/utils'

export function OrgOsLogo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="8" className={dark ? 'fill-emerald-400' : 'fill-emerald-600'} />
        <g className={dark ? 'fill-zinc-950' : 'fill-white'}>
          <rect x="7" y="9" width="7" height="4" rx="1.5" />
          <rect x="7" y="15" width="11" height="4" rx="1.5" opacity="0.85" />
          <rect x="7" y="21" width="15" height="4" rx="1.5" opacity="0.7" />
          <circle cx="23.5" cy="11" r="2.4" />
        </g>
      </svg>
      <span className={cn('font-semibold tracking-tight', dark ? 'text-white' : 'text-foreground')}>
        Org<span className="text-emerald-600 dark:text-emerald-400">OS</span>
      </span>
    </span>
  )
}
