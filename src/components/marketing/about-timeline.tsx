import { Reveal, RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const MILESTONES = [
  {
    year: '2023',
    title: 'Founded in Dhaka',
    body: 'We watched a 40-person agency juggle six tools to deliver one client project — tasks here, people there, invoices somewhere else. We started building the workspace we wished existed: projects, people and clients in one place.',
    tag: 'The itch',
  },
  {
    year: '2024',
    title: 'First 100 organizations',
    body: 'Projects, tasks and the CRM pipeline shipped together, sharing one data model. Teams started cancelling their first subscriptions — and telling their friends.',
    tag: 'Traction',
  },
  {
    year: '2025',
    title: 'The people modules',
    body: 'HR records, attendance, payroll and recruitment arrived — with timezone-correct operations for teams working across Dhaka, Dubai and Berlin. Leave stopped getting lost in WhatsApp.',
    tag: 'Depth',
  },
  {
    year: '2026',
    title: '1,200+ organizations',
    body: 'Platform billing went live with bKash, Nagad and bank transfers, Growth and Business plans scaled to 200-member orgs, and audit-grade governance landed. The operating system now runs itself — and 1,200+ orgs run on it.',
    tag: 'Scale',
  },
]

/**
 * Vertical story timeline (2023 → 2026). Left rail with dots, cards to the
 * right; each entry scrolls in with a stagger.
 */
export function AboutTimeline() {
  return (
    <Section id="story" className="scroll-mt-24">
      <SectionContainer className="max-w-4xl">
        <SectionHeading
          eyebrow="Our story"
          title="Four years, one obsession"
          description="OrgOS didn't start as a product roadmap. It started as a frustration in a Dhaka office — and compounded from there."
        />

        <RevealGroup className="mt-12">
          <ol className="relative space-y-8 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-border sm:space-y-10">
            {MILESTONES.map((m) => (
              <RevealItem key={m.year} className="relative pl-12 sm:pl-14">
                <li>
                  {/* dot */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-6 flex size-[27px] items-center justify-center rounded-full border border-emerald-600/30 bg-background dark:border-emerald-400/30"
                  >
                    <span className="size-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  </span>

                  <article className="rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:p-6">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {m.year}
                      </span>
                      <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                        {m.tag}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                      {m.title}
                    </h3>
                    <p className="mt-2 text-pretty text-[15px] leading-relaxed text-muted-foreground">
                      {m.body}
                    </p>
                  </article>
                </li>
              </RevealItem>
            ))}
          </ol>
        </RevealGroup>

        <Reveal className="mt-10 text-center">
          <p className="text-sm text-muted-foreground">
            We&apos;re still early in the story we actually want to tell — a workspace for every
            organization, everywhere.
          </p>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}
