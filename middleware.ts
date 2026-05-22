import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get('saito_role')?.value;

  // ── Kitchen route ────────────────────────────────────────
  if (pathname.startsWith('/kitchen')) {
    if (role !== 'kitchen' && role !== 'superadmin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/kitchen/:path*'],
};
