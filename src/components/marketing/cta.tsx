import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal } from './reveal'

/**
 * Shared conversion banner — dark ink panel with drifting aurora glows.
 * Used as the closing section of every marketing page.
 */
export function CtaBanner({
  title = 'Run your organization on OrgOS',
  description = 'Create a workspace in minutes. Your first 14 days of any paid plan are on us — no card required.',
  primaryLabel = 'Start your free trial',
  primaryHref = '/signup',
  secondaryLabel = 'Talk to sales',
  secondaryHref = '/contact',
}: {
  title?: string
  description?: string
  primaryLabel?: string
  primaryHref?: string
  secondaryLabel?: string
  secondaryHref?: string
}) {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div className="absolute inset-0 ink-section" aria-hidden />
      {/* aurora glows */}
      <div
        aria-hidden
        className="animate-aurora absolute -left-24 top-1/4 size-96 rounded-full bg-emerald-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-aurora-slow absolute -right-24 bottom-0 size-96 rounded-full bg-teal-400/15 blur-3xl"
      />
      <div aria-hidden className="bg-grid absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
      />
      <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-300 sm:text-lg">
          {description}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="group h-12 bg-emerald-500 px-7 text-base font-medium text-zinc-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400">
            <Link href={primaryHref}>
              {primaryLabel}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 border-white/20 bg-transparent px-7 text-base font-medium text-white hover:bg-white/10 hover:text-white"
          >
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          14-day free trial · No credit card · Cancel anytime
        </p>
      </Reveal>
    </section>
  )
}
