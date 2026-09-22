import { Fragment } from 'react'
import { Check, Minus } from 'lucide-react'
import { Reveal } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'
import { PLANS } from '@/lib/site'
import { cn } from '@/lib/utils'

type Cell = boolean | string

interface TableRow {
  label: string
  values: [Cell, Cell, Cell, Cell, Cell]
}

interface RowGroup {
  title: string
  rows: TableRow[]
}

/** Growth is the highlighted (third) column. */
const HIGHLIGHT_COL = 2

const GROUPS: RowGroup[] = [
  {
    title: 'Workspace',
    rows: [
      { label: 'Members', values: ['5', '15', '50', '200', 'Unlimited'] },
      { label: 'Projects', values: ['3', '10', '50', '200', 'Unlimited'] },
      { label: 'Storage', values: ['1 GB', '10 GB', '50 GB', '200 GB', '1 TB'] },
    ],
  },
  {
    title: 'Projects & tasks',
    rows: [
      { label: 'Kanban board', values: [true, true, true, true, true] },
      { label: 'Gantt timeline', values: [true, true, true, true, true] },
      { label: 'Milestones', values: [true, true, true, true, true] },
      { label: 'Typed dependencies', values: [true, true, true, true, true] },
    ],
  },
  {
    title: 'Customers & people',
    rows: [
      { label: 'CRM pipeline', values: [false, true, true, true, true] },
      { label: 'HR & attendance', values: [false, true, true, true, true] },
      { label: 'Leave workflows', values: [false, true, true, true, true] },
      { label: 'Recruitment ATS', values: [false, false, true, true, true] },
      { label: 'Public careers page', values: [false, false, true, true, true] },
    ],
  },
  {
    title: 'Finance & operations',
    rows: [
      { label: 'Payroll', values: [false, false, true, true, true] },
      { label: 'Invoices & expenses', values: [false, false, true, true, true] },
      { label: 'Documents', values: [true, true, true, true, true] },
      { label: 'Advanced reports', values: [false, false, true, true, true] },
    ],
  },
  {
    title: 'Governance & support',
    rows: [
      { label: 'Audit log', values: [false, false, false, true, true] },
      { label: 'Custom roles & module access', values: [false, false, false, true, true] },
      { label: 'Priority support', values: [false, false, false, true, true] },
      { label: 'SSO & SCIM', values: [false, false, false, false, true] },
      { label: 'Dedicated success manager', values: [false, false, false, false, true] },
    ],
  },
]

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <Check
          className="mx-auto size-4 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        />
        <span className="sr-only">Included</span>
      </>
    )
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto size-4 text-muted-foreground/40" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    )
  }
  return <span className="font-medium text-foreground">{value}</span>
}

/** Full feature comparison matrix across all five plans. */
export function PricingComparisonTable() {
  return (
    <Section id="compare" className="bg-muted/40">
      <SectionContainer>
        <SectionHeading
          eyebrow="Compare plans"
          title="The full feature matrix"
          description="Every module, limit and governance feature across all five plans. On mobile, scroll sideways — the feature column stays pinned."
        />

        <Reveal className="mt-10">
          {/* `relative` makes this scroll container the containing block for the
              sr-only spans inside cells — otherwise they escape the overflow
              clipping and stretch the page horizontally on mobile. */}
          <div className="relative overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-sm">
              <caption className="sr-only">
                OrgOS feature comparison across the Free, Starter, Growth, Business and Enterprise
                plans
              </caption>
              <thead>
                <tr className="border-b border-border/70">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 bg-card px-4 py-3.5 pr-6 font-semibold text-foreground sm:py-4"
                  >
                    Feature
                  </th>
                  {PLANS.map((p, i) => (
                    <th
                      key={p.code}
                      scope="col"
                      className="px-4 py-3.5 text-center font-semibold text-foreground sm:py-4"
                    >
                      {i === HIGHLIGHT_COL ? (
                        <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
                          {p.name}
                        </span>
                      ) : (
                        p.name
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="border-b border-border/70">
                      <th
                        scope="colgroup"
                        colSpan={6}
                        className="bg-muted/60 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                      >
                        {group.title}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-b border-border/60 last:border-b-0">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-card px-4 py-3 pr-6 text-left font-medium text-foreground"
                        >
                          {row.label}
                        </th>
                        {row.values.map((value, i) => (
                          <td
                            key={i}
                            className={cn(
                              'px-4 py-3 text-center tabular-nums',
                              i === HIGHLIGHT_COL && 'bg-emerald-500/[0.045]'
                            )}
                          >
                            <CellValue value={value} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground sm:text-sm">
            Every plan includes unlimited tasks per project, global search, notifications, dark
            mode and CSV import. All paid plans start with a 14-day free trial.
          </p>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}
