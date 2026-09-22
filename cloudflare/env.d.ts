/**
 * Typed Cloudflare bindings for OrgOS (Workers runtime).
 * Mirrors the ROOT wrangler.jsonc — keep in sync with that config.
 *
 * Usage inside the worker (or via `getCloudflareContext()` from @opennextjs/cloudflare):
 *   declare const env: CloudflareEnv;
 *   const db = env.DATABASE;   // D1Database
 *   const bucket = env.BUCKET; // R2Bucket (src/lib/server/storage.ts)
 *   const sessions = env.SESSIONS; // KVNamespace
 */

interface CloudflareEnv {
  /** D1 database — relational data (organizations, CRM, projects, HR, finance…) */
  DATABASE: D1Database

  /** R2 bucket — uploaded document files; keys mirror Document.storageKey (`r2:` prefix) */
  BUCKET: R2Bucket

  /** KV namespace — session tokens (mirrors the Session table) + login rate limits */
  SESSIONS: KVNamespace

  /** KV namespace — dashboard aggregates, pipeline summaries (short TTL caches) */
  CACHE: KVNamespace

  /** OpenNext static assets */
  ASSETS: Fetcher

  APP_ENV: string
  DEFAULT_CURRENCY: string
  DEFAULT_TIMEZONE: string
  /** "1" on the deployed worker — switches src/lib/server/storage.ts to R2 */
  CF_WORKER: string
  /** set via `wrangler secret put APP_SECRET` */
  APP_SECRET: string
}
