import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { ApiError } from '@/lib/server/api'

/**
 * OrgOS document storage — dual-mode object store.
 *
 * - Local (sandbox / Node runtime): real files under `db/uploads/<orgId>/<docId>/<name>`,
 *   storage keys prefixed `local:`.
 * - Cloudflare Workers (production): objects live in the R2 bucket bound as `BUCKET`
 *   (see wrangler.jsonc) under `orgs/<orgId>/<docId>/<name>`, storage keys prefixed
 *   `r2:`. The runtime is detected via `CF_WORKER=1`; the OpenNext context is imported
 *   lazily so this module also loads on plain Node (where the import fails and we
 *   fall back to disk with a console.warn).
 *
 * Object keys are tenant-scoped: the API routes verify the caller's membership in
 * the org BEFORE any object is touched, so one tenant can never read another
 * tenant's files. Legacy metadata-only rows (seeded demo entries with `r2://…`
 * keys) resolve to "no stored bytes" → the download route 404s honestly.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB per uploaded file
export const GIB = 1024 * 1024 * 1024
const FREE_TIER_STORAGE_GB = 1 // orgs without an active subscription

/** Files the library accepts (upload dialog accept= mirrors this list). */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/json',
] as const

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_MIME_TYPES)

/** Common browser/OS aliases normalized onto the canonical allowlist entries. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'application/x-zip-compressed': 'application/zip',
  'text/x-csv': 'text/csv',
}

/** Extension → allowlist mime, for browsers that report an empty File.type. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  json: 'application/json',
}

export function isAllowedMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false
  const canonical = mime.trim().toLowerCase()
  return ALLOWED_MIME_SET.has(MIME_ALIASES[canonical] ?? canonical)
}

/** Resolve a File's real content type: declared type first, extension fallback. */
export function resolveMimeType(declared: string | null | undefined, filename: string): string | null {
  const canonical = (declared ?? '').trim().toLowerCase()
  if (canonical) return isAllowedMimeType(canonical) ? (MIME_ALIASES[canonical] ?? canonical) : null
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const byExt = MIME_BY_EXTENSION[ext]
  return byExt ?? null
}

// ---------- runtime detection ----------

/** Workers + R2 mode is enabled by the `CF_WORKER=1` var (see wrangler.jsonc). */
const ON_CF = process.env.CF_WORKER === '1'

interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Structural subset of the R2Bucket binding we actually use. */
interface R2BucketLike {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<R2ObjectBodyLike | null>
  delete(key: string): Promise<void>
}

/**
 * The OpenNext worker entry (production) and initOpenNextCloudflareForDev
 * (`cf:dev`) publish the request context on this global — it is exactly what
 * getCloudflareContext() reads in sync mode.
 */
const CF_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__')

async function getCloudflareEnv(): Promise<Record<string, unknown> | null> {
  // Fast path: read the context global directly (works on the deployed worker
  // and under opennextjs-cloudflare dev, with no module import at all).
  const globalCtx = (globalThis as Record<symbol, unknown>)[CF_CONTEXT_SYMBOL] as
    | { env?: Record<string, unknown> }
    | undefined
  if (globalCtx?.env) return globalCtx.env

  // Documented path: lazily import the OpenNext helper. The runtime-string
  // specifier + bundler-ignore comments keep webpack/turbopack from resolving
  // it at build time, so plain Node runs without the package fall through to
  // the local-disk implementation (console.warn below) instead of crashing.
  try {
    const specifier = '@opennextjs/cloudflare/api'
    const mod = (await import(
      /* webpackIgnore: true */
      /* turbopackIgnore: true */
      specifier
    )) as { getCloudflareContext?: () => unknown }
    if (typeof mod?.getCloudflareContext === 'function') {
      const raw = mod.getCloudflareContext()
      const cf = raw instanceof Promise ? await raw : raw
      const env = (cf as { env?: Record<string, unknown> } | null | undefined)?.env
      if (env) return env
    }
  } catch (err) {
    console.warn(
      '[storage] Cloudflare context unavailable — using local disk fallback:',
      err instanceof Error ? err.message : String(err)
    )
  }
  return null
}

let cachedBucket: R2BucketLike | null | undefined

/**
 * Lazily resolve the R2 bucket (BUCKET binding) from the OpenNext Cloudflare
 * context. Returns null (never throws) when not on Workers or when the binding
 * is unavailable — callers then fall back to the local disk implementation.
 */
