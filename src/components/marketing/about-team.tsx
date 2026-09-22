import { RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const TEAM = [
  {
    name: 'Arif Chowdhury',
    role: 'Chief Executive Officer',
    oneLiner: 'Former ops lead who ran 60-person delivery orgs on spreadsheets — now building the system he wished he had.',
    initials: 'AC',
    tone: 'bg-emerald-600',
  },
  {
    name: 'Sumaiya Rahman',
    role: 'Chief Technology Officer',
    oneLiner: 'Distributed-systems engineer obsessed with making one workspace scale from 5 people to 5,000.',
    initials: 'SR',
    tone: 'bg-teal-600',
  },
  {
    name: 'Tanvir Hasan',
    role: 'Head of Product',
    oneLiner: 'Talks to customers every single day, then ships the roadmap they actually asked for.',
    initials: 'TH',
    tone: 'bg-amber-600',
  },
  {
    name: 'Nabila Karim',
    role: 'Head of Design',
    oneLiner: 'Believes enterprise software can be beautiful — and proves it one module at a time.',
    initials: 'NK',
    tone: 'bg-emerald-700',
  },
  {
    name: 'Imran Hossain',
    role: 'Engineering Lead',
    oneLiner: 'Guards uptime, latency and the weekly release cadence — in exactly that order.',
    initials: 'IH',
    tone: 'bg-teal-700',
  },
  {
    name: 'Rifat Ahmed',
    role: 'Customer Success Lead',
    oneLiner: 'Onboards new organizations personally and answers support himself. Average first reply: under a day.',
    initials: 'RA',
    tone: 'bg-zinc-600',
  },
]

/** Six-person team grid with initials avatars (same pattern as testimonials). */
export function AboutTeam() {
  return (
    <Section id="team" className="scroll-mt-24">
      <SectionContainer>
        <SectionHeading
          eyebrow="The team"
          title="Small team, whole system"
          description="Six people in Dhaka and three timezones, shipping an operating system used by 1,200+ organizations."
        />
        <RevealGroup className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((p) => (
            <RevealItem key={p.name}>
              <article className="h-full rounded-xl border border-border/70 bg-card p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <span
                  aria-hidden
                  className={`mx-auto flex size-16 items-center justify-center rounded-full text-lg font-semibold text-white ${p.tone}`}
                >
                  {p.initials}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {p.name}
                </h3>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  {p.role}
                </p>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {p.oneLiner}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionContainer>
    </Section>
  )
}
