'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NAV_LINKS, SITE } from '@/lib/site'

function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || state === 'loading') return
    setState('loading')
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'NEWSLETTER', email }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok) {
        setState('done')
      } else {
        setState('error')
        setError(json?.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setState('error')
      setError('Network error. Please try again.')
    }
  }

  if (state === 'done') {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-300" role="status">
        <CheckCircle2 className="size-4 shrink-0" />
        You&apos;re on the list — welcome aboard.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm items-center gap-2" noValidate>
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <Input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (state === 'error') setState('idle')
        }}
        placeholder="you@company.com"
        className="h-10 border-white/15 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-400/50"
      />
      <Button
        type="submit"
        variant="secondary"
        className="h-10 shrink-0 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
        disabled={state === 'loading'}
      >
        {state === 'loading' ? <Loader2 className="size-4 animate-spin" /> : 'Subscribe'}
      </Button>
      {state === 'error' && <p className="sr-only">{error}</p>}
    </form>
  )
}

function FooterColumn({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-emerald-300"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="ink-section mt-auto border-t border-white/10">
      {/* Newsletter band */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Product updates, no spam
            </h2>
            <p className="mt-1 text-sm ink-muted">
              Monthly notes on new modules and improvements. Unsubscribe anytime.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </div>

      {/* Link columns */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-14 sm:px-6 md:grid-cols-4 lg:grid-cols-6 lg:px-8">
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
              <rect x="1" y="1" width="30" height="30" rx="8" className="fill-emerald-400" />
              <g className="fill-zinc-950">
                <rect x="7" y="9" width="7" height="4" rx="1.5" />
                <rect x="7" y="15" width="11" height="4" rx="1.5" opacity="0.85" />
                <rect x="7" y="21" width="15" height="4" rx="1.5" opacity="0.7" />
                <circle cx="23.5" cy="11" r="2.4" />
              </g>
            </svg>
            <span className="text-lg font-semibold tracking-tight text-white">
              Org<span className="text-emerald-400">OS</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed ink-muted">
            {SITE.description}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 rounded-full bg-emerald-400 animate-ping-soft" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            All systems operational
          </div>
        </div>
        <FooterColumn title="Product" links={NAV_LINKS.product} />
        <FooterColumn title="Company" links={NAV_LINKS.company} />
        <FooterColumn title="Legal" links={NAV_LINKS.legal} />
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Get started</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <Link
                href="/signup"
                className="group inline-flex items-center gap-1 text-sm font-medium text-emerald-300 transition-colors hover:text-emerald-200"
              >
                Create free account
                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </li>
            <li>
              <Link href="/signin" className="text-sm text-zinc-400 transition-colors hover:text-emerald-300">
                Sign in to workspace
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-sm text-zinc-400 transition-colors hover:text-emerald-300">
                Talk to sales
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p>
            © {year} {SITE.legalName} · Dhaka, Bangladesh
          </p>
          <p>
            Built for organizations that move fast · <span className="text-zinc-400">৳ BDT pricing · bKash & Nagad accepted</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
