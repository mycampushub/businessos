'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Check, Loader2, Mail, Rocket, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/client/api'
import { cn } from '@/lib/utils'
import { AuthLayout } from './auth-layout'
import { PasswordInput } from './password-input'
import { FormError } from './form-error'

const PASSWORD_CHECKS = [
  { label: 'At least 8 characters', test: (pw: string) => pw.length >= 8 },
  { label: 'One letter', test: (pw: string) => /[a-zA-Z]/.test(pw) },
  { label: 'One number', test: (pw: string) => /\d/.test(pw) },
]

// M4-ui: client-side email format check (browsers' `type=email` validation is
// disabled by `noValidate`, so a regex gate is needed before hitting the API).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function SignUpForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const checkingSession = useRef(false)

  // Already signed in? Land on /app instead of showing the form.
  // (/api/auth/me answers 200 + null for anonymous visitors.)
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
    if (!name.trim() || !email.trim() || password.length < 8) return
    // M4-ui: validate email format client-side before kicking off the request.
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/register', { method: 'POST', body: { name, email, password }, silent: true })
      router.replace('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account — please try again')
    } finally {
      setBusy(false)
    }
  }

  const allPassed = PASSWORD_CHECKS.every((c) => c.test(password))

  return (
    <AuthLayout
      title="Start running your organization today."
      description="Create your free account, invite your team and set up your workspace in minutes — no credit card, no lock-in."
    >
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
          Get started free
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          One account, one workspace — your organization&rsquo;s new operating system.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <FormError message={error} id="signup-error" />

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="name"
                autoComplete="name"
                placeholder="Jane Cooper"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby="signup-error"
                disabled={busy}
                maxLength={80}
                required
                className="h-11 pl-9"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Work email</Label>
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
                aria-describedby="signup-error"
                disabled={busy}
                required
                className="h-11 pl-9"
              />
            </div>
          </div>

          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            invalid={!!error}
            disabled={busy}
            describedBy="signup-error"
          />

          {/* live password checklist */}
          {password.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
              aria-label="Password requirements"
            >
              {PASSWORD_CHECKS.map((c) => {
                const passed = c.test(password)
                return (
                  <li
                    key={c.label}
                    className={cn(
                      'flex items-center gap-1.5 text-xs transition-colors',
                      passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-3.5 items-center justify-center rounded-full border',
                        passed
                          ? 'border-emerald-600 bg-emerald-600/10 dark:border-emerald-400 dark:bg-emerald-400/10'
                          : 'border-input'
                      )}
                      aria-hidden
                    >
                      {passed && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                    {c.label}
                  </li>
                )
              })}
            </motion.ul>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-muted-foreground">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={busy}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-emerald-600"
              aria-label="Accept the Terms of Service and Privacy Policy"
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" className="font-medium text-foreground underline-offset-4 hover:underline" target="_blank">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="font-medium text-foreground underline-offset-4 hover:underline" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={busy || !accepted || !allPassed || !name.trim() || !email.trim()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
            Create free account
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Free plan: 5 seats · 3 projects · 1 GB storage — upgrade anytime.
        </p>

        <div className="my-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">already have an account?</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/signin">Sign in instead</Link>
        </Button>
      </motion.div>
    </AuthLayout>
  )
}
