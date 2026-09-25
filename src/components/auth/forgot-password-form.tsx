'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, KeyRound, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/client/api'
import { AuthLayout } from './auth-layout'
import { FormError } from './form-error'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ForgotResponse {
  resetUrl?: string
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ForgotResponse | null>(null)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!email.trim()) return
    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address')
      return
    }
    setBusy(true)
    try {
      const res = await api<ForgotResponse>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email },
        silent: true,
      })
      setResult(res ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a reset link — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Locked out? Let's get you back in."
      description="Enter your account email and we'll generate a secure, single-use link to reset your password."
    >
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
          Account recovery
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the email associated with your OrgOS account.
        </p>

        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                <KeyRound className="size-4" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Reset link generated</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  If an account exists for{' '}
                  <span className="font-medium text-foreground">{email}</span>, a reset link has been
                  generated. Click the link below to reset your password.
                </p>

                {result.resetUrl ? (
                  <div className="mt-3">
                    <Button asChild className="h-11 w-full">
                      <Link href={result.resetUrl}>
                        <ExternalLink className="size-4" aria-hidden /> Reset your password
                      </Link>
                    </Button>
                    <p className="mt-2 break-all text-[11px] leading-relaxed text-muted-foreground">
                      Sandbox note: this link would normally be emailed.{' '}
                      <Link
                        href={result.resetUrl}
                        className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
                      >
                        {result.resetUrl}
                      </Link>
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setResult(null)
                      setEmail('')
                    }}
                  >
                    Use a different email
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
            <FormError message={error} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error || undefined}
                  disabled={busy}
                  required
                  className="h-11 pl-9"
                />
              </div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              Send reset link
            </Button>
            <Button asChild type="button" variant="ghost" className="w-full">
              <Link href="/signin">
                <ArrowLeft className="size-4" aria-hidden /> Back to sign in
              </Link>
            </Button>
          </form>
        )}
      </motion.div>
    </AuthLayout>
  )
}
