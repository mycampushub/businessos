import type { ReactNode } from 'react'
import { Reveal } from './reveal'

export interface LegalTocItem {
  id: string
  label: string
}

/**
 * Shared layout for legal pages (/privacy, /terms): a hero-lite band, then a
 * two-column body with a sticky "on this page" sidebar and a narrow prose
 * column styled by hand (no typography plugin).
 */
export function LegalLayout({
  title,
  updated,
  intro,
  toc,
  children,
}: {
  title: string
  updated: string
  intro: ReactNode
  toc: LegalTocItem[]
  children: ReactNode
}) {
  return (
    <div>
      {/* Hero-lite */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
        <div
          aria-hidden
          className="animate-aurora absolute -top-32 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-500/10"
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Legal
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated:{' '}
            <time className="font-medium text-foreground/80">{updated}</time>
          </p>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {intro}
          </p>
        </div>
      </section>

      {/* Body: sticky TOC + prose */}
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-16 lg:py-16 lg:px-8">
        <aside className="hidden lg:block">
          <nav
            aria-label="On this page"
            className="sticky top-24 rounded-xl border border-border/70 bg-card p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              On this page
            </p>
            <ol className="mt-4 space-y-2.5">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="group flex items-baseline gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground/60 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                      {i + 1}
                    </span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="min-w-0 max-w-3xl">
          {/* Mobile TOC — plain details/summary, no JS */}
          <details className="mb-8 rounded-xl border border-border/70 bg-card p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              On this page
            </summary>
            <ol className="mt-3 space-y-2">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex items-baseline gap-2.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground/60">
                      {i + 1}
                    </span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {children}
        </div>
      </div>
    </div>
  )
}

/** One numbered legal section: anchored h2 + hand-styled prose children. */
export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <Reveal y={16} duration={0.5}>
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
        <h2
          id={`${id}-title`}
          className="mt-10 scroll-mt-24 text-xl font-semibold tracking-tight text-foreground first:mt-0"
        >
          <span className="mr-2 text-emerald-600 dark:text-emerald-400">{number}.</span>
          {title}
        </h2>
        <div className="mt-4 space-y-4">{children}</div>
      </section>
    </Reveal>
  )
}

/** Prose primitives shared by both legal pages. */
export function LegalP({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="space-y-2.5 pl-1 text-[15px] text-muted-foreground">{children}</ul>
}

export function LegalLi({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 leading-relaxed before:absolute before:left-0 before:top-[0.6em] before:size-1.5 before:rounded-full before:bg-emerald-600/70 dark:before:bg-emerald-400/70">
      {children}
    </li>
  )
}

/** Inline emphasis for defined terms / key words. */
export function T({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}
