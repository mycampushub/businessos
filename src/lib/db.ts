import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// M25-db: Prisma client extension for automatic soft-delete filtering.
// Models with `deletedAt` are automatically filtered to exclude soft-deleted rows
// on all read queries (findMany, findFirst, findUnique, count, aggregate, groupBy).
// Routes that need to see deleted rows can explicitly pass `deletedAt` in the where clause.
const SOFT_DELETE_MODELS = ['task', 'invoice', 'expense', 'payrollRun', 'payslip', 'membership', 'document'] as const

function addDeletedAtFilter(args: { where?: Record<string, unknown> }): { where: Record<string, unknown> } {
  const where = args.where ?? {}
  // Only add the filter if the caller hasn't explicitly specified deletedAt
  if (!('deletedAt' in where)) {
    where.deletedAt = null
  }
  return { ...args, where }
}

const baseClient = globalForPrisma.prisma ?? new PrismaClient({ log: ['query'] })

export const db = baseClient.$extends({
  query: Object.fromEntries(
    SOFT_DELETE_MODELS.map((model) => [
      model,
      {
        async findMany({ args, query }: { args: any; query: any }) {
          return query(addDeletedAtFilter(args))
        },
        async findFirst({ args, query }: { args: any; query: any }) {
          return query(addDeletedAtFilter(args))
        },
        async findUnique({ args, query }: { args: any; query: any }) {
          // findUnique uses `where` with unique fields — only filter if it's not an id-only lookup
          // that might need to find a soft-deleted row by id for restore
          if (args.where && 'deletedAt' in args.where) return query(args)
          if (!args.where || (!('deletedAt' in args.where))) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },
        async count({ args, query }: { args: any; query: any }) {
          return query(addDeletedAtFilter(args))
        },
        async aggregate({ args, query }: { args: any; query: any }) {
          return query(addDeletedAtFilter(args))
        },
        async groupBy({ args, query }: { args: any; query: any }) {
          return query(addDeletedAtFilter(args))
        },
      },
    ])
  ),
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = baseClient