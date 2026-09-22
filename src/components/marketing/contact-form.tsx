'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const TOPICS = [
  { value: 'general', label: 'General enquiry' },
  { value: 'sales', label: 'Sales & plans' },
  { value: 'support', label: 'Product support' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'partnership', label: 'Partnership' },
] as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

interface FormState {
  name: string
  email: string
  company: string
  topic: string
  message: string
  website: string // honeypot — humans never see or fill this
}

const EMPTY: FormState = {
  name: '',
  email: '',
  company: '',
  topic: 'general',
  message: '',
  website: '',
}

type Errors = Partial<Record<'name' | 'email' | 'message', string>>

function validate(f: FormState): Errors {
  const e: Errors = {}
  if (f.name.trim().length < 2) e.name = 'Please tell us your name (at least 2 characters).'
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Please enter a valid email address.'
  if (f.message.trim().length < 10)
    e.message = 'Your message should be at least 10 characters so we can actually help.'
  return e
}

/**
 * Marketing contact form. Posts to /api/contact ({ type: 'CONTACT', ... }) and
 * renders an inline success panel with the reference code on completion.
 * A hidden "website" honeypot field quietly absorbs bot submissions.
 */
export function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [reference, setReference] = useState('')

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === 'loading') return
    setServerError('')

    const next = validate(form)
    setErrors(next)
    if (Object.values(next).some(Boolean)) return

    setStatus('loading')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CONTACT',
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim(),
          topic: form.topic,
          message: form.message.trim(),
          website: form.website,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { received: boolean; reference?: string } }
        | { ok: false; error: string }
        | null

      if (res.ok && json && json.ok) {
        setReference(json.data.reference ?? '')
        setStatus('success')
      } else {
        setServerError(
          json && !json.ok && json.error
            ? json.error
            : 'Something went wrong on our side. Please try again — or email hello@orgos.dev.'
        )
        setStatus('idle')
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.')
      setStatus('idle')
    }
  }

  function reset() {
    setForm(EMPTY)
    setErrors({})
    setServerError('')
    setReference('')
    setStatus('idle')
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="flex flex-col items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-8 text-center shadow-sm sm:p-10"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10 dark:bg-emerald-500/15">
          <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
        </span>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          Message received
        </h2>
        {reference && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your reference code is{' '}
            <span className="font-mono font-semibold text-foreground">REF: {reference}</span>
          </p>
        )}
        <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          A real person reads every message. We reply within one business day — quoting your
          reference code, so nothing gets lost.
        </p>
        <Button variant="outline" className="mt-6 h-11 px-6" onClick={reset}>
          Send another message
        </Button>
      </div>
    )
  }

  const fieldError = (key: keyof Errors) =>
    errors[key] ? (
      <p id={`${key}-error`} role="alert" className="text-xs font-medium text-destructive">
        {errors[key]}
      </p>
    ) : null

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-border/70 bg-card p-6 shadow-xl shadow-zinc-950/[0.03] dark:shadow-black/20 sm:p-8"
    >
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Send us a message</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Fill this in and it lands straight in our Dhaka HQ inbox.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className="h-11"
          />
          {fieldError('name')}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">
            Work email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            maxLength={160}
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className="h-11"
          />
          {fieldError('email')}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-company">Company</Label>
          <Input
            id="contact-company"
            name="company"
            autoComplete="organization"
            placeholder="Optional — helps us tailor the reply"
            maxLength={120}
            value={form.company}
            onChange={(e) => set('company')(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-topic">Topic</Label>
          <Select value={form.topic} onValueChange={set('topic')}>
            <SelectTrigger id="contact-topic" className="h-11 w-full" aria-label="Topic">
              <SelectValue placeholder="Choose a topic" />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="contact-message">
            Message <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="contact-message"
            name="message"
            placeholder="What can we help with? The more specific, the faster our answer."
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={form.message}
            onChange={(e) => set('message')(e.target.value)}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? 'message-error' : undefined}
            className="min-h-[120px]"
          />
          <div className="flex min-h-4 items-center justify-between gap-4">
            {fieldError('message') ?? (
              <span className="text-xs text-muted-foreground">
                Please include context like your team size or module.
              </span>
            )}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {form.message.length}/2000
            </span>
          </div>
        </div>
      </div>

      {serverError && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          We only use these details to answer you. No newsletters unless you ask.
        </p>
        <Button
          type="submit"
          disabled={status === 'loading'}
          className="h-11 w-full bg-emerald-600 px-7 text-base font-medium shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 sm:w-auto dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Sending&hellip;
            </>
          ) : (
            <>
              Send message
              <Send className="size-4" />
            </>
          )}
        </Button>
      </div>

      {/* Honeypot — visually and programmatically invisible to humans. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
        />
      </div>
    </form>
  )
}
