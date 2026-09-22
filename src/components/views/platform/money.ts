import { money } from '@/lib/format'

/**
 * ONE money formatter for every platform-console file (BDT — the platform
 * currency). Wraps the shared lib/format money() so tenant views and the
 * platform console render identical strings (`৳4,500`, compact over ৳1L).
 * Replaces the four divergent local formatters this console used to carry
 * (fmtBDT / fmtTk / bdt with inconsistent decimals).
 */
export function fmtMoney(n: number | null | undefined): string {
  return money(n, 'BDT')
}
