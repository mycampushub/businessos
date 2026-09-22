import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, body, str, oneOf, ApiError } from '@/lib/server/api'
import { checkRate, clientIp } from '@/lib/server/rate-limit'

/**
 * PUBLIC endpoint for the marketing site:
 *  - type CONTACT    → contact form submissions (name/email/company/topic/message)
 *  - type NEWSLETTER → footer email capture (email only)
 *
 * Anti-abuse: honeypot field `website` (silently accepted), sliding-window
 * rate limit of 6 submissions / hour / IP. Submissions are stored and platform
 * admins receive an in-app notification.
 */

const TOPICS = ['general', 'sales', 'support', 'feedback', 'partnership'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validEmail(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(s) || s.length > 160) throw new ApiError('Please enter a valid email address', 422)
  return s
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit first (cheap) — 6/hour per IP.
    const rl = checkRate(`contact:${clientIp(req)}`, 6, 60 * 60_000)
    if (!rl.allowed) {
      return fail('Too many submissions. Please try again later.', 429)
    }

    const payload = await body<Record<string, unknown>>(req)

    // Honeypot: bots that fill the hidden "website" field get a silent 200.
    if (typeof payload.website === 'string' && payload.website.trim() !== '') {
      return ok({ received: true })
    }

    const type = oneOf(payload.type, ['CONTACT', 'NEWSLETTER'] as const, 'CONTACT')
    const email = validEmail(payload.email)

    if (type === 'NEWSLETTER') {
      // Idempotent subscribe: same email already subscribed → friendly ok.
      const existing = await db.contactMessage.findFirst({
        where: { type: 'NEWSLETTER', email },
        select: { id: true },
      })
      if (!existing) {
        await db.contactMessage.create({
          data: { type, email, topic: 'newsletter' },
        })
      }
      return ok({ received: true, alreadySubscribed: !!existing })
    }

    // CONTACT
    const name = str(payload.name, 'name', { max: 80 })
    if (name.length < 2) throw new ApiError('Please tell us your name', 422)
    const company = str(payload.company, 'company', { required: false, max: 120 })
    const topic = oneOf(payload.topic, TOPICS, 'general')
    const message = str(payload.message, 'message', { max: 2000 })
    if (message.length < 10) throw new ApiError('Message must be at least 10 characters', 422)

    const row = await db.contactMessage.create({
      data: { type, name, email, company: company || null, topic, message },
    })

    // Best-effort in-app notification for platform admins (never fails the request).
    await db
      .notification
      .createMany({
        data: (
          await db.user.findMany({ where: { platformAdmin: true }, select: { id: true } })
        ).map((admin) => ({
          userId: admin.id,
          type: 'SYSTEM',
          title: 'New contact form submission',
          body: `${name} (${email}) — ${topic}: ${message.slice(0, 120)}${message.length > 120 ? '…' : ''}`,
        })),
      })
      .catch((e) => console.error('[contact-notify]', e))

    return ok({ received: true, reference: row.id.slice(-8).toUpperCase() })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.message, err.status)
    console.error('[contact]', err)
    return fail('Internal server error', 500)
  }
}
