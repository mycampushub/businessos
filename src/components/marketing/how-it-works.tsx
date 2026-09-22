import { Rocket, ShieldCheck, UserPlus } from 'lucide-react'
import { Reveal } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const STEPS = [
  {
    icon: Rocket,
    step: '01',
    title: 'Create your workspace',
    body: 'Sign up and spin up an organization in under two minutes. Your departments, roles and modules arrive pre-wired.',
  },
  {
    icon: UserPlus,
    step: '02',
    title: 'Invite your team',
    body: 'Bring people in with the right roles — owner, admin, manager, HR, finance or member. Access follows automatically.',
  },
  {
    icon: ShieldCheck,
    step: '03',
    title: 'Run everything',
    body: 'Projects, people, clients and money in one place. Watch the dashboard replace your Monday status meeting.',
  },
]

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="scroll-mt-20 bg-muted/40">
      <SectionContainer>
        <SectionHeading
          eyebrow="Get started"
          title="Live before your coffee gets cold"
          description="No implementation project, no consultants. Three steps and your organization is running."
        />
        <div className="relative mt-14">
          {/* connector line (desktop) */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-7 hidden border-t-2 border-dashed border-emerald-500/30 md:block"
          />
          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <Reveal key={step.step} delay={i * 0.12}>
                <li className="relative">
                  <div className="relative z-10 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-card shadow-sm">
                    <step.icon className="size-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="mt-5 font-mono text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70">
                    {step.step}
                  </p>
                  <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </SectionContainer>
    </Section>
  )
}
