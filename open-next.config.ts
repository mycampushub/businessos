import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * OpenNext Cloudflare configuration for OrgOS.
 *
 * The app is fully dynamic — a client-rendered workspace plus /api routes —
 * with no ISR/static regeneration, so no incremental cache backing is
 * required. If static generation is introduced later, enable the KV or R2
 * incremental cache overrides here (see @opennextjs/cloudflare docs).
 */
export default defineCloudflareConfig()
