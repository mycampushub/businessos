import {
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  Search,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

/* Micro UI bits — every piece is static, server-rendered markup. */

function Sidebar() {
  const items = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: KanbanSquare, label: 'Projects' },
    { icon: Target, label: 'CRM' },
    { icon: Users, label: 'HR' },
    { icon: CreditCard, label: 'Finance' },
    { icon: CalendarClock, label: 'Meetings' },
    { icon: FolderKanban, label: 'Documents' },
  ]
  return (
    <aside className="hidden w-40 shrink-0 flex-col bg-zinc-950 p-3 sm:flex lg:w-48" aria-hidden>
      <div className="flex items-center gap-2 px-2 py-2.5">
        <svg viewBox="0 0 32 32" className="size-6 shrink-0">
          <rect x="1" y="1" width="30" height="30" rx="8" className="fill-emerald-500" />
          <g className="fill-zinc-950">
            <rect x="7" y="9" width="7" height="4" rx="1.5" />
            <rect x="7" y="15" width="11" height="4" rx="1.5" opacity="0.85" />
            <rect x="7" y="21" width="15" height="4" rx="1.5" opacity="0.7" />
            <circle cx="23.5" cy="11" r="2.4" />
          </g>
        </svg>
        <span className="text-sm font-semibold text-white">OrgOS</span>
      </div>
      <nav className="mt-3 space-y-0.5">
        {items.map((item) => (
          <span
            key={item.label}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
              item.active ? 'bg-white/10 text-white' : 'text-zinc-500'
            }`}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </span>
        ))}
      </nav>
      <div className="mt-auto rounded-lg bg-white/5 p-2.5">
        <p className="text-[10px] font-medium text-zinc-400">Meridian Labs</p>
        <p className="mt-0.5 text-[10px] text-emerald-400">Growth · 12 seats</p>
      </div>
    </aside>
  )
}

function StatCard({ label, value, delta, up = true }: { label: string; value: string; delta: string; up?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[10px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{value}</p>
      <p className={`mt-0.5 flex items-center gap-1 text-[10px] font-medium ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
        <TrendingUp className={`size-3 ${up ? '' : 'rotate-180'}`} />
        {delta}
      </p>
    </div>
  )
}

function KanbanMini() {
  const cols = [
    {
      title: 'In progress',
      tone: 'bg-amber-400',
      cards: [
        { title: 'Payments integration', meta: 'HIGH · due Fri', progress: 65 },
        { title: 'Migration dry-run', meta: 'MED · due Mon', progress: 30 },
      ],
    },
    {
      title: 'In review',
      tone: 'bg-sky-400',
      cards: [
        { title: 'Checkout redesign', meta: 'HIGH · 2 comments', progress: 90 },
        { title: 'SEO audit fixes', meta: 'LOW · QA passed', progress: 100 },
      ],
    },
  ]
  return (
    <div className="flex gap-3 overflow-hidden">
      {cols.map((col) => (
        <div key={col.title} className="w-1/2 shrink-0 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800/60">
          <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
            <span className={`size-1.5 rounded-full ${col.tone}`} />
            {col.title}
          </p>
          <div className="mt-2 space-y-2">
            {col.cards.map((card) => (
              <div key={card.title} className="rounded-md border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-[11px] font-medium leading-tight text-zinc-800 dark:text-zinc-200">{card.title}</p>
                <p className="mt-1 text-[9px] font-medium tracking-wide text-zinc-400">{card.meta}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{ width: `${card.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartMini() {
  const bars = [42, 68, 51, 82, 64, 90, 74]
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">Revenue · this month</p>
        <BarChart3 className="size-3 text-zinc-400" />
      </div>
      <div className="mt-3 flex h-24 items-end gap-1.5">
        {bars.map((h, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={`w-full rounded-sm ${i === 5 ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">৳1,245,800</p>
      <p className="text-[10px] font-medium text-emerald-600">+18.2% vs last month</p>
    </div>
  )
}

function FloatingCard({
  className,
  animation,
  icon,
  title,
  body,
}: {
  className: string
  animation: string
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div
      aria-hidden
      className={`absolute z-10 hidden rounded-xl border border-zinc-200/80 bg-white/95 p-3.5 shadow-xl shadow-zinc-950/10 backdrop-blur lg:block dark:border-zinc-700/60 dark:bg-zinc-900/95 dark:shadow-black/40 ${animation} ${className}`}
    >
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <p className="text-xs font-semibold text-zinc-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{body}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Full product mockup: browser window framing a miniature OrgOS workspace
 * (dark sidebar, stat cards, kanban, chart) plus floating live-activity cards.
 */
export function HeroMockup() {
  return (
    <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16" aria-hidden role="presentation">
      {/* glow */}
      <div className="absolute -inset-x-8 -top-10 bottom-8 -z-10 bg-gradient-to-tr from-emerald-400/25 via-teal-300/15 to-transparent blur-3xl dark:from-emerald-500/25" />

      {/* floating live-activity cards */}
      <FloatingCard
        className="-right-6 -top-8 xl:-right-12"
        animation="animate-float"
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
            <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />
          </span>
        }
        title="Leave request approved"
        body="Nusrat's casual leave · auto-credited to payroll"
      />
      <FloatingCard
        className="-left-6 bottom-10 xl:-left-12"
        animation="animate-float-delayed"
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-400/15">
            <Target className="size-4.5 text-teal-600 dark:text-teal-400" />
          </span>
        }
        title="Deal won — ৳245,000"
        body="GreenGrocer renewal moved to Won"
      />

      {/* browser window */}
      <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-2xl shadow-zinc-950/10 dark:border-zinc-700/60 dark:bg-zinc-900 dark:shadow-black/50">
        {/* chrome bar */}
        <div className="flex items-center gap-3 border-b border-zinc-200/80 bg-zinc-50 px-4 py-2.5 dark:border-zinc-700/60 dark:bg-zinc-800/80">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="mx-auto flex w-full max-w-xs items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            app.orgos.dev
          </span>
          <span className="w-10" />
        </div>

        {/* app body */}
        <div className="flex h-[400px] sm:h-[430px]">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
            {/* topbar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800">
                <Search className="size-3.5 shrink-0 text-zinc-400" />
                <span className="hidden truncate text-[11px] text-zinc-400 sm:block">Search tasks, deals, people…</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="relative">
                  <Bell className="size-4 text-zinc-400" />
                  <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-rose-500" />
                </span>
                <span className="flex -space-x-1.5">
                  {['MS', 'FK', 'RA'].map((initials, i) => (
                    <span
                      key={initials}
                      className={`flex size-6 items-center justify-center rounded-full border border-white text-[9px] font-semibold text-white dark:border-zinc-900 ${
                        ['bg-emerald-500', 'bg-teal-500', 'bg-amber-500'][i]
                      }`}
                    >
                      {initials}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* stat row */}
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <StatCard label="Active projects" value="12" delta="+3 this month" />
              <StatCard label="Tasks completed" value="284" delta="+12.4%" />
              <StatCard label="Pipeline value" value="৳4.6M" delta="+8.1%" />
            </div>

            {/* board + chart */}
            <div className="mt-3 grid min-h-0 flex-1 grid-cols-5 gap-3">
              <div className="col-span-3 min-w-0">
                <p className="mb-2 px-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                  GreenGrocer E-commerce · Sprint 14
                </p>
                <KanbanMini />
              </div>
              <div className="col-span-2 min-w-0">
                <ChartMini />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
