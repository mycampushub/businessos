# OrgOS — Cloudflare Deployment

The canonical Wrangler configuration lives at the **repository root** (`wrangler.toml`).
A JSONC twin (`cloudflare/wrangler.jsonc`) is kept for tooling that prefers JSON configs —
both describe the same bindings and must stay in sync.

## Resources

| Binding  | Resource            | Purpose                                        |
| -------- | ------------------- | ---------------------------------------------- |
| `DB`     | D1 database `orgos` | Relational data (mirrors `prisma/schema.prisma`) |
| `STORAGE`| R2 bucket `orgos-documents` | Document files (`Document.storageKey`)   |
| `SESSIONS`| KV namespace      | Session tokens + login rate limits             |
| `CACHE`  | KV namespace        | Dashboard aggregates, pipeline summaries       |

## Deploy

```bash
# 1. Create the resources (once) and paste their ids into wrangler.toml
npx wrangler d1 create orgos
npx wrangler r2 bucket create orgos-documents
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create CACHE

# 2. Build the Next.js app for the Workers runtime (OpenNext)
npm i -D @opennextjs/cloudflare wrangler
npm i @prisma/adapter-d1
npx opennextjs-cloudflare build

# 3. Apply the SQL schema to D1 and deploy
npx wrangler d1 migrations apply orgos --remote
npx wrangler secret put APP_SECRET   # session signing pepper
npx wrangler deploy
```

## Layout

- `wrangler.toml` (repo root) — canonical Wrangler config
- `cloudflare/wrangler.jsonc` — JSONC twin of the same config
- `cloudflare/migrations/0001_init.sql` — D1 schema (SQLite-compatible, generated from the Prisma datamodel)
- `cloudflare/snippets/db-d1.ts`, `cloudflare/snippets/storage-r2.ts` — typed helpers for the D1/R2 bindings
- `cloudflare/env.d.ts` — `CloudflareEnv` typings for the bindings
