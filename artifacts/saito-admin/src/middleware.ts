import { NextResponse, NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/api/auth/staff-login',
  '/api/auth/pin-login',
  '/api/auth/verify-pin',
  '/api/auth/send-code',
  // Public-safe settings (footer info only; whitelist enforced server-side).
  '/api/public',
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

function apiUnauthorized(request: NextRequest) {
  // API calls must NEVER receive a 307 → HTML login page: the browser fetch
  // would parse the login page as JSON and crash the whole POS floor
  // ("Unexpected token '<'"). Return JSON 401 and let the route/handlers
  // react (toast + re-login flow).
  return NextResponse.json({ error: 'Unauthorized', login: '/staff/login' }, { status: 401 });
}

function pageUnauthorized(request: NextRequest) {
  const url = new URL('/staff/login', request.url);
  const res = NextResponse.redirect(url);
  res.cookies.set('saito_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: new Date(0), path: '/' });
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Assets (images, fonts) always pass through
  if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/.test(pathname)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith('/api/');
  const token = request.cookies.get('saito_token')?.value;
  if (!token) {
    return isApi ? apiUnauthorized(request) : pageUnauthorized(request);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.next();
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/sessions?select=expires_at,role,status,revoked_at&token=eq.${encodeURIComponent(token)}&limit=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      return isApi ? apiUnauthorized(request) : pageUnauthorized(request);
    }

    const sessions = await response.json();
    const session = Array.isArray(sessions) ? sessions[0] : null;

    // Contract §3: revoked (logout / force_logout / status-revoke) session
    // must be rejected even before it expires.
    if (!session
      || session.revoked_at
      || session.status === 'REVOKED'
      || new Date(session.expires_at).getTime() < Date.now()) {
      return isApi ? apiUnauthorized(request) : pageUnauthorized(request);
    }
  } catch {
    // TRANSIENT failure (e.g. intermittent pooler TLS reset). Do NOT bounce
    // the user to login on a hiccup — let the request continue; the actual
    // route re-checks the session and answers properly (or the client's
    // retry handles it). Only hard 401s above force re-login.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/kitchen/:path*', '/staff/:path*', '/api/:path*', '/'],
};
