'use client'

/**
 * One-time credentials reveal — monospace email + temporary password with a
 * copy button and a "shown only once" warning. Used by the hire flow
 * (recruit-candidates-view) and member invitations (settings-view).
 */

import { useState } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CredentialsReveal({ email, tempPassword }: { email: string; tempPassword: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (e.g. insecure context) — user can select manually
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
        <p className="truncate font-mono text-sm font-medium">{email}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Temporary password</p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-sm select-all" aria-label={`Temporary password ${tempPassword}`}>
            {tempPassword}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => void copy()}
            aria-label="Copy temporary password to clipboard"
          >
            {copied ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </Button>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-medium">Share these credentials — shown only once.</strong> The password cannot be
          recovered later; the member should change it after signing in.
        </span>
      </p>
    </div>
  )
}
