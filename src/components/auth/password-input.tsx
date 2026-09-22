'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff, Lock, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Password field with a visibility toggle and a live caps-lock warning.
 * `invalid` drives the red ring used by inline form validation.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
  invalid,
  disabled,
  id,
}: {
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  id?: string
}) {
  const [visible, setVisible] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const fallbackId = useId()
  const inputId = id ?? `pw-${fallbackId}`
  const warningId = `${inputId}-caps`

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>Password</Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={inputId}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder ?? '••••••••'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCapsOn(e.getModifierState?.('CapsLock') ?? false)}
          onBlur={() => setCapsOn(false)}
          aria-invalid={invalid || undefined}
          aria-describedby={capsOn ? warningId : undefined}
          disabled={disabled}
          required
          className={cn('h-11 pl-9 pr-11', invalid && 'border-destructive/60 focus-visible:ring-destructive/30')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      <p
        id={warningId}
        className={cn(
          'items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400',
          capsOn ? 'flex' : 'hidden'
        )}
      >
        <TriangleAlert className="size-3.5" aria-hidden /> Caps Lock is on
      </p>
    </div>
  )
}
