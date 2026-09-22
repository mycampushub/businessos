'use client'

import { useMemo, useState } from 'react'
import { Calendar, CalendarDays, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'

export interface GanttItem {
  id: string
  name: string
  start: Date
  end: Date
  progress?: number // 0..100
  color?: string
  kind?: 'task' | 'milestone' | 'project' | 'group'
  assignee?: string
  meta?: string
  /** Completed items (done tasks, completed milestones) are never flagged overdue. */
  completed?: boolean
}

/** Optional dependency connector: elbow from the END of `fromId`'s bar to the START of `toId`'s bar.
 *  `type` is the link type (FS finish-to-start / SS start-to-start / FF / SF) shown in the label. */
export interface GanttLink {
  fromId: string
  toId: string
  type?: string
}

/** Calendar range shaded on the timeline (public holidays etc.). */
export interface GanttHoliday {
  start: Date | string
  end: Date | string
  name?: string
}

type GanttZoom = 'day' | 'week' | 'month'

interface DayColumn {
  idx: number
  date: Date
  weekend: boolean
  holidayName: string | null
}

interface CalendarBlock {
  fromIdx: number
  toIdx: number
  holiday: boolean
  name: string | null
}

const ROW_H = 34
const ROSE = '#f43f5e'
const MIN_WIDTH = 400
const MONTHS_ROW_H = 22
const SUB_ROW_H = 18

const ZOOM_OPTIONS: Array<{ value: GanttZoom; label: string; hint: string; icon: typeof CalendarDays }> = [
  { value: 'day', label: 'Day', hint: 'Day view — one column per day', icon: CalendarDays },
  { value: 'week', label: 'Week', hint: 'Week view — grouped into weeks', icon: CalendarRange },
  { value: 'month', label: 'Month', hint: 'Month view — condensed timeline', icon: Calendar },
]

function addDays(d: Date, days: number): Date {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + days)
  return nd
}

function startOfDay(d: Date): Date {
  const nd = new Date(d)
  nd.setHours(0, 0, 0, 0)
  return nd
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? new Date(v.getTime()) : new Date(v)
}

/** Weekday number with 1 = Monday … 7 = Sunday. */
function weekdayNum(d: Date): number {
  const g = d.getDay()
  return g === 0 ? 7 : g
}

/** Pixels per day for each zoom level (day auto-shrinks as the range grows). */
function zoomDayWidth(zoom: GanttZoom, totalDays: number): number {
  if (zoom === 'month') return 4
  if (zoom === 'week') return 10
  if (totalDays > 240) return 8
  if (totalDays > 120) return 12
  if (totalDays > 60) return 18
  return 26
}

function isOverdue(it: GanttItem, now: number): boolean {
  if (it.completed) return false
  return it.end.getTime() < now && (it.progress ?? 0) < 100
}

/**
 * Lightweight dependency-free Gantt chart: rows of task bars over a day grid
 * with a two-tier date axis, working-day/holiday shading, progress fill, today
 * marker, milestone diamonds, overdue highlighting and — when `links` is
 * provided — dependency connector elbows between bars.
 */
