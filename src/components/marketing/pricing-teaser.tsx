import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'
import { PLANS } from '@/lib/site'
import { cn } from '@/lib/utils'

/** Compact plan preview on the landing page — the full table lives on /pricing. */
const TEASER_PLANS = PLANS.filter((p) => ['FREE', 'STARTER', 'GROWTH'].includes(p.code))

export function PricingTeaser() {
  return (
    <Section id="pricing">
      <SectionContainer>
        <SectionHeading
          eyebrow="Pricing"
          title="Honest pricing, in Taka"
          description="Start free forever. Upgrade when your org grows — pay monthly or yearly (save 15%) via bKash, Nagad or bank transfer."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TEASER_PLANS.map((plan, i) => (
            <Reveal key={plan.code} delay={i * 0.1}>
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:p-7',
                  plan.highlight
                    ? 'border-emerald-500/50 shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-border/70'
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums text-foreground">
                    ৳{plan.priceMonthly.toLocaleString('en-US')}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={plan.highlight ? 'default' : 'outline'}
                  className="mt-7 w-full"
                >
                  <Link href={plan.code === 'FREE' ? '/signup' : '/pricing'}>{plan.cta}</Link>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8 text-center">
          <Link
            href="/pricing"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Compare all five plans, including Business & Enterprise
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}
