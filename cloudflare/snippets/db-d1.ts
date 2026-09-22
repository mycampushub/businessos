/**
 * Prisma on Cloudflare D1 — deploy-time wiring reference
 * ------------------------------------------------------
 * The OrgOS schema (prisma/schema.prisma) uses the SQLite dialect, which is
 * exactly what D1 speaks. In production you swap the PrismaClient construction
 * to use the D1 driver adapter; every query in src/app/api/** keeps working
 * unchanged.
 *
 * HONEST LIMITATION (as of this writing): `src/lib/db.ts` still constructs the
 * plain local PrismaClient (`new PrismaClient()`). The D1 adapter wiring below
 * is what `src/lib/db.ts` must look like on the Workers runtime — apply it
 * (either behind the CF_WORKER flag or via the OpenNext worker entry) as part
 * of the deploy checklist in cloudflare/README.md. Until then, D1-backed
 * queries do not run on the worker with the committed db.ts as-is.
 *
 * Install (dev deps are enough for the build):
 *   bun add -d @prisma/adapter-d1
 *
 * Client generation for the Workers/D1 path (queryCompiler + driverAdapters):
 *   bunx prisma generate --schema cloudflare/schema.workers.prisma
 *   → emits TS client into cloudflare/generated/prisma (gitignored)
 *
 * The snippet below mirrors src/lib/db.ts for the Workers runtime:
 *   import { PrismaClient } from '../cloudflare/generated/prisma/client'
 *   import { PrismaD1 } from '@prisma/adapter-d1'
 *   import { getCloudflareContext } from '@opennextjs/cloudflare/api'
 *
 *   const { env } = getCloudflareContext().env
 *   const adapter = new PrismaD1(env.DATABASE)
 *   export const db = new PrismaClient({ adapter })
 */

// import { PrismaClient } from '../cloudflare/generated/prisma/client'
// import { PrismaD1 } from '@prisma/adapter-d1'
// import { getCloudflareContext } from '@opennextjs/cloudflare/api'
//
// const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
//
// export function getDb(): PrismaClient {
//   if (globalForPrisma.prisma) return globalForPrisma.prisma
//   const { env } = getCloudflareContext().env
//   const adapter = new PrismaD1(env.DATABASE)
//   const prisma = new PrismaClient({ adapter })
//   globalForPrisma.prisma = prisma
//   return prisma
// }

export {}
