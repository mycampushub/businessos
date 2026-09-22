'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, HardDrive, KanbanSquare, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal, RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'
import { PLANS, type MarketingPlan } from '@/lib/site'
import { cn } from '@/lib/utils'

type Cycle = 'monthly' | 'yearly'

const FEATURED_CODES = ['FREE', 'STARTER', 'GROWTH'] as const
const WIDE_CODES = ['BUSINESS', 'ENTERPRISE'] as const

const CTA_HREF: Record<string, string> = {
  FREE: '/signup',
  STARTER: '/signup',
  GROWTH: '/signup',
  BUSINESS: '/contact',
  ENTERPRISE: '/contact',
}

const fmt = (n: number) => `৳${n.toLocaleString('en-US')}`

function perMonthPrice(plan: MarketingPlan, cycle: Cycle) {
  return cycle === 'monthly' ? plan.priceMonthly : Math.round(plan.priceYearly / 12)
}

/* --- Billing cycle toggle (Monthly / Yearly pill) --- */
function CycleToggle({ cycle, onChange }: { cycle: Cycle; onChange: (c: Cycle) => void }) {
  const reduce = useReducedMotion()
  return (
    <div
      role="group"
      aria-label="Billing cycle"
      className="inline-flex items-center rounded-full border border-border/70 bg-muted/60 p-1"
    >
      {(['monthly', 'yearly'] as const).map((c) => {
        const active = cycle === c
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={active}
            className={cn(
              'relative flex h-11 min-w-[7rem] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200 sm:min-w-[8rem] sm:px-5',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId="billing-cycle-pill"
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', bounce: 0.18, duration: 0.5 }
                }
                className="absolute inset-0 rounded-full border border-border/60 bg-card shadow-sm"
                aria-hidden
              />
            )}
            <span className="relative capitalize">{c}</span>
            {c === 'yearly' && (
              <span className="relative rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-emerald-500 dark:text-zinc-950">
                Save 15%
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* --- Animated price + billing note --- */
function PriceTag({ plan, cycle }: { plan: MarketingPlan; cycle: Cycle }) {
  const reduce = useReducedMotion()
  const price = perMonthPrice(plan, cycle)
  const note =
    plan.priceMonthly === 0
      ? 'Free forever — no card required'
      : cycle === 'monthly'
        ? 'Billed monthly · cancel anytime'
        : `${fmt(plan.priceYearly)} billed yearly · save 15%`
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="relative inline-block overflow-hidden align-baseline">
          <motion.span
            key={`${plan.code}-${cycle}`}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="block text-4xl font-semibold tracking-tight tabular-nums text-foreground"
          >
            {fmt(price)}
          </motion.span>
        </span>
        <span className="text-sm text-muted-foreground">{cycle === 'monthly' ? '/month' : '/mo'}</span>
      </p>
      <p className="mt-1.5 h-4 text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

/* --- Compact limits row (seats / projects / storage) --- */
function LimitsRow({ plan }: { plan: MarketingPlan }) {
  const limits = [
    { icon: Users, label: plan.seatLimit },
    { icon: KanbanSquare, label: plan.projectLimit },
    { icon: HardDrive, label: plan.storageGb },
  ]
  return (
    <div className="mt-5 grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      {limits.map((l) => (
        <div key={l.label} className="flex flex-col items-center gap-1 text-center">
          <l.icon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="text-xs font-medium leading-tight text-foreground">{l.label}</span>
        </div>
      ))}
    </div>
  )
}

function FeatureList({
  plan,
  className,
}: {
  plan: MarketingPlan
  className?: string
}) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {plan.features.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          {f}
        </li>
      ))}
    </ul>
  )
}

function PlanCta({ plan, variant }: { plan: MarketingPlan; variant: 'default' | 'outline' }) {
  return (
    <Button asChild variant={variant} className="group mt-7 w-full">
      <Link href={CTA_HREF[plan.code] ?? '/signup'}>
        {plan.cta}
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    </Button>
  )
}

/* --- Featured vertical card (Free / Starter / Growth) --- */
function PlanCard({ plan, cycle }: { plan: MarketingPlan; cycle: Cycle }) {
  return (
    <div
      className={cn(
        'relative flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm sm:p-7',
        plan.highlight
          ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
          : 'border-border/70'
      )}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm dark:bg-emerald-500 dark:text-zinc-950">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
      <div className="mt-5">
        <PriceTag plan={plan} cycle={cycle} />
      </div>
      <LimitsRow plan={plan} />
      <div className="mt-5 flex-1">
        <FeatureList plan={plan} />
      </div>
      <PlanCta plan={plan} variant={plan.highlight ? 'default' : 'outline'} />
    </div>
  )
}

/* --- Wide horizontal card (Business / Enterprise) --- */
function WidePlanCard({ plan, cycle }: { plan: MarketingPlan; cycle: Cycle }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-6 shadow-sm sm:p-7 lg:flex-row lg:items-start lg:gap-10">
      <div className="flex-1">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
        <div className="mt-5">
          <PriceTag plan={plan} cycle={cycle} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[plan.seatLimit, plan.projectLimit, plan.storageGb].map((l) => (
            <span
              key={l}
              className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
            >
              {l}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-col lg:mt-0 lg:w-64 xl:w-72">
        <FeatureList plan={plan} className="space-y-2" />
        <PlanCta plan={plan} variant="outline" />
      </div>
    </div>
  )
}

/** Interactive plan grid with monthly/yearly billing toggle. Client island. */
export function PricingPlans() {
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const featured = PLANS.filter((p) =>
    (FEATURED_CODES as readonly string[]).includes(p.code)
  )
  const wide = PLANS.filter((p) => (WIDE_CODES as readonly string[]).includes(p.code))

  return (
    <section id="plans" className="relative scroll-mt-20 py-16 sm:py-20 lg:py-24">
      <SectionContainer>
        <SectionHeading
          eyebrow="Plans"
          title="Pick the plan that fits"
          description="All five plans share the same nine modules — the difference is scale and governance. Change plans any time from Billing & Plan."
        />

        <Reveal className="mt-8 flex flex-col items-center gap-3">
          <CycleToggle cycle={cycle} onChange={setCycle} />
          <p className="text-sm text-muted-foreground">
            All prices in Taka (৳ BDT) · every paid plan starts with a 14-day free trial
          </p>
        </Reveal>

        <RevealGroup className="mt-10 grid gap-6 md:grid-cols-3" stagger={0.08}>
          {featured.map((plan) => (
            <RevealItem key={plan.code} className="h-full">
              <PlanCard plan={plan} cycle={cycle} />
            </RevealItem>
          ))}
        </RevealGroup>

        <RevealGroup className="mt-6 grid gap-6 lg:grid-cols-2" stagger={0.08}>
          {wide.map((plan) => (
            <RevealItem key={plan.code} className="h-full">
              <WidePlanCard plan={plan} cycle={cycle} />
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionContainer>
    </section>
  )
}
