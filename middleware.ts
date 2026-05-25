import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get('saito_role')?.value;
  const isLoggedIn = request.cookies.get('isLoggedIn')?.value === 'true';

  // Check if request has standalone param (PWA redirect)
  const hasStandaloneParam = request.nextUrl.searchParams.get('standalone') === 'true';

  // ── Admin routes ──────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // If not logged in and no standalone param, send to landing page
    if (!isLoggedIn && !hasStandaloneParam) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // Allow through — client-side auth (useAdminAuth) handles role enforcement
    return NextResponse.next();
  }

  // ── Kitchen route ────────────────────────────────────────────────────
  if (pathname.startsWith('/kitchen')) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/kitchen/:path*', '/reservation', '/about'],
};
