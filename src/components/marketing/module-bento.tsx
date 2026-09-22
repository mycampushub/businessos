import Link from 'next/link'
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarClock,
  FolderOpen,
  KanbanSquare,
  Receipt,
  Target,
  UserPlus,
  Users,
} from 'lucide-react'
import { Reveal, RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'
import { MODULES } from '@/lib/site'
import { cn } from '@/lib/utils'

const ICONS: Record<string, typeof Users> = {
  KanbanSquare,
  Target,
  Users,
  UserPlus,
  Receipt,
  Banknote,
  FolderOpen,
  BarChart3,
  CalendarClock,
}

/** Tiny kanban strip preview inside the featured Projects card. */
function KanbanStrip() {
  const cols = [
    { label: 'To do', tone: 'bg-zinc-400', cards: 3 },
    { label: 'In progress', tone: 'bg-amber-400', cards: 5 },
    { label: 'Done', tone: 'bg-emerald-500', cards: 7 },
  ]
  return (
    <div aria-hidden className="mt-5 grid grid-cols-3 gap-2.5">
      {cols.map((col) => (
        <div key={col.label} className="rounded-lg bg-muted/70 p-2">
          <p className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', col.tone)} />
            {col.label}
          </p>
          <div className="mt-1.5 space-y-1.5">
            {Array.from({ length: col.cards > 3 ? 3 : col.cards }).map((_, i) => (
              <div key={i} className="h-6 rounded-md border border-border/70 bg-card shadow-sm" />
            ))}
            {col.cards > 3 && (
              <p className="px-0.5 text-[9px] font-medium text-muted-foreground">
                +{col.cards - 3} more
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Pipeline stage preview inside the CRM card. */
function PipelineStrip() {
  const stages = [
    { label: 'New', count: 12, w: 'w-[18%]' },
    { label: 'Qualified', count: 8, w: 'w-[26%]' },
    { label: 'Proposed', count: 5, w: 'w-[30%]' },
    { label: 'Won', count: 9, w: 'w-full' },
  ]
  return (
    <div aria-hidden className="mt-5 space-y-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] font-medium text-muted-foreground">{s.label}</span>
          <div className="h-3.5 flex-1 rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 opacity-80',
                s.w
              )}
            />
          </div>
          <span className="w-4 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
            {s.count}
          </span>
        </div>
      ))}
    </div>
  )
}

function ModuleCard({
  module,
  className,
  featured,
}: {
  module: (typeof MODULES)[number]
  className?: string
  featured?: 'kanban' | 'pipeline'
}) {
  const Icon = ICONS[module.icon] ?? KanbanSquare
  return (
    <Link
      href="/features"
      className={cn(
        'group flex h-full flex-col rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 sm:p-6',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors duration-300 group-hover:bg-emerald-600 group-hover:text-white dark:group-hover:text-zinc-950">
          <Icon className="size-5" />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-600" />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">{module.name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{module.blurb}</p>
      {featured === 'kanban' && <KanbanStrip />}
      {featured === 'pipeline' && <PipelineStrip />}
    </Link>
  )
}

export function ModuleBento() {
  const byId = Object.fromEntries(MODULES.map((m) => [m.id, m]))
  return (
    <Section id="modules" className="scroll-mt-20">
      <SectionContainer>
        <SectionHeading
          eyebrow="One system. Every team."
          title="Nine modules. Zero integration tax."
          description="Every module ships in the box and shares the same people, permissions and data — no zap-gluing five vendors together."
        />
        <RevealGroup className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" stagger={0.06}>
          <RevealItem className="sm:col-span-2 lg:col-span-4">
            <ModuleCard module={byId.projects} featured="kanban" className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.crm} featured="pipeline" className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.hr} className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.recruitment} className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.finance} className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.payroll} className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.documents} className="h-full" />
          </RevealItem>
          <RevealItem className="lg:col-span-2">
            <ModuleCard module={byId.reports} className="h-full" />
          </RevealItem>
          <RevealItem className="sm:col-span-2 lg:col-span-6">
            <ModuleCard module={byId.meetings} className="h-full" />
          </RevealItem>
        </RevealGroup>
      </SectionContainer>
    </Section>
  )
}
