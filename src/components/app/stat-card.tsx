'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { rowClick } from '@/components/app/row-click'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  loading,
  className,
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  loading?: boolean
  className?: string
  onClick?: () => void
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-muted text-foreground',
    success: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    danger: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    info: 'bg-teal-600/12 text-teal-700 dark:text-teal-300',
  }
  return (
    <Card
      className={cn(
        'py-0 transition-shadow',
        onClick &&
          'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      role={onClick ? 'button' : undefined}
      {...(onClick ? rowClick(onClick) : {})}
    >
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          )}
          {sub && !loading && <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
            <Icon className="size-5" aria-hidden />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
