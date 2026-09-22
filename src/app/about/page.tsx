import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Globe2, MapPin } from 'lucide-react'
import { MarketingShell } from '@/components/marketing/shell'
import { StatsBand } from '@/components/marketing/stats-band'
import { CtaBanner } from '@/components/marketing/cta'
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/reveal'
import { Section, SectionContainer } from '@/components/marketing/sections'
import { AboutTimeline } from '@/components/marketing/about-timeline'
import { AboutValues } from '@/components/marketing/about-values'
import { AboutTeam } from '@/components/marketing/about-team'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About',
  description:
    'OrgOS is built by OrgOS Technologies Ltd. in Dhaka, Bangladesh — on a mission to end tool sprawl and give every organization one source of truth. Meet the team and read our story.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <MarketingShell>
      {/* Hero — same backdrop pattern as the landing hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
        <div
          aria-hidden
          className="animate-aurora absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
        />
        <div
          aria-hidden
          className="animate-aurora-slow absolute -right-40 top-24 size-96 rounded-full bg-teal-300/10 blur-3xl dark:bg-teal-400/10"
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              Our story
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="mx-auto mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl lg:leading-[1.06]">
              We&apos;re building the operating system every organization deserves
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              OrgOS Technologies is a Dhaka-born company on one mission: replace the pile of
              disconnected tools teams tolerate today with a single, honest workspace. Since{' '}
              {SITE.founded}, we&apos;ve grown from a frustration into the system more than 1,200
              organizations run on.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Mission pull quote */}
      <Section className="py-16 sm:py-20">
        <SectionContainer className="max-w-4xl">
          <Reveal>
            <figure className="relative text-center">
              <span
                aria-hidden
                className="font-serif text-7xl leading-none text-emerald-600/25 dark:text-emerald-400/25"
              >
                &ldquo;
              </span>
              <blockquote className="-mt-4 text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem] lg:leading-[1.2]">
                Running an organization shouldn&apos;t require six subscriptions and a
                spreadsheet to hold them together. We&apos;re ending tool sprawl — one login,
                one data model, one source of truth — so teams spend their time on the work,
                not the wiring.
              </blockquote>
              <figcaption className="mt-6 text-sm text-muted-foreground">
                The OrgOS mission, written on a whiteboard in {SITE.founded} — still true today.
              </figcaption>
            </figure>
          </Reveal>
        </SectionContainer>
      </Section>

      <StatsBand />

      <AboutTimeline />

      <AboutValues />

      <AboutTeam />

      {/* Culture & locations strip */}
      <Section className="bg-muted/40">
        <SectionContainer>
          <RevealGroup className="grid gap-6 md:grid-cols-3">
            <RevealItem>
              <article className="h-full rounded-xl border border-border/70 bg-card p-6 shadow-sm">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <MapPin className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  Dhaka HQ
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {SITE.address} — one floor of engineers, designers and a very loud espresso
                  machine.
                </p>
              </article>
            </RevealItem>
            <RevealItem>
              <article className="h-full rounded-xl border border-border/70 bg-card p-6 shadow-sm">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Globe2 className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  Remote-first
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Half the team works remotely across three timezones. Async by default, one
                  weekly all-hands, documentation over meetings.
                </p>
              </article>
            </RevealItem>
            <RevealItem>
              <article className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-6 shadow-sm">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Globe2 className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  We&apos;re hiring
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Engineers, designers and customer-success people who like shipping weekly and
                  owning outcomes.
                </p>
                <Link
                  href="/contact"
                  className="group mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  Say hello
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </article>
            </RevealItem>
          </RevealGroup>
        </SectionContainer>
      </Section>

      <CtaBanner
        title="Come build the future of work with us"
        description="Whether you want to run your organization on OrgOS or help us build it — there's a seat at the table."
        primaryLabel="Join the team"
        primaryHref="/contact"
        secondaryLabel="See the product"
        secondaryHref="/features"
      />
    </MarketingShell>
  )
}
