'use client'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'

const AVATAR_BG = [
  'bg-emerald-600/85 text-white',
  'bg-teal-600/85 text-white',
  'bg-amber-600/85 text-white',
  'bg-rose-600/85 text-white',
  'bg-orange-600/85 text-white',
  'bg-lime-600/85 text-white',
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
  ring,
}: {
  name: string | null | undefined
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  ring?: boolean
}) {
  const sizes = {
    xs: 'size-6 text-[10px]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-14 text-lg',
  }
  const label = name ?? '?'
  return (
    <Avatar className={cn(sizes[size], ring && 'ring-2 ring-background', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? 'User avatar'} />}
      <AvatarFallback className={cn('font-semibold', AVATAR_BG[hashName(label) % AVATAR_BG.length])}>
        {initials(label)}
      </AvatarFallback>
    </Avatar>
  )
}

export function AvatarStack({
  users,
  max = 4,
  size = 'sm',
}: {
  users: Array<{ name: string | null; avatarUrl?: string | null }>
  max?: number
  size?: 'xs' | 'sm' | 'md'
}) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u, i) => (
        <UserAvatar key={i} name={u.name} avatarUrl={u.avatarUrl} size={size} ring />
      ))}
      {rest > 0 && (
        <div className="flex size-8 items-center justify-center rounded-full border bg-muted text-xs font-medium ring-2 ring-background">
          +{rest}
        </div>
      )}
    </div>
  )
}