export function GanttChart({
  items,
  links,
  className,
  nonWorkingDays = [6, 7],
  holidays = [],
  onItemClick,
}: {
  items: GanttItem[]
  links?: GanttLink[]
  className?: string
  /** Weekday numbers that are non-working (1 = Monday … 7 = Sunday). */
  nonWorkingDays?: number[]
  /** Calendar ranges shaded amber on the timeline. */
  holidays?: GanttHoliday[]
  /** Invoked when a task bar is clicked or activated with Enter/Space. */
  onItemClick?: (item: GanttItem) => void
}) {
  const [zoom, setZoom] = useState<GanttZoom>('day')
  const [hovered, setHovered] = useState<number | null>(null)

  const base = useMemo(() => {
    const valid = items.filter(
      (i) => i.start instanceof Date && i.end instanceof Date && !Number.isNaN(i.start.getTime()) && !Number.isNaN(i.end.getTime())
    )
    if (!valid.length) return null
    let minS = valid[0].start
    let maxE = valid[0].end
    for (const i of valid) {
      if (i.start < minS) minS = i.start
      if (i.end > maxE) maxE = i.end
    }
    const min = addDays(startOfDay(minS), -2)
    const lastDay = addDays(startOfDay(maxE), 2)
    const totalDays = Math.max(1, Math.round((lastDay.getTime() - min.getTime()) / 86400000) + 1)
    const todayIdx = Math.round((startOfDay(new Date()).getTime() - min.getTime()) / 86400000)
    return { items: valid, min, totalDays, todayIdx, rangeLabel: `${fmtDate(minS)} – ${fmtDate(maxE)}` }
  }, [items])

  const hols = useMemo(() => {
    const out: Array<{ start: Date; end: Date; name: string | null }> = []
    for (const h of holidays) {
      const start = startOfDay(toDate(h.start))
      let end = startOfDay(toDate(h.end))
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
      if (end < start) end = start
      out.push({ start, end, name: h.name ?? null })
    }
    return out
  }, [holidays])

  const dw = base ? zoomDayWidth(zoom, base.totalDays) : 26
  const width = base ? Math.max(base.totalDays * dw, MIN_WIDTH) : MIN_WIDTH

  // month boundary ticks (labelled at each month start)
  const monthTicks = useMemo(() => {
    if (!base) return [] as Array<{ x: number; label: string }>
    const ticks: Array<{ x: number; label: string }> = []
    let cursor = new Date(base.min.getFullYear(), base.min.getMonth(), 1)
    const last = addDays(base.min, base.totalDays - 1)
    while (cursor <= last) {
      const x = Math.round((cursor.getTime() - base.min.getTime()) / 86400000) * dw
      if (x >= 0) ticks.push({ x, label: cursor.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    return ticks
  }, [base, dw])

  // per-day classification (day/week zoom) and merged blocks (month zoom)
  const calendar = useMemo(() => {
    if (!base) return null
    const nonWorking = new Set(nonWorkingDays)
    const dateAt = (i: number) => addDays(base.min, i)
    const holidayAt = (i: number) => {
      const date = dateAt(i)
      return hols.find((h) => date >= h.start && date <= h.end) ?? null
    }

    const columns: DayColumn[] = []
    if (zoom !== 'month') {
      for (let i = 0; i < base.totalDays; i++) {
        const hol = holidayAt(i)
        columns.push({
          idx: i,
          date: dateAt(i),
          weekend: !hol && nonWorking.has(weekdayNum(dateAt(i))),
          holidayName: hol?.name ?? null,
        })
      }
    }

    const blocks: CalendarBlock[] = []
    if (zoom === 'month') {
      const idxOf = (d: Date) => Math.round((d.getTime() - base.min.getTime()) / 86400000)
      for (const h of hols) {
        const from = Math.max(0, idxOf(h.start))
        const to = Math.min(base.totalDays - 1, idxOf(h.end))
        if (from > to) continue
        blocks.push({ fromIdx: from, toIdx: to, holiday: true, name: h.name })
      }
      let runFrom = -1
      for (let i = 0; i <= base.totalDays; i++) {
        const free =
          i < base.totalDays && !holidayAt(i) && nonWorking.has(weekdayNum(dateAt(i)))
        if (free && runFrom < 0) runFrom = i
        else if (!free && runFrom >= 0) {
          blocks.push({ fromIdx: runFrom, toIdx: i - 1, holiday: false, name: null })
          runFrom = -1
        }
      }
    }
    return { columns, blocks }
  }, [base, zoom, dw, nonWorkingDays, hols])

  // week bands (Mondays) for the week-zoom header, labelled sparsely to avoid crowding
  const weekBands = useMemo(() => {
    if (!base || zoom !== 'week') return [] as Array<{ fromIdx: number; label: string | null }>
    const bands: Array<{ fromIdx: number; label: string | null }> = []
    let n = 0
    for (let i = 0; i < base.totalDays; i++) {
      if (weekdayNum(addDays(base.min, i)) !== 1) continue
      const date = addDays(base.min, i)
      bands.push({
        fromIdx: i,
        label: n % 3 === 0 ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null,
      })
      n++
    }
    return bands
  }, [base, zoom])

  // faint vertical week lines (skip ones that coincide with a month boundary)
  const weekLines = useMemo(() => {
    if (!base || zoom === 'month') return [] as number[]
    const xs: number[] = []
    for (let i = 0; i < base.totalDays; i++) {
      if (weekdayNum(addDays(base.min, i)) !== 1) continue
      const x = i * dw
      if (monthTicks.some((t) => Math.abs(t.x - x) < 2)) continue
      xs.push(x)
    }
    return xs
  }, [base, zoom, dw, monthTicks])

  // dependency connector elbows (from end of predecessor bar → start of successor bar)
  const linkMarks = useMemo(() => {
    const marks: Array<{ d: string; arrow: string; label: string }> = []
    if (!base || !links?.length) return marks
    const idxOf = (d: Date) => Math.round((startOfDay(d).getTime() - base.min.getTime()) / 86400000)
    const rowOf = new Map<string, number>()
    base.items.forEach((it, i) => rowOf.set(it.id, i))
    const endXOf = (it: GanttItem) => {
      if (it.kind === 'milestone') return idxOf(it.start) * dw
      const x = idxOf(it.start) * dw
      return x + Math.max(dw, (idxOf(it.end) - idxOf(it.start) + 1) * dw)
    }
    for (const l of links) {
      const fi = rowOf.get(l.fromId)
      const ti = rowOf.get(l.toId)
      if (fi === undefined || ti === undefined) continue // missing bar → skip
      const from = base.items[fi]
      const to = base.items[ti]
      const fromX = endXOf(from)
      const toX = idxOf(to.start) * dw
      const fromY = fi * ROW_H + 17
      const toY = ti * ROW_H + 17
      if (fromX < 0 || toX < 0 || fromX > width || toX > width) continue // clipped → skip
      const midX = Math.max(fromX + 10, Math.min(toX - 10, (fromX + toX) / 2))
      marks.push({
        d: `M ${fromX} ${fromY} H ${midX} V ${toY} H ${Math.max(midX, toX - 8)}`,
        arrow: `M ${toX - 7} ${toY - 3.5} L ${toX - 1.5} ${toY} L ${toX - 7} ${toY + 3.5}`,
        // accessible label — includes the link type when the caller provides it
        label: `${from.name} → ${to.name}${l.type ? ` (${l.type})` : ''}`,
      })
    }
    return marks
  }, [base, links, dw, width])

  if (!base) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        No schedule data to visualize yet.
      </div>
    )
  }

  const { min, totalDays, todayIdx } = base
  const rowsH = base.items.length * ROW_H
  const headerH = zoom === 'month' ? MONTHS_ROW_H : MONTHS_ROW_H + SUB_ROW_H
  const idxOf = (d: Date) => Math.round((startOfDay(d).getTime() - min.getTime()) / 86400000)
  const now = Date.now()

  const hasWeekend =
    zoom === 'month'
      ? calendar?.blocks.some((b) => !b.holiday) ?? false
      : calendar?.columns.some((c) => c.weekend) ?? false
  const hasHoliday =
    zoom === 'month'
      ? calendar?.blocks.some((b) => b.holiday) ?? false
      : calendar?.columns.some((c) => c.holidayName != null) ?? false
  const hasOverdue = base.items.some((it) => isOverdue(it, now))
  const todayVisible = todayIdx >= 0 && todayIdx < totalDays

  return (
    <div className={cn('rounded-xl border bg-card', className)}>
      {/* toolbar: range summary + zoom */}
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-xs font-medium">Timeline</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">{base.rangeLabel}</span>
        </div>
        <div role="radiogroup" aria-label="Timeline zoom" className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {ZOOM_OPTIONS.map((z) => {
            const active = zoom === z.value
            const Icon = z.icon
            return (
              <button
                key={z.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={z.hint}
                title={z.hint}
                onClick={() => setZoom(z.value)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{z.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* chart — scrolls horizontally inside its own container */}
      <div className="overflow-x-auto" role="region" aria-label="Gantt chart timeline">
        <div className="flex min-w-fit">
          {/* left labels (sticky while the timeline scrolls) */}
          <div className="sticky left-0 z-10 w-52 shrink-0 border-r bg-card sm:w-60">
            <div className="flex items-end border-b px-3 pb-1.5" style={{ height: headerH }}>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Work item</span>
            </div>
            <div style={{ height: rowsH }}>
              {base.items.map((it, idx) => (
                <div
                  key={it.id}
                  className={cn(
                    'flex h-[34px] items-center gap-2 border-b px-3 transition-colors last:border-b-0',
                    hovered === idx && 'bg-muted/30'
                  )}
                  onMouseEnter={() => setHovered(idx)}
                  onMouseLeave={() => setHovered((h) => (h === idx ? null : h))}
                >
                  {it.kind === 'milestone' ? (
                    <span className="size-2 rotate-45 shrink-0 bg-amber-500" aria-hidden />
                  ) : it.kind === 'project' ? (
                    <span className="size-2 shrink-0 rounded-sm bg-emerald-600" aria-hidden />
                  ) : (
                    <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{it.name}</p>
                    {it.assignee && <p className="truncate text-[10px] text-muted-foreground">{it.assignee}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* timeline */}
          <div className="relative" style={{ width }}>
            {/* two-tier date header */}
            <div className="relative border-b" style={{ height: headerH }} aria-hidden>
              <div className="absolute inset-x-0 top-0 border-b border-border/50" style={{ height: MONTHS_ROW_H }}>
                {monthTicks.map((t) => (
                  <div key={`m${t.x}`} className="absolute top-0 h-full border-l text-[10px] font-medium text-muted-foreground" style={{ left: t.x }}>
                    <span className="pl-1.5 leading-[22px]">{t.label}</span>
                  </div>
                ))}
              </div>
              {zoom === 'day' && (
                <div className="absolute inset-x-0" style={{ top: MONTHS_ROW_H, height: SUB_ROW_H }}>
                  {calendar?.columns.map((c) => (
                    <div
                      key={`d${c.idx}`}
                      title={c.holidayName ?? undefined}
                      className={cn(
                        'absolute top-0 h-full text-center text-[10px] leading-[18px]',
                        c.holidayName != null
                          ? 'bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400'
                          : c.weekend
                            ? 'text-muted-foreground/50'
                            : 'text-muted-foreground',
                        c.idx === todayIdx && 'font-semibold text-rose-600 dark:text-rose-400'
                      )}
                      style={{ left: c.idx * dw, width: dw }}
                    >
                      {c.date.getDate()}
                    </div>
                  ))}
                </div>
              )}
              {zoom === 'week' && (
                <div className="absolute inset-x-0" style={{ top: MONTHS_ROW_H, height: SUB_ROW_H }}>
                  {weekBands.map((b) => (
                    <div key={`wb${b.fromIdx}`} className="absolute top-0 h-full border-l border-border/50" style={{ left: b.fromIdx * dw, width: 7 * dw }}>
                      {b.label && <span className="pl-1 text-[9px] leading-[18px] text-muted-foreground">{b.label}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* rows */}
            <div className="relative" style={{ height: rowsH }}>
              {/* non-working-day / holiday column shading */}
              {zoom !== 'month' &&
                calendar?.columns.map((c) =>
                  c.holidayName != null || c.weekend ? (
                    <div
                      key={`s${c.idx}`}
                      title={c.holidayName ?? undefined}
                      className={cn(
                        'absolute top-0 h-full',
                        c.holidayName != null
                          ? 'bg-amber-500/10 border-l border-amber-500/20'
                          : 'bg-muted/40 border-l border-muted-foreground/10'
                      )}
                      style={{ left: c.idx * dw, width: dw }}
                      aria-hidden
                    />
                  ) : null
                )}
              {zoom === 'month' &&
                calendar?.blocks.map((b, i) => (
                  <div
                    key={`sb${i}`}
                    title={b.name ?? undefined}
                    className={cn(
                      'absolute top-0 h-full',
                      b.holiday ? 'bg-amber-500/10 border-l border-amber-500/20' : 'bg-muted/40 border-l border-muted-foreground/10'
                    )}
                    style={{ left: b.fromIdx * dw, width: (b.toIdx - b.fromIdx + 1) * dw }}
                    aria-hidden
                  />
                ))}
              {/* grid lines: month boundaries (strong) + week lines (faint) */}
              {monthTicks.map((t) => (
                <div key={`g${t.x}`} className="absolute top-0 h-full border-l" style={{ left: t.x }} aria-hidden />
              ))}
              {weekLines.map((x) => (
                <div key={`wl${x}`} className="absolute top-0 h-full border-l border-border/40" style={{ left: x }} aria-hidden />
              ))}
              {/* full-row hover overlay */}
              {hovered != null && (
                <div className="absolute inset-x-0 bg-muted/30" style={{ top: hovered * ROW_H, height: ROW_H }} aria-hidden />
              )}
              {/* today marker + chip */}
              {todayVisible && (
                <div className="absolute top-0 z-10 h-full w-px bg-rose-500/70" style={{ left: todayIdx * dw }} aria-label="today">
                  <span className="absolute -top-1 left-1 rounded bg-rose-500 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
                    Today
                  </span>
                  <span className="absolute -top-0.5 -left-1 size-2 rounded-full bg-rose-500" />
                </div>
              )}
              {/* bars — one per 34px row (mirrors the left label rows) */}
              {base.items.map((it, idx) => {
                const progress = Math.min(100, Math.max(0, it.progress ?? 0))
                if (it.kind === 'milestone') {
                  const x = idxOf(it.start) * dw
                  const overdue = isOverdue(it, now)
                  return (
                    <div key={it.id}>
                      <div
                        className={cn(
                          'absolute size-3.5 rotate-45 border-2 transition-transform hover:scale-110',
                          overdue ? 'border-rose-500 bg-rose-400' : 'border-amber-500 bg-amber-400'
                        )}
                        style={{ left: x - 6, top: idx * ROW_H + 10 }}
                        title={`${it.name} — ${fmtDate(it.end)}${overdue ? ' — overdue' : ''}`}
                        onMouseEnter={() => setHovered(idx)}
                        onMouseLeave={() => setHovered((h) => (h === idx ? null : h))}
                      />
                      {zoom === 'day' && x + 70 < width && (
                        <span
                          className={cn(
                            'pointer-events-none absolute whitespace-nowrap text-[10px]',
                            overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                          )}
                          style={{ left: x + 10, top: idx * ROW_H + 11 }}
                          aria-hidden
                        >
                          {fmtDate(it.end)}
                        </span>
                      )}
                    </div>
                  )
                }
                const x = idxOf(it.start) * dw
                const w = Math.max(dw, (idxOf(it.end) - idxOf(it.start) + 1) * dw)
                const overdue = isOverdue(it, now)
                const fill = overdue ? ROSE : (it.color ?? (it.kind === 'project' ? '#059669' : '#14b8a6'))
                const interactive = onItemClick != null && (it.kind ?? 'task') === 'task'
                return (
                  <div
                    key={it.id}
                    role={interactive ? 'button' : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={
                      interactive
                        ? `${it.name} — ${fmtDate(it.start)} to ${fmtDate(it.end)}, ${progress}% complete${overdue ? ', overdue' : ''}`
                        : undefined
                    }
                    className={cn(
                      'absolute h-[22px] overflow-hidden rounded-md border text-[10px] leading-[22px] transition-[filter,box-shadow]',
                      interactive && 'cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
                    )}
                    style={{
                      left: x,
                      width: w,
                      top: idx * ROW_H + 6,
                      backgroundColor: `${fill}22`,
                      borderColor: overdue ? `${ROSE}99` : `${fill}88`,
                    }}
                    title={`${it.name}${it.meta ? ` — ${it.meta}` : ''} (${fmtDate(it.start)} → ${fmtDate(it.end)})${overdue ? ' — overdue' : ''}`}
                    onClick={interactive ? () => onItemClick?.(it) : undefined}
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onItemClick?.(it)
                            }
                          }
                        : undefined
                    }
                    onMouseEnter={() => setHovered(idx)}
                    onMouseLeave={() => setHovered((h) => (h === idx ? null : h))}
                  >
                    <div className="h-full rounded-[5px]" style={{ width: `${progress}%`, backgroundColor: `${fill}CC` }} aria-label={`progress ${progress}%`} />
                    {w > 70 && (
                      <span className="pointer-events-none absolute left-1.5 top-0 max-w-full truncate pr-9 font-medium text-foreground/80">
                        {it.name}
                      </span>
                    )}
                    {w > 70 && it.progress != null && (
                      <span className="pointer-events-none absolute right-1.5 top-0 font-semibold tabular-nums text-foreground/70">
                        {progress}%
                      </span>
                    )}
                  </div>
                )
              })}
              {/* dependency connectors — each path carries a <title> with the
                  link label (names + type) for hover/AT; an sr-only list sits below */}
              {linkMarks.length > 0 && (
                <svg
                  className="pointer-events-none absolute inset-0 text-muted-foreground/60"
                  width={width}
                  height={rowsH}
                  viewBox={`0 0 ${width} ${rowsH}`}
                  fill="none"
                  aria-hidden
                >
                  {linkMarks.map((m, i) => (
                    <g key={i}>
                      <title>{m.label}</title>
                      <path d={m.d} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                      <path d={m.arrow} fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
                    </g>
                  ))}
                </svg>
              )}
              {linkMarks.length > 0 && (
                <span className="sr-only">
                  Dependency links: {linkMarks.map((m) => m.label).join('; ')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-600" /> Project</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-teal-500" /> Task</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rotate-45 border border-amber-500 bg-amber-400" /> Milestone</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-px bg-rose-500" /> Today</span>
        {hasWeekend && (
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted-foreground/25" /> Weekend</span>
        )}
        {hasHoliday && (
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-amber-400" /> Public holiday</span>
        )}
        {hasOverdue && (
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-sm border border-rose-500/60 bg-rose-500/25" /> Overdue</span>
        )}
        {linkMarks.length > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" viewBox="0 0 18 8" fill="none" aria-hidden className="text-muted-foreground/60">
              <path d="M1 4 H12" stroke="currentColor" strokeWidth={1.5} />
              <path d="M11 1 L16 4 L11 7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
            Dependency
          </span>
        )}
      </div>
    </div>
  )
}
