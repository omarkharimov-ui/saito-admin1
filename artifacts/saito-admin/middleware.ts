import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

async function hasUsers(request: NextRequest): Promise<boolean> {
  try {
    const url = new URL('/api/auth/users', request.url);
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error('Failed to fetch user status');
      return true; // Assume users exist to be safe
    }
    const data = await response.json();
    return data.hasUsers;
  } catch (error) {
    console.error('Error checking for users:', error);
    return true; // Assume users exist on error
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get('saito_role')?.value;
  const isLoggedIn = request.cookies.get('isLoggedIn')?.value === 'true';

  // Check for initial setup
  const usersExist = await hasUsers(request);

  if (!usersExist && !pathname.startsWith('/admin/settings')) {
     const setupUrl = new URL('/admin/settings', request.url);
     setupUrl.searchParams.set('section', 'users');
     setupUrl.searchParams.set('setup', 'true');
     return NextResponse.redirect(setupUrl);
  }

  // Allow access to the settings page for setup
  if (pathname.startsWith('/admin/settings') && request.nextUrl.searchParams.get('setup') === 'true') {
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
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // ── Root (table grid) ────────────────────────────────────
  // Only redirect logged-in admins away from landing to admin panel
  if (pathname === '/') {
    if (isLoggedIn && role && ADMIN_ROLES.has(role)) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/kitchen/:path*'],
};
