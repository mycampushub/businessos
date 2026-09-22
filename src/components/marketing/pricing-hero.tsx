import { Reveal } from './reveal'

/**
 * Pricing page hero — compressed sibling of the landing hero
 * (grid + emerald aurora backdrop), no product mockup.
 */
export function PricingHero() {
  return (
    <section className="relative overflow-hidden">
      {/* backdrop */}
      <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
      <div
        aria-hidden
        className="animate-aurora absolute -top-32 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
      />
      <div
        aria-hidden
        className="animate-aurora-slow absolute -left-40 top-16 size-80 rounded-full bg-teal-300/10 blur-3xl dark:bg-teal-400/10"
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Pricing
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
            Pricing that scales with <span className="text-gradient">your organization</span>
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Start free forever and upgrade only as you grow. Pay monthly for flexibility, or yearly
            and save 15% — in Taka, via bKash, Nagad or bank transfer.
          </p>
        </Reveal>

        <Reveal
          delay={0.24}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-muted-foreground"
        >
          {['No credit card', 'Cancel anytime', 'Same-day activation'].map((item, i) => (
            <span key={item} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden className="size-1 rounded-full bg-border" />}
              {item}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
