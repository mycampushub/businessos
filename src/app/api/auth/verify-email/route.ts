import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PAGE_CSS = `
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
         background:#09090b; color:#fafafa; }
  .card { max-width:24rem; margin:1rem; padding:2rem; border-radius:0.75rem;
          background:#18181b; border:1px solid #27272a; text-align:center; }
  h1 { margin:0 0 0.5rem; font-size:1.125rem; }
  p { margin:0; color:#a1a1aa; font-size:0.875rem; line-height:1.5; }
  .glyph { font-size:2rem; }
  .ok { color:#34d399; }
  .bad { color:#f87171; }
  a { color:#fafafa; }
`

/** Tiny standalone HTML result page (this endpoint is hit directly in a browser). */
function htmlPage(title: string, body: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — OrgOS</title>
<style>${PAGE_CSS}</style>
</head>
<body>
  <main class="card">
    ${body}
    <p style="margin-top:1.25rem"><a href="/">Continue to OrgOS →</a></p>
  </main>
</body>
</html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

const BAD_TOKEN_PAGE = `<div class="glyph bad">✕</div>
<h1>Verification link is no longer valid</h1>
<p>The token is missing, expired or was already used. Request a fresh link from Settings → Security.</p>`

/** GET /api/auth/verify-email?token= — one-shot email verification link (no SMTP in
 *  sandbox: the link is surfaced in Settings → Security). 200 success page, 410 bad token. */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''

    if (token) {
      // emailVerifyToken is not a @unique column → findFirst, not findUnique
      const user = await db.user.findFirst({
        where: { emailVerifyToken: token },
        select: { id: true },
      })
      if (user) {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date(), emailVerifyToken: null },
        })
        return htmlPage(
          'Email verified',
          `<div class="glyph ok">✓</div>
<h1>Email address verified</h1>
<p>Thanks — your email is confirmed. You can head back to your workspace.</p>`,
          200
        )
      }
    }

    // missing token, unknown token, or already used
    return htmlPage('Invalid link', BAD_TOKEN_PAGE, 410)
  } catch (err) {
    console.error('[api:auth/verify-email]', err)
    return htmlPage(
      'Verification failed',
      `<div class="glyph bad">✕</div>
<h1>Verification failed</h1>
<p>Something went wrong while verifying your email. Please try again.</p>`,
      500
    )
  }
}
