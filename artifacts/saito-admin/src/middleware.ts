import { NextResponse, NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/api/auth/staff-login',
  '/api/auth/pin-login',
  '/api/auth/verify-pin',
  '/api/auth/send-code',
  '/api/kitchen-auth',
  '/staff/login',
  '/login',
  '/_next',
  '/favicon.ico',
  '/about',
  '/menu',
  '/reservation',
  '/unauthorized',
  '/api/pwa',
  '/manifest.webmanifest',
  '/manifest-staff.json',
  '/sw.js',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Assets (images, fonts) always pass through
  if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/.test(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('saito_token')?.value;
  if (!token) {
    // Public entrance points redirect to the staff login
    const target = pathname.startsWith('/staff') ? '/staff/login' : '/staff/login';
    const url = new URL(target, request.url);
    return NextResponse.redirect(url);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.next();
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/sessions?select=expires_at,role&token=eq.${encodeURIComponent(token)}&limit=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const url = new URL('/staff/login', request.url);
      const res = NextResponse.redirect(url);
      res.cookies.set('saito_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: new Date(0), path: '/' });
      return res;
    }

    const sessions = await response.json();
    const session = Array.isArray(sessions) ? sessions[0] : null;

    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      const url = new URL('/staff/login', request.url);
      const res = NextResponse.redirect(url);
      res.cookies.set('saito_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: new Date(0), path: '/' });
      return res;
    }
  } catch {
    const url = new URL('/staff/login', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/kitchen/:path*', '/staff/:path*', '/api/:path*', '/'],
};
