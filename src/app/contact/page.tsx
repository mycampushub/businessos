import type { Metadata } from 'next'
import { Clock3, Headset, Mail, MapPin, MessageSquareText, Phone, ShieldCheck, Users } from 'lucide-react'
import { MarketingShell } from '@/components/marketing/shell'
import { ContactForm } from '@/components/marketing/contact-form'
import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionContainer } from '@/components/marketing/sections'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Talk to the OrgOS team about sales, support, partnerships or feedback. We reply within one business day — from our Dhaka HQ, in English or Bangla.',
  alternates: { canonical: '/contact' },
}

const CHANNELS = [
  {
    icon: Users,
    label: 'Sales & plans',
    value: SITE.salesEmail,
    href: `mailto:${SITE.salesEmail}`,
  },
  {
    icon: Headset,
    label: 'Product support',
    value: SITE.supportEmail,
    href: `mailto:${SITE.supportEmail}`,
  },
  {
    icon: Phone,
    label: 'Phone',
    value: SITE.phone,
    href: `tel:${SITE.phone.replace(/[^+\d]/g, '')}`,
  },
  {
    icon: MapPin,
    label: 'Office',
    value: `${SITE.address}`,
    href: undefined as string | undefined,
  },
] as const

export default function ContactPage() {
  return (
    <MarketingShell>
      {/* Hero-lite */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
        <div
          aria-hidden
          className="animate-aurora absolute -top-32 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-20 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              Contact
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Talk to a human
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Sales questions, product support, partnerships or plain feedback — a real person
              reads every message, and we reply within one business day.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Form + info columns */}
      <Section className="pb-20 pt-4 sm:pt-6">
        <SectionContainer>
          <div className="grid gap-10 lg:grid-cols-5 lg:gap-12">
            <Reveal className="lg:col-span-3" delay={0.05}>
              <ContactForm />
            </Reveal>

            <Reveal className="lg:col-span-2" delay={0.15}>
              <div className="flex h-full flex-col gap-6">
                {/* Direct channels */}
                <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Reach us directly
                  </h2>
                  <ul className="mt-5 space-y-5">
                    {CHANNELS.map((c) => (
                      <li key={c.label} className="flex items-start gap-4">
                        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <c.icon className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {c.label}
                          </p>
                          {c.href ? (
                            <a
                              href={c.href}
                              className="mt-0.5 block break-words text-[15px] font-medium text-foreground underline-offset-4 transition-colors hover:text-emerald-700 hover:underline dark:hover:text-emerald-400"
                            >
                              {c.value}
                            </a>
                          ) : (
                            <p className="mt-0.5 text-[15px] font-medium text-foreground">
                              {c.value}
                              <span className="block text-sm font-normal text-muted-foreground">
                                Dhaka, Bangladesh
                              </span>
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Response-time note */}
                <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                      <Clock3 className="size-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Within one business day
                      </h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        We work Saturday to Thursday, 9:00–18:00 (GMT+6). Support in English or
                        Bangla — your choice.
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 border-t border-border/60 pt-5 text-sm leading-relaxed text-muted-foreground">
                    Prefer email?{' '}
                    <a
                      href={`mailto:${SITE.contactEmail}`}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
                    >
                      <Mail className="size-3.5" aria-hidden />
                      {SITE.contactEmail}
                    </a>
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </SectionContainer>
      </Section>

      {/* Slim trust strip — the form is the CTA, so keep this quiet */}
      <section aria-label="Why teams trust OrgOS" className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-x-8 gap-y-3 px-4 py-8 text-center sm:flex-row sm:px-6 lg:px-8">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            1,200+ organizations on board
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            99.98% uptime, last 12 months
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquareText className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Support in English & Bangla
          </p>
        </div>
      </section>
    </MarketingShell>
  )
}
