'use client'

/**
 * Keyboard-operability props for clickable table rows / cards (mirrors the
 * finance-invoices pattern): spreads tabIndex + onClick + an Enter/Space
 * keydown handler onto the element. A plain function (not a hook) so it can
 * be spread per-row inside map callbacks. Spread it AFTER the element's own
 * props so className / aria-label stay in control:
 *
 *   <TableRow className="cursor-pointer" aria-label={...} {...rowClick(() => open(x))} />
 */
export function rowClick(onClick: () => void) {
  return {
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  } as const
}
