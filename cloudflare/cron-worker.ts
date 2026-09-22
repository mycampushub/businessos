/**
 * OrgOS cron trigger worker — invokes the platform's daily maintenance sweep.
 * ---------------------------------------------------------------------
 * The main OrgOS app (OpenNext worker) serves requests; this tiny companion
 * worker runs on a Cloudflare Cron Trigger and POSTs to /api/cron/daily with
 * the shared CRON_SECRET. Keeping the schedule in a dedicated worker means
 * the OpenNext build stays untouched and the schedule can be tuned
 * independently.
 *
 * Deploy (see cloudflare/README.md):
 *   npx wrangler deploy --config cloudflare/cron-wrangler.jsonc
 *   npx wrangler secret put CRON_SECRET --config cloudflare/cron-wrangler.jsonc
 *   npx wrangler secret put APP_URL     --config cloudflare/cron-wrangler.jsonc
 *     (APP_URL = https://<your-orgos-workers-domain>)
 */

import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types'

export interface CronEnv {
  /** Full base URL of the deployed OrgOS app, e.g. https://orgos.example.workers.dev */
  APP_URL: string
  /** Shared secret — must match the app's CRON_SECRET (wrangler secret put). */
  CRON_SECRET: string
}

const cronWorker = {
  async scheduled(_event: ScheduledController, env: CronEnv, _ctx: ExecutionContext): Promise<void> {
    const res = await fetch(`${env.APP_URL.replace(/\/$/, '')}/api/cron/daily`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    })
    // surface the sweep summary in the worker logs (wrangler tail)
    const body = await res.json().catch(() => ({}))
    console.log(`[orgos-cron] daily sweep → ${res.status}`, JSON.stringify(body))
    if (!res.ok) {
      throw new Error(`Daily sweep failed with ${res.status}`)
    }
  },
}

export default cronWorker
