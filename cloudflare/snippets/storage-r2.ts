/**
 * Documents on Cloudflare R2 — example worker routes
 * --------------------------------------------------
 * The sandbox stores document metadata only (Document rows with a `storageKey`
 * like `r2://<org-slug>/<folder>/<name>`). In production, object bytes live in R2
 * and the API routes below stream them. Wire these into the OpenNext worker or a
 * dedicated Worker, then call from the app:
 *
 *   PUT    /r2/:orgId/:folder/:name   → upload (admin/member)
 *   GET    /r2/:orgId/:folder/:name   → download (tenant-scoped)
 *   DELETE /r2/:orgId/:folder/:name   → remove (uploader/admin)
 */

export interface Env {
  STORAGE: R2Bucket
  DB: D1Database
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    // path: /r2/<orgId>/<folder...>/<name>
    const key = url.pathname.replace(/^\/r2\//, '')
    if (!key) return new Response('Not found', { status: 404 })

    // TODO(tenant-safety): authenticate the session (SESSIONS KV or DB) and verify
    // the user's membership in orgId BEFORE touching the bucket. Tenant isolation
    // for object storage must be enforced here, exactly like the API routes scope
    // every query by ctx.org.id.

    switch (req.method) {
      case 'PUT': {
        const object = await env.STORAGE.put(key, req.body, {
          httpMetadata: { contentType: req.headers.get('content-type') ?? 'application/octet-stream' },
        })
        return Response.json({ ok: true, key: object.key })
      }
      case 'GET': {
        const object = await env.STORAGE.get(key)
        if (!object) return new Response('Not found', { status: 404 })
        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        headers.set('cache-control', 'private, max-age=300')
        return new Response(object.body, { headers })
      }
      case 'DELETE': {
        await env.STORAGE.delete(key)
        return Response.json({ ok: true })
      }
      default:
        return new Response('Method not allowed', { status: 405 })
    }
  },
}
