'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BadgeTone } from '@/lib/format'

const TONE_CLASSES: Record<BadgeTone, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 border-transparent',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent',
  destructive: 'bg-destructive/15 text-destructive border-destructive/25 hover:bg-destructive/20 dark:bg-destructive/20',
  outline: 'bg-transparent text-foreground border-border hover:bg-muted',
  success: 'bg-emerald-600/12 text-emerald-700 border-emerald-600/25 hover:bg-emerald-600/18 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400 dark:bg-amber-500/15',
  info: 'bg-teal-600/12 text-teal-700 border-teal-600/25 hover:bg-teal-600/18 dark:text-teal-300 dark:bg-teal-500/15 dark:border-teal-500/30',
  muted: 'bg-muted text-muted-foreground border-transparent hover:bg-muted/70',
}

export function StatusBadge({
  label,
  tone = 'outline',
  className,
  dot = true,
}: {
  label: string
  tone?: BadgeTone
  className?: string
  dot?: boolean
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', TONE_CLASSES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {label}
    </Badge>
  )
}

export function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    LOW: 'bg-muted-foreground/40',
    MEDIUM: 'bg-amber-500',
    HIGH: 'bg-orange-500',
    URGENT: 'bg-rose-500',
  }
  return <span className={cn('inline-block size-2 rounded-full', colors[priority] ?? 'bg-muted-foreground/40')} aria-label={priority} />
}
