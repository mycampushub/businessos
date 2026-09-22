import { CalendarCheck2, RotateCcw, ShieldCheck, Smartphone, Wallet, Landmark } from 'lucide-react'
import { Reveal } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const METHODS = [
  {
    name: 'bKash',
    detail: 'Send from the bKash app with your request reference',
    icon: Smartphone,
  },
  {
    name: 'Nagad',
    detail: 'Pay from your Nagad wallet, same-day activation',
    icon: Wallet,
  },
  {
    name: 'Bank transfer',
    detail: 'Direct deposit with your invoice reference',
    icon: Landmark,
  },
] as const

/** Payment methods band — mirrors the real workspace billing flow. */
export function PaymentMethodsBand() {
  return (
    <Section className="pt-2 sm:pt-4 lg:pt-6">
      <SectionContainer>
        <Reveal>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 dark:bg-emerald-500/[0.06] sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground">
                  <Wallet
                    className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                  Pay the way you already pay
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  All plans are billed in Taka (৳ BDT) via bKash, Nagad or bank transfer. Request an
                  upgrade from Billing &amp; Plan inside your workspace; our team activates it the
                  same working day.
                </p>
              </div>
              <ul className="grid flex-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
                {METHODS.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
                      aria-hidden
                    >
                      <m.icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{m.name}</p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {m.detail}
                      </p>
                    </div>
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

const REFUND_POINTS = [
  {
    icon: ShieldCheck,
    title: 'You never pay blind',
    body: 'Every paid plan starts with a 14-day free trial — no card required. If OrgOS is not for you, simply do nothing when the trial ends.',
  },
  {
    icon: CalendarCheck2,
    title: '7-day refund window',
    body: 'If a charge does not work out, request a refund within 7 days of the payment and we return it in full — provided the plan has not been actively used in that period.',
  },
  {
    icon: RotateCcw,
    title: 'Pro-rated downgrades',
    body: 'On yearly plans, downgrading mid-term is fair: unused months are credited toward your next invoice or final settlement.',
  },
] as const

/** Honest refund policy — linked from the site footer (#refund). */
export function RefundPolicy() {
  return (
    <Section id="refund" className="scroll-mt-20">
      <SectionContainer className="max-w-5xl">
        <SectionHeading
          eyebrow="Refund policy"
          title="Short, because the trial does the talking"
          description="No fine print, no phone calls. Three sentences are all it takes."
        />
        <Reveal className="mt-10">
          <ul className="grid gap-4 md:grid-cols-3">
            {REFUND_POINTS.map((p) => (
              <li
                key={p.title}
                className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-6 shadow-sm"
              >
                <span
                  className="flex size-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10"
                  aria-hidden
                >
                  <p.icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}
