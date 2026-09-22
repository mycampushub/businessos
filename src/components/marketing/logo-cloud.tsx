import { TRUSTED_BY } from '@/lib/site'

/**
 * Infinite logo marquee (pure CSS animation, pauses on hover, edge-faded).
 * Server-rendered — no JS needed.
 */
export function LogoCloud({ label = 'Trusted by teams at' }: { label?: string }) {
  const row = [...TRUSTED_BY, ...TRUSTED_BY]
  return (
    <section aria-label={label} className="border-y border-border/60 bg-muted/40 py-10">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className="marquee-mask marquee-hover mt-7 overflow-hidden">
        <div className="animate-marquee flex w-max items-center gap-14 pr-14" style={{ ['--marquee-duration' as string]: '38s' }}>
          {row.map((company, i) => (
            <span
              key={`${company.name}-${i}`}
              aria-hidden={i >= TRUSTED_BY.length}
              className="flex shrink-0 items-center gap-2.5 text-muted-foreground/80 transition-colors hover:text-foreground"
            >
              <company.icon className="size-5" />
              <span className="whitespace-nowrap text-base font-semibold tracking-tight">{company.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
