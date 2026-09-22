import { Counter } from './counter'
import { Reveal } from './reveal'
import { Section, SectionContainer } from './sections'

const STATS = [
  { value: 1200, suffix: '+', label: 'organizations running on OrgOS' },
  { value: 48300, suffix: '+', label: 'projects delivered on schedule' },
  { value: 2.4, suffix: 'M', decimals: 1, label: 'tasks completed this year' },
  { value: 99.98, suffix: '%', decimals: 2, label: 'uptime across the last 12 months' },
]

/** Animated count-up metrics band. */
export function StatsBand() {
  return (
    <Section className="py-14 sm:py-16 lg:py-20">
      <SectionContainer>
        <Reveal>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <dd className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                  <Counter to={stat.value} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
                </dd>
                <dt className="mx-auto mt-2 max-w-[16ch] text-balance text-sm text-muted-foreground">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}
