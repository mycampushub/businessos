import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal } from './reveal'

/**
 * Product page hero — same backdrop language as the landing hero
 * (grid + emerald aurora), compressed to a single viewport of intent.
 */
export function FeaturesHero() {
  return (
    <section className="relative overflow-hidden">
      {/* backdrop */}
      <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
      <div
        aria-hidden
        className="animate-aurora absolute -top-32 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
      />
      <div
        aria-hidden
        className="animate-aurora-slow absolute -right-40 top-16 size-80 rounded-full bg-teal-300/10 blur-3xl dark:bg-teal-400/10"
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            The product
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
            Everything your organization runs on,{' '}
            <span className="text-gradient">in one place</span>
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Nine deeply-integrated modules — projects, CRM, HR, recruitment, payroll, finance,
            documents, reports and meetings — sharing one set of people, permissions and truth.
          </p>
        </Reveal>

        <Reveal
          delay={0.24}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button
            asChild
            size="lg"
            className="group h-12 bg-emerald-600 px-7 text-base font-medium shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
          >
            <Link href="/signup">
              Start your free trial
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base font-medium">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </Reveal>

        <Reveal delay={0.3}>
          <p className="mt-5 text-xs text-muted-foreground">
            Free 14-day trial · No credit card · All modules unlocked
          </p>
        </Reveal>
      </div>
    </section>
  )
}
