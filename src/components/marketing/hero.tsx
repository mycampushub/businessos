'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeroMockup } from './hero-mockup'

export function Hero() {
  const reduce = useReducedMotion()
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] as const },
  })

  return (
    <section className="relative overflow-hidden">
      {/* backdrop */}
      <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
      <div aria-hidden className="animate-aurora absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10" />
      <div aria-hidden className="animate-aurora-slow absolute -right-40 top-24 size-96 rounded-full bg-teal-300/10 blur-3xl dark:bg-teal-400/10" />

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-14 text-center sm:px-6 sm:pt-20 lg:px-8">
        {/* announcement */}
        <motion.div {...rise(0)}>
          <Link
            href="/features"
            className="group inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 py-1.5 pl-2 pr-3.5 text-xs font-medium text-emerald-700 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-emerald-500 dark:text-zinc-950">
              <Sparkles className="size-3" />
              New
            </span>
            Payroll automation is live
            <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        {/* headline */}
        <motion.h1
          {...rise(0.1)}
          className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem] lg:leading-[1.06]"
        >
          Run your entire organization from{' '}
          <span className="text-gradient">one workspace</span>
        </motion.h1>

        <motion.p
          {...rise(0.2)}
          className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          OrgOS unifies projects, people, clients, recruitment and finance into a single
          connected system — so every team works from the same truth, and nothing
          falls through the cracks.
        </motion.p>

        {/* CTAs */}
        <motion.div {...rise(0.3)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="group h-12 bg-emerald-600 px-7 text-base font-medium shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950">
            <Link href="/signup">
              Start your free trial
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base font-medium">
            <Link href="/features">Explore the product</Link>
          </Button>
        </motion.div>

        <motion.p {...rise(0.38)} className="mt-5 text-xs text-muted-foreground">
          Free 14-day trial · No credit card · Live in two minutes
        </motion.p>

        {/* product */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 44, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.45, ease: [0.21, 0.47, 0.32, 0.98] }}
        >
          <HeroMockup />
        </motion.div>
      </div>
    </section>
  )
}
