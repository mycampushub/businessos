'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Six-box one-time-code input: auto-advance on type, backspace jumps back,
 * paste fills all boxes, digits only. Screen-reader labelled as a single code.
 */
export function OtpInput({
  value,
  onChange,
  invalid,
  disabled,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
}) {
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus()
  }, [autoFocus])

  function setAt(i: number, ch: string) {
    const next = value.split('')
    next[i] = ch
    onChange(next.join('').replace(/ /g, ''))
  }

  function handleInput(i: number, raw: string) {
    const ch = raw.replace(/\D/g, '')
    if (ch && ch.length > 1) {
      // multi-char (paste into a box / autofill): fill from position i
      const merged = (value.slice(0, i) + ch).replace(/\D/g, '').slice(0, 6)
      onChange(merged)
      boxes.current[Math.min(merged.length, 5)]?.focus()
      return
    }
    setAt(i, ch)
    if (ch && i < 5) boxes.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i] !== ' ') {
        setAt(i, '')
      } else if (i > 0) {
        setAt(i - 1, '')
        boxes.current[i - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      boxes.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault()
      boxes.current[i + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text) {
      onChange(text)
      boxes.current[Math.min(text.length, 5)]?.focus()
    }
  }

  return (
    <div
      role="group"
      aria-label="6-digit verification code"
      className="flex justify-between gap-2"
      onPaste={handlePaste}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d === ' ' ? '' : d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-12 w-full rounded-lg border bg-background text-center font-mono text-lg font-medium tabular-nums shadow-sm transition-[color,border-color,box-shadow] focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
            invalid
              ? 'border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/25'
              : 'border-input'
          )}
        />
      ))}
    </div>
  )
}
