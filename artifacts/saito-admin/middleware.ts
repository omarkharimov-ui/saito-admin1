import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get('saito_role')?.value;
  const isLoggedIn = request.cookies.get('isLoggedIn')?.value === 'true';

  // ── Skip auth for login and static files ──────────────────
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // ── Admin routes ──────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!isLoggedIn || !role || !ADMIN_ROLES.has(role)) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── Kitchen route ────────────────────────────────────────
  if (pathname.startsWith('/kitchen')) {
    if (!isLoggedIn || !role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role !== 'kitchen' && !ADMIN_ROLES.has(role)) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  // ── Root redirection ────────────────────────────────────
  if (pathname === '/' || pathname === '/admin') {
    if (isLoggedIn && role && ADMIN_ROLES.has(role)) {
      if (pathname === '/admin') return NextResponse.next();
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (!isLoggedIn) {
       return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/kitchen/:path*'],
};
