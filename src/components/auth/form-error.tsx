'use client'

import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'

/** Inline (non-toast) form error banner with a subtle shake entrance. */
export function FormError({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: [0, -2, 0] }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="leading-snug">{message}</span>
    </motion.div>
  )
}
