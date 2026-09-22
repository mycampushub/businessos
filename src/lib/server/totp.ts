import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// ---------- TOTP (RFC 6238) — Node 'crypto' only, no external deps ----------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' // RFC 4648, no padding

/** RFC 4648 base32 encode (no '=' padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** RFC 4648 base32 decode (padding- and case-insensitive; invalid chars rejected). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  if (clean === '') return Buffer.alloc(0)
  if (!/^[A-Z2-7]+$/.test(clean)) throw new Error('Invalid base32 string')

  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  // trailing bits (< 8) are padding noise — discarded
  return Buffer.from(bytes)
}

/** 20 random bytes → 32-char base32 secret (160-bit, standard TOTP length). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

const STEP_SECONDS = 30
const DIGITS = 6

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter % 0x100000000, 4)

  const digest = createHmac('sha1', key).update(buf).digest()

  // dynamic truncation (RFC 4226 §5.3)
  const offset = digest[digest.length - 1] & 0x0f
  const binCode =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]

  return String(binCode % 10 ** DIGITS).padStart(DIGITS, '0')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Verify a 6-digit TOTP code; `window` = ± steps of clock drift tolerance. */
export function verifyTotp(
  secret: string,
  code: string,
  opts: { window?: number } = {}
): boolean {
  const normalized = String(code ?? '').replace(/[\s-]/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  let key: Buffer
  try {
    key = base32Decode(secret)
  } catch {
    return false
  }
  if (key.length === 0) return false

  const window = opts.window ?? 0
  const currentCounter = Math.floor(Date.now() / 1000 / STEP_SECONDS)

  // constant-time compare against every candidate step (and each other via timingSafeEqual)
  for (let drift = -window; drift <= window; drift++) {
    const candidate = hotp(key, currentCounter + drift)
    if (safeEqual(candidate, normalized)) return true
  }
  return false
}

/** otpauth:// URL for authenticator apps (QR-code payload). */
export function otpauthUrl(label: string, secret: string, issuer = 'OrgOS'): string {
  return (
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` +
    `?secret=${secret}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  )
}
