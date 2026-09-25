import { NextResponse, type NextRequest } from 'next/server'

// H8-auth fix: server-side route protection for /app.
// This middleware runs in the Edge runtime, so it CANNOT use Prisma (Node.js only).
// It performs a lightweight cookie-existence check only — the full session validation
// (expiry, suspended user, etc.) happens in withAuth on the API routes.
// This is sufficient to prevent the workspace HTML shell from being served to
// unauthenticated users.

const SESSION_COOKIE = 'orgos_session'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protect /app and all sub-paths
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (!token) {
      const signinUrl = req.nextUrl.clone()
      signinUrl.pathname = '/signin'
      signinUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(signinUrl)
    }
    // Cookie exists — let the request through. The API routes (withAuth) will
    // validate the session and return 401 if it's expired/invalid, which the
    // client-side AuthGate handles by redirecting to /signin.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*'],
}
