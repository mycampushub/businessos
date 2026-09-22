import { ok } from '@/lib/server/api'

// GET /api — API identity/health endpoint (uniform ok envelope)
export async function GET() {
  return ok({ name: 'OrgOS API', version: 1 })
}
