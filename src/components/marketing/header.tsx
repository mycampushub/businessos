'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  { href: '/features', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="OrgOS home">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="8" className="fill-emerald-600 dark:fill-emerald-500" />
        <g className="fill-white dark:fill-zinc-950">
          <rect x="7" y="9" width="7" height="4" rx="1.5" />
          <rect x="7" y="15" width="11" height="4" rx="1.5" opacity="0.85" />
          <rect x="7" y="21" width="15" height="4" rx="1.5" opacity="0.7" />
          <circle cx="23.5" cy="11" r="2.4" />
        </g>
      </svg>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Org<span className="text-emerald-600 dark:text-emerald-400">OS</span>
      </span>
    </Link>
  )
}

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || open
          ? 'border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70'
          : 'border-b border-transparent bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-10">
          <Logo />
          <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-active={isActive(item.href)}
                className={cn(
                  'link-underline text-sm font-medium transition-colors',
                  isActive(item.href) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button asChild variant="ghost" className="hidden text-sm font-medium sm:inline-flex">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild className="group hidden text-sm font-medium shadow-sm sm:inline-flex">
            <Link href="/signup">
              Start free
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 sm:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="overflow-hidden border-b border-border/70 bg-background/95 backdrop-blur-xl md:hidden"
          >
            <nav aria-label="Mobile navigation" className="space-y-1 px-4 pb-6 pt-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block rounded-lg px-3 py-3 text-base font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex items-center gap-3 px-3 pt-4">
                <ThemeToggle />
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/signin" onClick={() => setOpen(false)}>Sign in</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href="/signup" onClick={() => setOpen(false)}>Start free</Link>
                </Button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
