import {
  Activity,
  Bell,
  FileSpreadsheet,
  Globe,
  Megaphone,
  Moon,
  Search,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { Reveal, RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const NICETIES = [
  { icon: Search, title: 'Global search', body: 'Find any task, client or person in one keystroke' },
  { icon: Bell, title: 'Notifications', body: 'Mentions, assignments and approvals' },
  { icon: Activity, title: 'Activity feed', body: 'Every change across the org, in one stream' },
  { icon: Megaphone, title: 'Announcements', body: 'Broadcasts that reach the whole company' },
  { icon: Moon, title: 'Dark mode', body: 'System-aware, easy on the late-shift eyes' },
  { icon: Globe, title: 'Timezone-aware', body: 'Scheduling in everyone’s local time' },
  { icon: Smartphone, title: 'Mobile responsive', body: 'The full workspace in your pocket' },
  { icon: FileSpreadsheet, title: 'CSV import', body: 'Bring clients and employees in bulk' },
] as const

const PAYMENT_METHODS = ['bKash', 'Nagad', 'Bank transfer'] as const

/** Platform niceties strip + local payments callout. */
export function FeaturesExtras() {
  return (
    <Section>
      <SectionContainer>
        <SectionHeading
          eyebrow="Details that matter"
          title="A platform that feels finished"
          description="The small things are what make a system get used — so we sweat them."
        />

        <RevealGroup
          className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4"
          stagger={0.05}
        >
          {NICETIES.map((n) => (
            <RevealItem key={n.title} className="h-full">
              <div className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors duration-300 hover:border-emerald-500/40">
                <n.icon className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-foreground">{n.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* Local payments callout */}
        <Reveal className="mt-10">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 dark:bg-emerald-500/[0.06] sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground">
                  <Wallet className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  Priced for Bangladesh
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Every plan is billed in Taka (৳ BDT) — no exchange-rate surprises. Pay via bKash,
                  Nagad or bank transfer, and request upgrades right from Billing &amp; Plan inside
                  your workspace. Our team activates them the same working day.
                </p>
              </div>
              <ul className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                {PAYMENT_METHODS.map((method) => (
                  <li
                    key={method}
                    className="rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-sm"
                  >
                    {method}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}
