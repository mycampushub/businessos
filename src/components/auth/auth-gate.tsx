'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, LogIn, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrgOsLogo } from '@/components/app/logo'

/**
 * Redesigned /app interstitial for signed-out visitors: a branded session gate
 * that explains the situation, offers both auth routes and auto-redirects to
 * /signin shortly after mount (covers logout + expired sessions + deep links).
 */
export function AuthGate() {
  const router = useRouter()
  const redirected = useRef(false)

  useEffect(() => {
    if (redirected.current) return
    redirected.current = true
    const t = setTimeout(() => router.replace('/signin'), 1400)
    return () => clearTimeout(t)
  }, [router])

  const heading = 'Your workspace awaits'
  const body =
    'OrgOS keeps your organization\u2019s projects, people and finance behind authentication. Sign in to continue — or create a free account if you are new here.'

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-white">
      <div className="app-bg-grid absolute inset-0 opacity-50" aria-hidden />
      <div className="animate-aurora absolute -top-32 left-1/2 size-[34rem] -translate-x-1/2 rounded-full bg-emerald-600/20 blur-3xl" aria-hidden />
      <div className="animate-aurora-slow absolute -bottom-40 -right-24 size-[26rem] rounded-full bg-teal-500/15 blur-3xl" aria-hidden />

      <header className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <OrgOsLogo dark className="text-base" />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Back to site
        </Link>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div
            className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10"
            aria-hidden
          >
            <LogIn className="size-6 text-emerald-400" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="h-11 bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
              <Link href="/signin">
                Sign in <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/signup">
                <Sparkles className="size-4" aria-hidden /> Create free account
              </Link>
            </Button>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Redirecting to the sign-in page…
          </p>

          {/* auto-redirect progress */}
          <div className="mx-auto mt-3 h-1 w-44 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 1.4, ease: 'linear' }}
              className="h-full bg-emerald-400"
            />
          </div>
        </motion.div>
      </main>

      <footer className="relative px-6 py-4 text-center text-[11px] text-zinc-600">
        OrgOS — The Organization Operating System · Enterprise SaaS
      </footer>
    </div>
  )
}
