'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Briefcase, KanbanSquare, LineChart, Users, ShieldCheck, Quote } from 'lucide-react'
import { OrgOsLogo } from '@/components/app/logo'

/**
 * Shared split-screen shell for the auth routes (/signin, /signup).
 * Left: dark brand panel with aurora + grid + feature proof. Right: the form.
 * On mobile the brand panel collapses into a compact top strip.
 */

const PANEL_FEATURES = [
  { icon: Briefcase, title: 'CRM & Sales', text: 'Leads, pipelines and clients tied to delivery.' },
  { icon: KanbanSquare, title: 'Projects & Tasks', text: 'Kanban, Gantt, milestones and calendars.' },
  { icon: Users, title: 'People & HR', text: 'Recruitment, attendance, leave and org structure.' },
  { icon: LineChart, title: 'Finance & Insights', text: 'Invoices, expenses and living dashboards.' },
]

interface AuthLayoutProps {
  children: React.ReactNode
  /** Brand panel headline. */
  title: string
  /** Brand panel supporting copy. */
  description: string
}

export function AuthLayout({ children, title, description }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        {/* ---------- Brand panel (desktop) ---------- */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-white lg:flex xl:p-14">
          <div className="app-bg-grid absolute inset-0 opacity-60" aria-hidden />
          {/* aurora */}
          <div
            className="animate-aurora absolute -right-32 -top-32 size-[28rem] rounded-full bg-emerald-600/25 blur-3xl"
            aria-hidden
          />
          <div
            className="animate-aurora-slow absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-teal-500/15 blur-3xl"
            aria-hidden
          />
          {/* floating badge */}
          <div
            className="animate-float-delayed absolute right-16 top-1/3 hidden items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2 text-xs font-medium text-emerald-300 backdrop-blur xl:flex"
            aria-hidden
          >
            <span className="relative flex size-2">
              <span className="animate-ping-soft absolute inline-flex size-2 rounded-full bg-emerald-400" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            99.98% uptime · 25 orgs online
          </div>

          <div className="relative">
            <Link href="/" className="inline-flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
              <OrgOsLogo dark className="text-lg" />
            </Link>
          </div>

          <div className="relative mt-8 max-w-md">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl"
            >
              {title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
              className="mt-4 text-sm leading-relaxed text-zinc-400"
            >
              {description}
            </motion.p>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PANEL_FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.12 + i * 0.07, ease: 'easeOut' }}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/5"
                >
                  <f.icon className="size-4.5 text-emerald-400" aria-hidden />
                  <p className="mt-2 text-sm font-medium">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{f.text}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="relative mt-8">
            <figure className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <Quote className="size-4 text-emerald-400" aria-hidden />
              <blockquote className="mt-2.5 text-sm leading-relaxed text-zinc-200">
                &ldquo;We replaced four disconnected tools with OrgOS in a week. Payroll, pipelines and
                projects finally speak the same language.&rdquo;
              </blockquote>
              <figcaption className="mt-3 flex items-center gap-3">
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-300"
                  aria-hidden
                >
                  AR
                </span>
                <span className="text-xs">
                  <span className="font-medium text-zinc-100">Ayesha Rahman</span>
                  <span className="text-zinc-500"> · COO, Meridian Labs</span>
                </span>
              </figcaption>
            </figure>
            <p className="mt-6 text-xs text-zinc-500">
              Multi-tenant SaaS · TOTP two-factor · Full audit trail · Data stays yours
            </p>
          </div>
        </aside>

        {/* ---------- Mobile brand strip ---------- */}
        <div className="relative overflow-hidden bg-zinc-950 px-6 py-5 text-white lg:hidden">
          <div className="app-bg-grid absolute inset-0 opacity-50" aria-hidden />
          <div className="absolute -right-16 -top-20 size-56 rounded-full bg-emerald-600/20 blur-3xl" aria-hidden />
          <div className="relative flex items-center justify-between">
            <Link href="/">
              <OrgOsLogo dark className="text-base" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> Back to site
            </Link>
          </div>
        </div>

        {/* ---------- Form panel ---------- */}
        <main className="flex flex-1 items-center justify-center px-6 py-10 lg:p-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-sm"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <footer className="border-t bg-background px-6 py-3.5 text-center text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
          OrgOS — The Organization Operating System · Enterprise SaaS
        </span>
      </footer>
    </div>
  )
}
