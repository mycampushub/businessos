/**
 * Typed Cloudflare bindings for OrgOS (Workers runtime).
 * Generated from cloudflare/wrangler.jsonc — keep in sync with the config.
 *
 * Usage inside the worker (or via `getCloudflareContext()` from @opennextjs/cloudflare):
 *   declare const env: CloudflareEnv;
 *   const db = env.DB;            // D1Database
 *   const bucket = env.STORAGE;   // R2Bucket
 *   const sessions = env.SESSIONS; // KVNamespace
 */

interface CloudflareEnv {
  /** D1 database — relational data (organizations, CRM, projects, HR, finance…) */
  DB: D1Database

  /** R2 bucket — documents & attachments; object keys mirror Document.storageKey */
  STORAGE: R2Bucket

  /** KV namespace — session tokens (mirrors the Session table) + login rate limits */
  SESSIONS: KVNamespace

  /** KV namespace — dashboard aggregates, pipeline summaries (short TTL caches) */
  CACHE: KVNamespace

  /** OpenNext static assets */
  ASSETS: Fetcher

  APP_ENV: string
  DEFAULT_CURRENCY: string
  DEFAULT_TIMEZONE: string
  /** set via `wrangler secret put APP_SECRET` */
  APP_SECRET: string
}
