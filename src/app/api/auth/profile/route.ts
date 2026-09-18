import { db } from '@/lib/db'
import { ok, fail, withAuth, body, str } from '@/lib/server/api'

const PROFILE_FIELDS = ['headline', 'bio', 'location', 'phone', 'skills', 'avatarUrl'] as const
const NAME_MAX = 120
const TEXT_MAX = 200
const BIO_MAX = 1000

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  headline: true,
  phone: true,
  location: true,
  bio: true,
  skills: true,
} as const

/** PATCH /api/auth/profile — update the logged-in user's OWN profile fields.
 *  Body: { name?, headline?, bio?, location?, phone?, skills?, avatarUrl? }
 *  Undefined fields are left untouched; empty strings clear optional fields
 *  (name must stay non-empty). Returns the updated public user shape incl. email. */
export const PATCH = withAuth(async (req, ctx) => {
  const raw = await body<Record<string, unknown>>(req)

  const updates: Record<string, string> = {}
  if (raw.name !== undefined) updates.name = str(raw.name, 'name', { max: NAME_MAX })

  for (const field of PROFILE_FIELDS) {
    if (raw[field] === undefined) continue
    updates[field] = str(raw[field], field, { required: false, max: field === 'bio' ? BIO_MAX : TEXT_MAX })
  }

  if (Object.keys(updates).length === 0) {
    return fail('No updatable fields provided', 422)
  }

  const user = await db.user.update({
    where: { id: ctx.user.id },
    data: updates,
    select: USER_SELECT,
  })

  return ok(user)
})
