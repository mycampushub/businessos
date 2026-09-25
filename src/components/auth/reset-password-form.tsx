'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/client/api'
import { AuthLayout } from './auth-layout'
import { PasswordInput } from './password-input'
import { FormError } from './form-error'

interface ResetResponse {
  message?: string
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <AuthLayout
        title="Let's get you back in."
        description="Use a fresh reset link from the account-recovery page to choose a new password."
      >
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
            Account recovery
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Invalid reset link</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This link is missing a reset token. Reset links are single-use and expire after one hour.
          </p>

          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="leading-snug">
              No reset token was found in the URL. Please request a new link below.
            </span>
          </div>

          <Button asChild className="mt-4 h-11 w-full">
            <Link href="/forgot-password">
              <ShieldCheck className="size-4" aria-hidden /> Request a reset link
            </Link>
          </Button>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link href="/signin">
              <ArrowLeft className="size-4" aria-hidden /> Back to sign in
            </Link>
          </Button>
        </motion.div>
      </AuthLayout>
    )
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    try {
      await api<ResetResponse>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password },
        silent: true,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Set a new password and pick up where you left off."
      description="Choose a strong password you haven't used before. We'll sign you out everywhere else for your security."
    >
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
          Account recovery
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter your new password below. All existing sessions will be ended.
        </p>

        {done ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Password reset successfully</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Your password has been updated and all other sessions have been ended. Sign in with
                  your new password to continue.
                </p>
                <Button asChild className="mt-3 h-11 w-full">
                  <Link href="/signin">
                    <ShieldCheck className="size-4" aria-hidden /> Continue to sign in
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
            <FormError message={error} />
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              invalid={!!error}
              disabled={busy}
              id="new-password"
            />
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              invalid={!!error}
              disabled={busy}
              id="confirm-password"
              label="Confirm new password"
            />
            <Button type="submit" className="h-11 w-full" disabled={busy || !password || !confirm}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              Reset password
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
