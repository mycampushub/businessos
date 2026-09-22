import type { ReactNode } from 'react'
import { MarketingHeader } from './header'
import { MarketingFooter } from './footer'

/**
 * Shared marketing page chrome: sticky header, stretchy main (keeps the footer
 * pinned to the viewport bottom on short pages), and dark footer.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingHeader />
      <main id="content" className="flex-1 pt-16">
        {children}
      </main>
      <MarketingFooter />
    </div>
  )
}
