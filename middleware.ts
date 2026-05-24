import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get('saito_role')?.value;
  
  // Check if request is from standalone app
  const userAgent = request.headers.get('user-agent') || '';
  const isStandalone = 
    request.headers.get('sec-fetch-dest') === 'document' && 
    request.headers.get('sec-fetch-mode') === 'navigate' &&
    !userAgent.includes('Mozilla') && 
    pathname.startsWith('/admin');
  
  const isPWA = request.headers.get('sec-fetch-dest') === 'document' && 
                request.nextUrl.searchParams.get('standalone') === 'true';

  // ── Admin routes - Only allow from standalone app ─────────────────────
  if (pathname.startsWith('/admin')) {
    // Block direct browser access to admin routes
    if (!isStandalone && !isPWA) {
      return NextResponse.redirect(new URL('/?blocked=true', request.url));
    }
    
    // Check role for admin access
    if (!ADMIN_ROLES.has(role || '')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // ── Kitchen route ────────────────────────────────────────
  if (pathname.startsWith('/kitchen')) {
    if (role !== 'kitchen' && role !== 'superadmin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // ── Root route - Show landing page for browsers ───────────────────────
  if (pathname === '/') {
    // If standalone app trying to access root, redirect to admin
    if (isStandalone || isPWA) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/kitchen/:path*', '/reservation', '/about'],
};
