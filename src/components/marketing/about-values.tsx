import { Database, Hammer, Rocket, Scale } from 'lucide-react'
import { RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const VALUES = [
  {
    icon: Hammer,
    title: 'Craft over clutter',
    body: 'Every screen earns its pixels. We would rather ship fewer, deeper features than a thousand half-finished toggles.',
  },
  {
    icon: Scale,
    title: 'Honest pricing',
    body: 'One pricing page, real numbers in BDT, no per-module upsells. If a plan is wrong for you, we say so before you pay.',
  },
  {
    icon: Database,
    title: 'Own your data',
    body: 'Your records are yours — export everything, any time, in standard formats. We never hold a business hostage to a spreadsheet export fee.',
  },
  {
    icon: Rocket,
    title: 'Ship weekly',
    body: 'A new release goes out every week. Feedback on a Monday routinely becomes a shipped feature before the month ends.',
  },
]

/** Four-value grid with icons. */
export function AboutValues() {
  return (
    <Section className="bg-muted/40">
      <SectionContainer>
        <SectionHeading
          eyebrow="What we believe"
          title="Four rules we don't break"
          description="They decide what we build, what we charge and how we treat the people who trust us with their operations."
        />
        <RevealGroup className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <RevealItem key={v.title}>
              <article className="h-full rounded-xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <v.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {v.title}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {v.body}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionContainer>
    </Section>
  )
}
