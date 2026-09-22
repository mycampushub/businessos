import { Star } from 'lucide-react'
import { Reveal, RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const TESTIMONIALS = [
  {
    quote:
      'We replaced four separate tools with OrgOS in a single afternoon. Projects, leave, payroll and our deal pipeline finally talk to each other — and our ops meetings got 30 minutes shorter.',
    name: 'Maria Santos',
    role: 'Head of Delivery, Meridian Labs',
    initials: 'MS',
    tone: 'bg-emerald-600',
  },
  {
    quote:
      'The dependency gating alone paid for the subscription. Tasks literally cannot start before their blockers finish — our go-live slipped by zero days for two quarters running.',
    name: 'Shahriar Kabir',
    role: 'COO, GreenGrocer',
    initials: 'SK',
    tone: 'bg-teal-600',
  },
  {
    quote:
      'Payroll used to take our finance team three days. With attendance and leave flowing in automatically, we run it in twenty minutes — payslips included, mistakes gone.',
    name: 'Farhan Ahmed',
    role: 'Founder & CEO, UrbanCart',
    initials: 'FA',
    tone: 'bg-amber-600',
  },
]

export function Testimonials() {
  return (
    <Section className="bg-muted/40">
      <SectionContainer>
        <SectionHeading
          eyebrow="Customer stories"
          title="Teams feel the difference in week one"
          description="From 5-person startups to 200-person operations, teams run their whole company on OrgOS."
        />
        <RevealGroup className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <RevealItem key={t.name}>
              <figure className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="flex gap-0.5 text-amber-400" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-pretty text-[15px] leading-relaxed text-foreground/90">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-border/60 pt-5">
                  <span
                    aria-hidden
                    className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white ${t.tone}`}
                  >
                    {t.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionContainer>
    </Section>
  )
}
