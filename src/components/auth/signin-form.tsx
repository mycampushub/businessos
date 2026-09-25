'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, LogIn, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/client/api'
import { AuthLayout } from './auth-layout'
import { PasswordInput } from './password-input'
import { OtpInput } from './otp-input'
import { DemoAccounts } from './demo-accounts'
import { FormError } from './form-error'

/** Session probe — /api/auth/me returns 200 + null for anonymous visitors. */

// M4-ui: client-side email format check (browsers' `type=email` validation is
// disabled by `noValidate`, so a regex gate is needed before hitting the API).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDemo, setPendingDemo] = useState<string | null>(null)
  // MFA second step — credentials are kept in state and resent with the code
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const checkingSession = useRef(false)

  // Already signed in? Land on /app instead of showing the form.
  useEffect(() => {
    if (checkingSession.current) return
    checkingSession.current = true
    api<{ user?: unknown } | null>('/api/auth/me', { silent: true })
      .then((me) => {
        if (me?.user) router.replace('/app')
      })
      .catch(() => {})
  }, [router])

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    // M4-ui: validate email format client-side before kicking off the request.
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    setBusy(true)
    setPendingDemo(null)
    try {
      const res = await api<{ mfaRequired?: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        silent: true,
      })
      if (res?.mfaRequired) {
        setMfaStep(true)
        setMfaCode('')
        return
      }
      router.replace('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed — please try again')
    } finally {
      setBusy(false)
    }
  }

  async function submitMfa(e?: React.FormEvent) {
    e?.preventDefault()
    if (mfaCode.length !== 6) return
    setError(null)
    setBusy(true)
    try {
      await api('/api/auth/login/mfa', { method: 'POST', body: { email, password, code: mfaCode }, silent: true })
      router.replace('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed — check the code and retry')
      setMfaCode('')
    } finally {
      setBusy(false)
    }
  }

  async function quickLogin(demoEmail: string) {
    setError(null)
    setPendingDemo(demoEmail)
    setBusy(true)
    try {
      // L25-fe: `password123` is the documented sandbox-only demo password (see
      // demo-accounts.tsx). This code path is only reachable in the demo/preview
      // environment — production builds do not render the DemoAccounts widget.
      const res = await api<{ mfaRequired?: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { email: demoEmail, password: 'password123' },
        silent: true,
      })
      if (res?.mfaRequired) {
        setEmail(demoEmail)
        setPassword('password123')
        setMfaStep(true)
        setMfaCode('')
        return
      }
      router.replace('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed')
    } finally {
      setBusy(false)
      setPendingDemo(null)
    }
  }

  return (
    <AuthLayout
      title="Welcome back to your command center."
      description="Sign in to pick up where your organization left off — projects, pipelines, people and finance, exactly as you left them."
    >
      {mfaStep ? (
        <motion.div
          key="mfa"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
            Step 2 of 2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Enter the 6-digit code from your authenticator app for{' '}
            <span className="font-medium text-foreground">{email}</span>.
          </p>

          <form onSubmit={submitMfa} className="mt-6 flex flex-col gap-4">
            <FormError message={error} />
            <OtpInput value={mfaCode} onChange={setMfaCode} invalid={!!error} disabled={busy} autoFocus />
            <Button type="submit" className="h-11 w-full" disabled={busy || mfaCode.length !== 6}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              Verify &amp; sign in
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setMfaStep(false)
                setMfaCode('')
                setError(null)
              }}
            >
              <ArrowLeft className="size-4" aria-hidden /> Use a different account
            </Button>
          </form>
        </motion.div>
      ) : (
        <motion.div
          key="login"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
            Workspace access
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter your credentials to open your workspace.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
            <FormError message={error} id="signin-error" />
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
                  aria-describedby="signin-error"
                  disabled={busy}
                  required
                  className="h-11 pl-9"
                />
              </div>
            </div>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              invalid={!!error}
              disabled={busy}
              describedBy="signin-error"
            />
            <div className="-mt-2 flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
              >
                Forgot your password?
              </Link>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy || !email || !password}>
              {busy && !pendingDemo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
              Sign in
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Trouble signing in?{' '}
              <Link
                href="/contact"
                className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
              >
                Contact support
              </Link>
            </p>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden>
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <DemoAccounts onPick={quickLogin} busy={busy} pendingEmail={pendingDemo} />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to OrgOS?{' '}
            <Link
              href="/signup"
              className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              Create an account
            </Link>
          </p>
        </motion.div>
      )}
    </AuthLayout>
  )
}
