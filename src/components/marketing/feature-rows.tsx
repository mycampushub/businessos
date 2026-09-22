import { CheckCircle2 } from 'lucide-react'
import { Reveal } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'
import { cn } from '@/lib/utils'

function VisualShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative rounded-xl border border-border/70 bg-card p-5 shadow-xl shadow-zinc-950/5 dark:shadow-black/25 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

/* --- Visual 1: Gantt timeline with dependency link --- */
function GanttVisual() {
  const rows = [
    { name: 'Discovery & scope', x: '0%', w: '22%', tone: 'bg-emerald-500' },
    { name: 'Design system', x: '18%', w: '26%', tone: 'bg-emerald-500/80' },
    { name: 'Payments integration', x: '40%', w: '32%', tone: 'bg-teal-500' },
    { name: 'QA & hardening', x: '66%', w: '22%', tone: 'bg-amber-400' },
    { name: 'Go-live', x: '84%', w: '12%', tone: 'bg-zinc-400' },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">GreenGrocer Platform · Timeline</p>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
          On track
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[11px] font-medium text-muted-foreground">
              {r.name}
            </span>
            <div className="relative h-5 flex-1 rounded-md bg-muted/70">
              <div
                className={cn('absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full', r.tone)}
                style={{ left: r.x, width: r.w }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-6 border-t border-dashed border-emerald-600 align-middle" />
          FS dependency · start-gated
        </span>
        <span className="tabular-nums">Milestone 4 of 6</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 2: payroll run + payslip --- */
function PayrollVisual() {
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Payroll · September run</p>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
          Ready · 24 payslips
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {[
          ['Maria Santos', 'Delivery lead', '৳145,000'],
          ['Farhan Ahmed', 'Senior engineer', '৳132,000'],
          ['Nusrat Jahan', 'QA analyst', '৳86,000'],
          ['Rafiul Islam', 'Finance exec.', '৳92,500'],
        ].map(([name, role, amount], i) => (
          <div
            key={name}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5',
              i === 0 && 'border-emerald-500/40 bg-emerald-500/5'
            )}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                ['bg-emerald-600', 'bg-teal-600', 'bg-amber-600', 'bg-zinc-500'][i]
              )}
            >
              {name.split(' ').map((n) => n[0]).join('')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-foreground">{name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{role}</p>
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">{amount}</span>
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <span className="text-[10px] text-muted-foreground">Attendance & leave applied automatically</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">৳3.94M total</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 3: CRM pipeline board --- */
function CrmVisual() {
  const stages = [
    { label: 'New', value: '৳820K', cards: ['EduPath renewal', 'Skyline retainer'] },
    { label: 'Qualified', value: '৳1.2M', cards: ['BengalCraft ERP'] },
    { label: 'Proposed', value: '৳2.1M', cards: ['DhakaFin rollout', 'UrbanCart v2'] },
    { label: 'Won', value: '৳245K', cards: ['GreenGrocer renew'] },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Deal pipeline · Q3</p>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">Weighted ৳4.6M</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <div key={s.label} className="rounded-lg bg-muted/70 p-2">
            <p className="flex items-center justify-between px-0.5 text-[10px] font-semibold text-muted-foreground">
              {s.label}
              <span className="tabular-nums">{s.value}</span>
            </p>
            <div className="mt-1.5 space-y-1.5">
              {s.cards.map((c) => (
                <div
                  key={c}
                  className={cn(
                    'rounded-md border border-border/70 bg-card px-2 py-1.5 text-[10px] font-medium leading-tight text-foreground shadow-sm',
                    i === 3 && 'border-emerald-500/40 bg-emerald-500/5'
                  )}
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
        <span>Lead → Deal conversion in one click</span>
        <span className="text-foreground">Win rate 31%</span>
      </div>
    </VisualShell>
  )
}

const ROWS = [
  {
    eyebrow: 'Projects',
    title: 'Ship on schedule, not on hope',
    description:
      'Kanban boards for flow, a Gantt timeline for the plan, and typed dependencies (finish-to-start, start-to-start and more) that physically block early starts. Progress updates itself from real task states.',
    bullets: [
      'Milestones with automatic on-track / delayed status',
      'Per-project budgets, priorities and client links',
      'Board, Gantt and list views over the same tasks',
    ],
    visual: <GanttVisual />,
  },
  {
    eyebrow: 'People & payroll',
    title: 'HR that runs itself (mostly)',
    description:
      'Attendance check-ins, leave requests, org holidays and salary structures feed straight into payroll. One click generates compliant payslips for the whole company — in your org timezone.',
    bullets: [
      'Leave workflows with balances and holiday awareness',
      'Payroll runs with attendance & adjustment math done',
      'Org chart, departments and role-based access',
    ],
    visual: <PayrollVisual />,
  },
  {
    eyebrow: 'Revenue',
    title: 'From first hello to paid invoice',
    description:
      'Capture leads, convert them into pipeline deals, link won deals to delivery projects, and bill from the same system. Finance sees revenue the moment sales commits it.',
    bullets: [
      'Companies, contacts, leads and deal stages',
      'Lead → Deal conversion with a single click',
      'Invoices & expenses with approval trails',
    ],
    visual: <CrmVisual />,
  },
]

export function FeatureRows() {
  return (
    <Section id="tour" className="scroll-mt-20">
      <SectionContainer>
        <SectionHeading
          eyebrow="A guided tour"
          title="Built for how your teams actually work"
          description="Not nine disconnected apps — one connected system where every module reinforces the next."
        />
        <div className="mt-16 space-y-16 sm:mt-20 sm:space-y-24">
          {ROWS.map((row, i) => (
            <div
              key={row.eyebrow}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <Reveal className={cn(i % 2 === 1 && 'lg:order-2')}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                  {row.eyebrow}
                </p>
                <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {row.title}
                </h3>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground sm:text-lg">
                  {row.description}
                </p>
                <ul className="mt-6 space-y-3">
                  {row.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm text-foreground/90 sm:text-base">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {b}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.12} className={cn(i % 2 === 1 && 'lg:order-1')}>
                {row.visual}
              </Reveal>
            </div>
          ))}
        </div>
      </SectionContainer>
    </Section>
  )
}
