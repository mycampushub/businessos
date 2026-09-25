import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

/**
 * AES-256-GCM encryption for secrets stored at rest (M14-auth).
 *
 * Used for the TOTP `mfaSecret` column so a database compromise alone does NOT
 * also leak the user's MFA seed — the attacker would still need the
 * `MFA_SECRET_KEY` env var (or, in the sandbox, the well-known dev fallback)
 * to derive the AES key.
 *
 * Format: `<iv(base64)>:<tag(base64)>:<ciphertext(base64)>` — three base64
 * chunks separated by colons. AES-256-GCM gives us confidentiality + integrity
 * (the auth tag rejects tampered ciphertext).
 */

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32 // AES-256 → 32-byte key
const IV_LEN = 12 // 96-bit IV is the GCM standard
const SALT = 'orgos-mfa-salt-v1' // stable salt → key is stable across requests

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  // Sandbox fallback: a clearly-marked dev key so the demo environment works
  // without env config. Production MUST set MFA_SECRET_KEY to a strong random
  // value (≥ 32 chars) — a single shared key across deployments is acceptable
  // because the threat model here is "DB dump without app config", not "stolen
  // app config".
  const secret = process.env.MFA_SECRET_KEY || 'orgos-dev-mfa-key-change-in-prod'
  cachedKey = scryptSync(secret, SALT, KEY_LEN)
  return cachedKey
}

/** Encrypt a plaintext secret (e.g. a base32 TOTP seed) for storage. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error('encryptSecret: plaintext is required')
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, enc].map((b) => b.toString('base64')).join(':')
}

/** Decrypt a ciphertext produced by {@link encryptSecret}. Throws on tampering
 *  or malformed input — callers should catch and treat as "no valid secret". */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext || typeof ciphertext !== 'string') {
    throw new Error('decryptSecret: ciphertext is required')
  }
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('decryptSecret: malformed ciphertext')
  const iv = Buffer.from(parts[0], 'base64')
  const tag = Buffer.from(parts[1], 'base64')
  const enc = Buffer.from(parts[2], 'base64')
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
