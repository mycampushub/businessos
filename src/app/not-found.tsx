import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, Compass, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarketingShell } from '@/components/marketing/shell'
import { Reveal } from '@/components/marketing/reveal'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

const SUGGESTIONS = [
  { href: '/', label: 'Home', description: 'Back to the landing page' },
  { href: '/features', label: 'Product', description: 'Explore all nine modules' },
  { href: '/pricing', label: 'Pricing', description: 'Plans from ৳0, in Taka' },
  { href: '/contact', label: 'Contact', description: 'Talk to a human' },
]

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
        <div
          aria-hidden
          className="animate-aurora absolute -top-24 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32">
          <Reveal>
            <p className="font-mono text-sm font-semibold tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
              404
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              This page took an unplanned leave
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              The link you followed doesn&apos;t exist — or the page moved to a
              different workspace. Let&apos;s get you back on track.
            </p>
          </Reveal>

          <Reveal delay={0.12} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="group h-12 bg-emerald-600 px-7 text-base font-medium shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400">
              <Link href="/">
                <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                Back to home
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base font-medium">
              <Link href="/signin">
                <Search className="size-4" />
                Open workspace
              </Link>
            </Button>
          </Reveal>

          <Reveal delay={0.22} className="mt-14 w-full">
            <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Compass className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Popular destinations
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="group flex items-center justify-between rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        {s.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {s.description}
                      </span>
                    </span>
                    <ArrowLeft className="size-4 shrink-0 rotate-180 text-muted-foreground/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  )
}
