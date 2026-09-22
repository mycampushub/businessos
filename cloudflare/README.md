# OrgOS — Cloudflare Deployment

The canonical Wrangler configuration lives at the **repository root** (`wrangler.jsonc`) —
it is the single source of truth for the main OpenNext worker. The only other config in
this folder is `cron-wrangler.jsonc` (the companion cron worker). There is no
`wrangler.toml` and no duplicate main-worker config.

## Resources

| Binding    | Resource                     | Purpose                                                       |
| ---------- | ---------------------------- | ------------------------------------------------------------- |
| `DATABASE` | D1 database `orgos`          | Relational data (mirrors `prisma/schema.prisma`)               |
| `BUCKET`   | R2 bucket `orgos-documents`  | Uploaded document files (`Document.storageKey`, `r2:` prefix)  |
| `SESSIONS` | KV namespace                 | Session tokens + login rate limits (reserved)                  |
| `CACHE`    | KV namespace                 | Dashboard aggregates, pipeline summaries (reserved)            |

Storage is dual-mode (`src/lib/server/storage.ts`): local disk under `db/uploads/` in
the sandbox, and the `BUCKET` R2 binding on Workers when the `CF_WORKER=1` var is set
(it is, in `wrangler.jsonc` `vars`).

## Deploy (honest, step-by-step)

```bash
# 1. Toolchain (dev deps are enough for the build)
bun add -d @opennextjs/cloudflare wrangler @prisma/adapter-d1

# 2. Generate the Workers/D1 Prisma client
#    (cloudflare/schema.workers.prisma = schema copy with the new `prisma-client`
#     generator: driverAdapters + queryCompiler, output cloudflare/generated/prisma)
bunx prisma generate --schema cloudflare/schema.workers.prisma

# 3. Create the D1 database, paste its id into wrangler.jsonc (DATABASE binding),
#    then apply the SQL schema (optionally the demo seed too)
npx wrangler d1 create orgos
npx wrangler r2 bucket create orgos-documents
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create CACHE
bun run cf:d1:migrate:remote          # wrangler d1 execute orgos --remote --file cloudflare/migrations/0001_init.sql
# optional demo data:
npx wrangler d1 execute orgos --remote --file cloudflare/seed/seed-demo.sql

# 4. Build for the Workers runtime and deploy
bun run cf:build                      # opennextjs-cloudflare build
bun run cf:deploy                     # opennextjs-cloudflare build && wrangler deploy
# local preview against the Workers runtime:
bun run cf:dev                        # opennextjs-cloudflare dev

# 5. Secrets + the companion cron worker
npx wrangler secret put APP_SECRET    # session signing pepper
npx wrangler secret put CRON_SECRET   # shared secret for POST /api/cron/daily
npx wrangler deploy --config cloudflare/cron-wrangler.jsonc
npx wrangler secret put CRON_SECRET --config cloudflare/cron-wrangler.jsonc
npx wrangler secret put APP_URL --config cloudflare/cron-wrangler.jsonc   # https://<your-orgos-workers-domain>

# 6. Storage: CF_WORKER=1 is already set in wrangler.jsonc `vars`
#    → src/lib/server/storage.ts lazily resolves getCloudflareContext().env.BUCKET
#      (R2) and uses the local disk only as a fallback.
```

## Known limitation (be aware before deploying)

`src/lib/db.ts` still constructs the plain local `PrismaClient` — the D1 driver-adapter
wiring is NOT applied in the committed code. At deploy time you must wire it following
the snippet in `cloudflare/snippets/db-d1.ts` (`PrismaD1(env.DATABASE)` + the client
generated from `cloudflare/schema.workers.prisma`), either by editing `src/lib/db.ts`
behind the `CF_WORKER` flag or via the OpenNext worker entry. Until that wiring is done,
a deployed worker will not successfully query D1 — everything else (routes, R2 storage,
quota enforcement) is deploy-ready.

## Layout

- `wrangler.jsonc` (repo root) — canonical Wrangler config for the main worker (no cron trigger on it)
- `cloudflare/cron-wrangler.jsonc` + `cloudflare/cron-worker.ts` — dedicated daily-schedule companion worker
- `cloudflare/schema.workers.prisma` — Prisma schema copy for the Workers/D1 build path (new `prisma-client` generator)
- `cloudflare/migrations/0001_init.sql` — D1 schema (SQLite-compatible, generated from the Prisma datamodel)
- `cloudflare/seed/seed-demo.sql` — optional demo data
- `cloudflare/snippets/db-d1.ts` — the D1 adapter wiring reference for `src/lib/db.ts` (deploy-time)
- `cloudflare/env.d.ts` — `CloudflareEnv` typings for the bindings
- `cloudflare/generated/` — Prisma client output (gitignored)