async function getR2Bucket(): Promise<R2BucketLike | null> {
  if (!ON_CF) return null
  if (cachedBucket !== undefined) return cachedBucket
  const env = await getCloudflareEnv()
  const bucket = env?.BUCKET
  cachedBucket = bucket && typeof (bucket as R2BucketLike).put === 'function' ? (bucket as R2BucketLike) : null
  if (!cachedBucket) {
    console.warn('[storage] CF_WORKER=1 but no R2 "BUCKET" binding found — using local disk fallback')
  }
  return cachedBucket
}

// ---------- filename + path helpers ----------

/** Filesystem/bucket-safe name: strip path chars, cap at 120 chars. */
export function sanitizeFileName(name: string): string {
  const safe =
    name
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/^[\s_]+|[\s_]+$/g, '')
      .slice(0, 120) || 'file'
  return /^\.*$/.test(safe) ? 'file' : safe
}

const LOCAL_UPLOADS_ROOT = ['db', 'uploads']

function localPath(relPath: string): string {
  return join(process.cwd(), ...LOCAL_UPLOADS_ROOT, relPath)
}

// ---------- object API (storage-key prefixed: `local:` / `r2:`) ----------

export interface StoredObject {
  /** ArrayBuffer-backed so the value streams directly as a fetch BodyInit */
  bytes: Uint8Array<ArrayBuffer>
}

/** Store bytes for a document; returns the storage key to persist on the row. */
export async function putObject(
  orgId: string,
  docId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const name = sanitizeFileName(filename)
  const bucket = await getR2Bucket()
  if (bucket) {
    const key = `orgs/${orgId}/${docId}/${name}`
    await bucket.put(key, bytes, { httpMetadata: { contentType } })
    return `r2:${key}`
  }
  const relPath = `${orgId}/${docId}/${name}`
  const target = localPath(relPath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  return `local:${relPath}`
}

/** Fetch stored bytes; null when the key is missing, unreadable or legacy. */
export async function getObject(storageKey: string): Promise<StoredObject | null> {
  try {
    if (storageKey.startsWith('local:')) {
      const buf = await readFile(localPath(storageKey.slice('local:'.length)))
      return { bytes: new Uint8Array(buf) }
    }
    if (storageKey.startsWith('r2:')) {
      const bucket = await getR2Bucket()
      if (!bucket) return null
      const object = await bucket.get(storageKey.slice('r2:'.length))
      if (!object) return null
      return { bytes: new Uint8Array(await object.arrayBuffer()) }
    }
  } catch {
    return null
  }
  // unknown/legacy key (e.g. seeded `r2://slug/...` metadata-only rows)
  return null
}

/** Best-effort removal — never throws. */
export async function deleteObject(storageKey: string | null): Promise<void> {
  try {
    if (!storageKey) return
    if (storageKey.startsWith('local:')) {
      const target = localPath(storageKey.slice('local:'.length))
      await rm(target, { force: true })
      // best-effort: prune the now-empty per-document directory
      await rm(dirname(target), { force: true }).catch(() => {})
    } else if (storageKey.startsWith('r2:')) {
      const bucket = await getR2Bucket()
      if (bucket) await bucket.delete(storageKey.slice('r2:'.length))
    }
  } catch {
    // never throw on cleanup
  }
}

// ---------- plan quota enforcement ----------

/**
 * Throws ApiError(403) when adding `incomingBytes` would push the org past its
 * plan's storage limit. Quota = latest active subscription's plan storageGb
 * (orgs without one get the 1 GB free tier).
 */
export async function assertStorageQuota(orgId: string, incomingBytes: number): Promise<void> {
  const { db } = await import('@/lib/db')
  const [aggregate, subscription] = await Promise.all([
    db.document.aggregate({ where: { orgId }, _sum: { size: true } }),
    db.subscription.findFirst({
      where: { orgId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
      orderBy: { createdAt: 'desc' },
      select: { plan: { select: { storageGb: true } } },
    }),
  ])
  const storageGb = subscription?.plan.storageGb ?? FREE_TIER_STORAGE_GB
  const usedBytes = aggregate._sum.size ?? 0
  if (usedBytes + Math.max(0, incomingBytes) > storageGb * GIB) {
    // C5 fix: ApiError constructor signature is (message, status) — args were reversed.
    throw new ApiError(`Storage limit reached for your plan (${storageGb} GB). Free up space or upgrade in Billing & Plan.`, 403)
  }
}
