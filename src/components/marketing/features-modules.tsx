import type { ReactNode } from 'react'
import {
  Banknote,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  KanbanSquare,
  Receipt,
  Target,
  UserPlus,
  Users,
} from 'lucide-react'
import { Reveal } from './reveal'
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

/** Shared card chrome for the hand-built module mini-visuals (decorative). */
function VisualShell({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative rounded-xl border border-border/70 bg-card p-5 shadow-xl shadow-zinc-950/5 dark:shadow-black/25 sm:p-6"
    >
      {children}
    </div>
  )
}

const chip = 'rounded-full px-2 py-0.5 text-[10px] font-semibold'
const chipOk =
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
const footerRow =
  'mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground'

/* --- Visual 1: Kanban strip with dependency gate --- */
function ProjectsVisual() {
  const cols = [
    { label: 'Backlog', dot: 'bg-zinc-400', cards: ['Vendor shortlist', 'Auth flow'] },
    { label: 'In progress', dot: 'bg-amber-400', cards: ['Checkout API'] },
    { label: 'Done', dot: 'bg-emerald-500', cards: ['Landing page', 'Onboarding'] },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Mobile app · Sprint 12</p>
        <span className={cn(chip, chipOk)}>62% · on track</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {cols.map((col) => (
          <div key={col.label} className="rounded-lg bg-muted/70 p-2">
            <p className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', col.dot)} />
              {col.label}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {col.cards.map((card) => (
                <div
                  key={card}
                  className="rounded-md border border-border/70 bg-card px-2 py-1.5 text-[10px] font-medium leading-tight text-foreground shadow-sm"
                >
                  {card}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>“Checkout API” gated by FS dependency</span>
        <span className="tabular-nums">Milestone 3 of 5</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 2: CRM pipeline stage bars --- */
function CrmVisual() {
  const stages = [
    { label: 'New', value: '12', w: 'w-[22%]' },
    { label: 'Qualified', value: '8', w: 'w-[40%]' },
    { label: 'Proposed', value: '5', w: 'w-[62%]' },
    { label: 'Won', value: '9', w: 'w-full' },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Deal pipeline · Q4</p>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          Weighted ৳4.6M
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5">
            <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">
              {s.label}
            </span>
            <div className="h-4 flex-1 rounded-full bg-muted/70">
              <div
                className={cn(
                  'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 opacity-85',
                  s.w
                )}
              />
            </div>
            <span className="w-5 text-right text-[11px] font-semibold tabular-nums text-foreground">
              {s.value}
            </span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>EduPath renewal → won today</span>
        <span className="text-foreground">Win rate 31%</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 3: attendance rows --- */
function HrVisual() {
  const rows = [
    { name: 'Maria Santos', meta: 'In 09:02 · Out 18:04', label: 'Present', tone: chipOk },
    {
      name: 'Farhan Ahmed',
      meta: 'In 10:14',
      label: 'Late',
      tone: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-500',
    },
    {
      name: 'Nusrat Jahan',
      meta: 'Annual leave · 2 of 18 left',
      label: 'On leave',
      tone: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-400',
    },
    { name: 'Rafiul Islam', meta: 'In 08:55', label: 'Present', tone: chipOk },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Attendance · Today</p>
        <span className={cn(chip, chipOk)}>94% checked in</span>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                ['bg-emerald-600', 'bg-teal-600', 'bg-zinc-400', 'bg-amber-600'][i]
              )}
            >
              {r.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-foreground">{r.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{r.meta}</p>
            </div>
            <span className={cn(chip, 'shrink-0', r.tone)}>{r.label}</span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>Org timezone · Asia/Dhaka (GMT+6)</span>
        <span className="text-foreground">Leave balances synced</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 4: recruitment funnel --- */
function RecruitmentVisual() {
  const funnel = [
    { stage: 'Applied', count: 24, w: 'w-full' },
    { stage: 'Screening', count: 9, w: 'w-[42%]' },
    { stage: 'Interview', count: 4, w: 'w-[20%]' },
    { stage: 'Offer', count: 1, w: 'w-[9%]' },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Senior Engineer · 24 applicants</p>
        <span className={cn(chip, chipOk)}>Open</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {funnel.map((f) => (
          <div key={f.stage} className="flex items-center gap-2.5">
            <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">
              {f.stage}
            </span>
            <div className="h-4 flex-1 rounded-full bg-muted/70">
              <div className={cn('h-full rounded-full bg-emerald-500/85', f.w)} />
            </div>
            <span className="w-5 text-right text-[11px] font-semibold tabular-nums text-foreground">
              {f.count}
            </span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>Candidates apply via your public careers page</span>
        <span className="text-foreground">3 in interview</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 5: invoice cards --- */
function FinanceVisual() {
  const invoices = [
    { id: 'INV-1042', client: 'EduPath Learning', amount: '৳145,000', label: 'Paid', tone: chipOk },
    {
      id: 'INV-1043',
      client: 'UrbanCart',
      amount: '৳82,500',
      label: 'Sent',
      tone: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-400',
    },
    {
      id: 'INV-1039',
      client: 'BengalCraft',
      amount: '৳56,000',
      label: 'Overdue',
      tone: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
    },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Invoices · October</p>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          Collected ৳227K
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-medium text-muted-foreground">{inv.id}</p>
              <p className="truncate text-[11px] font-medium text-foreground">{inv.client}</p>
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {inv.amount}
            </span>
            <span className={cn(chip, 'shrink-0', inv.tone)}>{inv.label}</span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>Expenses ৳23,400 · 2 pending approvals</span>
        <span className="text-foreground">Multi-currency</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 6: payslip lines --- */
function PayrollVisual() {
  const lines = [
    { label: 'Gross salary', value: '৳132,000' },
    { label: 'Attendance bonus', value: '+৳2,000' },
    { label: 'Deductions', value: '−৳11,200' },
    { label: 'Unpaid leave', value: '−৳1,500' },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Payslip · Farhan Ahmed · October</p>
        <span className={cn(chip, chipOk)}>Ready</span>
      </div>
      <dl className="mt-4 space-y-2">
        {lines.map((l) => (
          <div key={l.label} className="flex items-center justify-between text-[11px]">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className="font-medium tabular-nums text-foreground">{l.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5">
        <span className="text-[11px] font-semibold text-foreground">Net pay</span>
        <span className="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-foreground">
          ৳121,300
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
      </div>
      <div className={footerRow}>
        <span>One-click run · 24 payslips</span>
        <span className="text-foreground">৳3.94M total</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 7: file rows + quota --- */
function DocumentsVisual() {
  const files = [
    { name: 'Product-spec-v3.pdf', size: '2.4 MB', version: 'v3', icon: FileText },
    { name: 'Onboarding-guide.docx', size: '812 KB', version: 'v2', icon: FileText },
    { name: 'Q4-budget.xlsx', size: '96 KB', version: 'v5', icon: FileSpreadsheet },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Documents · Mobile app project</p>
        <span className="text-[10px] font-medium text-muted-foreground">Versioned</span>
      </div>
      <div className="mt-4 space-y-2">
        {files.map((f) => (
          <div
            key={f.name}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <f.icon className="size-3.5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
              {f.name}
            </p>
            <span className={cn(chip, 'bg-muted text-muted-foreground')}>{f.version}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {f.size}
            </span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span className="flex flex-1 items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-[12%] rounded-full bg-emerald-500" />
          </span>
          1.2 GB of 10 GB used
        </span>
        <span className="text-foreground">Per-project folders</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 8: chart bars --- */
function ReportsVisual() {
  const bars = [
    { m: 'Apr', h: 'h-[42%]' },
    { m: 'May', h: 'h-[55%]' },
    { m: 'Jun', h: 'h-[48%]' },
    { m: 'Jul', h: 'h-[68%]' },
    { m: 'Aug', h: 'h-[62%]' },
    { m: 'Sep', h: 'h-[84%]' },
    { m: 'Oct', h: 'h-full' },
  ]
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Revenue · last 7 months</p>
        <span className={cn(chip, chipOk)}>+18% MoM</span>
      </div>
      <div className="mt-5 flex h-28 items-end gap-2 sm:gap-2.5">
        {bars.map((b, i) => (
          <div key={b.m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              className={cn(
                'w-full rounded-t-md',
                i === bars.length - 1
                  ? 'bg-gradient-to-t from-emerald-600 to-teal-400'
                  : 'bg-emerald-500/45 dark:bg-emerald-500/35',
                b.h
              )}
            />
            <span className="text-[9px] font-medium text-muted-foreground">{b.m}</span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>Invoices paid ৳4.6M · Expenses ৳2.1M</span>
        <span className="text-foreground">CSV export</span>
      </div>
    </VisualShell>
  )
}

/* --- Visual 9: calendar grid + agenda --- */
function MeetingsVisual() {
  const events = [3, 14, 16, 27]
  const today = 14
  return (
    <VisualShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Team calendar · October</p>
        <span className={cn(chip, chipOk)}>4 events</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => {
          const day = i - 2 // two leading blanks
          if (day < 1 || day > 31) return <span key={i} className="h-7 rounded-md" />
          const isEvent = events.includes(day)
          const isToday = day === today
          return (
            <span
              key={i}
              className={cn(
                'flex h-7 items-center justify-center rounded-md text-[9px] font-medium tabular-nums',
                isToday
                  ? 'bg-emerald-600 font-semibold text-white dark:bg-emerald-500 dark:text-zinc-950'
                  : isEvent
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-muted/60 text-muted-foreground'
              )}
            >
              {day}
            </span>
          )
        })}
      </div>
      <div className="mt-4 space-y-1.5">
        {[
          ['Mon 14', 'Sprint review · 10:00 (GMT+6)'],
          ['Wed 16', 'All-hands · 16:30'],
        ].map(([day, title]) => (
          <div key={day} className="flex items-center gap-2.5 text-[10px]">
            <span className="w-12 shrink-0 font-medium text-muted-foreground">{day}</span>
            <span className="truncate text-foreground">{title}</span>
          </div>
        ))}
      </div>
      <div className={footerRow}>
        <span>Announcement sent · 132 notified</span>
        <span className="text-foreground">Timezone-aware</span>
      </div>
    </VisualShell>
  )
}

/* --- Per-module deep-dive content keyed by MODULES id --- */
const DEEP: Record<string, { description: string; bullets: string[]; visual: ReactNode }> = {
  projects: {
    description:
      'Kanban boards for daily flow, a Gantt timeline for the plan, and typed dependencies that actually gate execution — progress updates itself from real task states.',
    bullets: [
      'Drag-and-drop board with per-project columns',
      'Gantt timeline with FS / SS / FF / SF dependencies',
      'Milestones with automatic on-track / delayed status',
      'Per-project budgets, priorities and client links',
    ],
    visual: <ProjectsVisual />,
  },
  crm: {
    description:
      'Companies, contacts, leads and a visual deal pipeline — from first touch to won, in one board the whole revenue team can read at a glance.',
    bullets: [
      'Companies, contacts and leads with activity history',
      'Visual pipeline with weighted revenue by stage',
      'One-click lead → deal conversion',
      'Won deals link straight to delivery projects',
    ],
    visual: <CrmVisual />,
  },
  hr: {
    description:
      'Employee records, leave workflows, holidays and daily check-in tracking — all with org-timezone accuracy, so “today” means the same thing to everyone.',
    bullets: [
      'Employee records, departments and org structure',
      'Check-in / check-out attendance with lateness flags',
      'Leave types, balances and approval workflows',
      'Company holiday calendar the payroll trusts',
    ],
    visual: <HrVisual />,
  },
  recruitment: {
    description:
      'Post jobs, track every applicant through stages, and publish a public careers page — hiring runs in the same workspace as everything else.',
    bullets: [
      'Job postings with custom hiring stages',
      'Applicant tracking from applied to offer',
      'Public careers page for your careers site',
      'Hiring pipeline visible only to managers & HR',
    ],
    visual: <RecruitmentVisual />,
  },
  finance: {
    description:
      'Invoices, expenses and multi-currency books with approval trails on every transaction — finance finally sees revenue the moment sales commits it.',
    bullets: [
      'Invoices with paid / sent / overdue status',
      'Expenses with request-and-approve trails',
      'Multi-currency amounts and monthly summaries',
      'Revenue analytics tied to your CRM pipeline',
    ],
    visual: <FinanceVisual />,
  },
  payroll: {
    description:
      'One-click payroll runs that already know attendance, leave balances and salary structures — compliant payslips for the whole company in seconds.',
    bullets: [
      'Monthly payroll runs for every active employee',
      'Attendance and leave applied automatically',
      'Adjustment-aware payslips (bonus, deduction, unpaid leave)',
      'Gross → deductions → net math done for you',
    ],
    visual: <PayrollVisual />,
  },
  documents: {
    description:
      'Real file uploads with versioning, quotas and per-project organization — the filing cabinet your organization actually keeps tidy.',
    bullets: [
      'Drag-and-drop uploads with MIME safety checks',
      'Version history on every document',
      'Per-project folders with plan-based storage quotas',
      'Register external links alongside real files',
    ],
    visual: <DocumentsVisual />,
  },
  reports: {
    description:
      'Cross-module dashboards and exportable operational reports — attendance, delivery and cash, all answering to the same underlying data.',
    bullets: [
      'Company dashboard across all nine modules',
      'Revenue, pipeline and project-health analytics',
      'Attendance and leave analytics for HR',
      'Exportable reports for board decks',
    ],
    visual: <ReportsVisual />,
  },
  meetings: {
    description:
      'A shared calendar, meeting agendas and broadcast announcements — the connective tissue that keeps a distributed organization on the same page.',
    bullets: [
      'Shared company calendar with org timezone',
      'Meetings with agendas, participants and minutes',
      'Broadcast announcements with read tracking',
      'Activity feed of everything happening',
    ],
    visual: <MeetingsVisual />,
  },
}

/** Module deep-dive rows — alternating text + mini-visual for all 9 modules. */
export function FeaturesModules() {
  return (
    <Section id="modules" className="scroll-mt-20 pt-8 sm:pt-12">
      <SectionContainer>
        <SectionHeading
          eyebrow="All modules"
          title="Every module, in depth"
          description="The nine modules that ship in every workspace — what each one does, and how it connects to the rest."
        />
        <div className="mt-16 space-y-16 sm:mt-20 sm:space-y-24">
          {MODULES.map((m, i) => {
            const deep = DEEP[m.id]
            if (!deep) return null
            const Icon = ICONS[m.icon] ?? KanbanSquare
            return (
              <div
                key={m.id}
                id={`module-${m.id}`}
                className="grid scroll-mt-28 items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <Reveal className={cn(i % 2 === 1 && 'lg:order-2')}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-accent text-accent-foreground">
                      <Icon className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    </span>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                      {m.name}
                    </h3>
                  </div>
                  <p className="mt-4 text-pretty leading-relaxed text-muted-foreground sm:text-lg">
                    {deep.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {deep.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-3 text-sm text-foreground/90 sm:text-base"
                      >
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal delay={0.12} className={cn(i % 2 === 1 && 'lg:order-1')}>
                  {deep.visual}
                </Reveal>
              </div>
            )
          })}
        </div>
      </SectionContainer>
    </Section>
  )
}
