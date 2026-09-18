/**
 * Prisma on Cloudflare D1 — driver adapter example
 * -----------------------------------------------
 * The OrgOS schema (prisma/schema.prisma) uses the SQLite dialect, which is exactly
 * what D1 speaks. In production you swap the PrismaClient construction to use the
 * D1 driver adapter; every query in src/app/api/** keeps working unchanged.
 *
 * Install:
 *   npm i @prisma/adapter-d1
 *
 * In the OpenNext worker entry (e.g. worker entry or src/lib/db.ts behind a flag):
 *   import { PrismaClient } from '@prisma/client'
 *   import { PrismaD1 } from '@prisma/adapter-d1'
 *   import { getCloudflareContext } from '@opennextjs/cloudflare'
 *
 *   const { env } = getCloudflareContext().env
 *   const adapter = new PrismaD1(env.DB)
 *   export const db = new PrismaClient({ adapter })
 *
 * The snippet below mirrors src/lib/db.ts for the Workers runtime.
 */

// import { PrismaClient } from '@prisma/client'
// import { PrismaD1 } from '@prisma/adapter-d1'
// import { getCloudflareContext } from '@opennextjs/cloudflare'
//
// const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
//
// export function getDb(): PrismaClient {
//   if (globalForPrisma.prisma) return globalForPrisma.prisma
//   const { env } = getCloudflareContext().env
//   const adapter = new PrismaD1(env.DB)
//   const prisma = new PrismaClient({ adapter })
//   globalForPrisma.prisma = prisma
//   return prisma
// }

export {}
