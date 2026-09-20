import { NextResponse, NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/api/auth/staff-login',
  '/api/auth/pin-login',
  '/api/auth/verify-pin',
  '/api/auth/send-code',
  // Public-safe settings (footer info only; whitelist enforced server-side).
  '/api/public',
  // G3 (O frozen contract): QR customer self-service. PUBLIC by design — the
  // /menu page is public and the caller sends no staff token. Abuse control =
  // the route's IP rate limit; location/org are server-trusted (table row).
  // NEVER gate this with staff requirePermission (it is not a staff path).
  '/api/orders/qr',
  '/api/kitchen-auth',
  '/staff/login',
  '/login',
  '/_next',
  '/favicon.ico',
  '/about',
  '/menu',
  '/reservation',
  '/unauthorized',
  // P-8 (Q4): external cron trigger — called without a staff cookie; the route
  // itself enforces Bearer CRON_SECRET.
  '/api/cron/',
  // pr v1: headless LAN print agent — called without a staff cookie; the route
  // itself enforces the device agent_key (48-hex secret, per-device).
  '/api/print/agent',
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
    // Session probe with one retry: the edge-runtime fetch pool races the PostgREST
    // LB's keep-alive reaping (proven 2026-09-19: parallel probe 14x200 + 1xEPROTO;
    // sustained false-401 wave on VALID tokens during P-7 half-2 while identical
    // non-edge probes stayed 200). A transient probe failure must NOT be reported as
    // "unauthorized" (that bounces live POS staff to login mid-service): retry once
    // on a fresh connection; if it still fails, fall through to the catch contract
    // below — the request continues and the route re-checks the session properly.
    const probeUrl = `${supabaseUrl}/rest/v1/sessions?select=expires_at,role,status,revoked_at&token=eq.${encodeURIComponent(token)}&limit=1`;
    const probeHeaders = { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` };
    let response = await fetch(probeUrl, { headers: probeHeaders });
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch { /* noop */ }
      response = await fetch(probeUrl, { headers: probeHeaders, cache: 'no-store' });
    }

    if (!response.ok) {
      // Still failing after retry = transient infra (pooler/LB reset). Do NOT 401:
      // let the request continue; the route re-checks the session and answers
      // properly (or the client's retry handles it).
      throw new Error(`session probe failed after retry: HTTP ${response.status}`);
    }

    let sessions = await response.json();
    let session = Array.isArray(sessions) ? sessions[0] : null;

    // Transiently EMPTY result for an existing token (edge-pool race, proven
    // 2026-09-19) must not bounce live staff to login: retry the probe once on a
    // fresh connection. Still empty → let the request continue; the route
    // re-checks the session and answers properly (genuinely bad tokens still
    // 401 at the route — security semantics preserved, middleware stays a
    // pre-filter).
    if (!session) {
      try { await response.body?.cancel?.(); } catch { /* noop */ }
      const retry = await fetch(probeUrl, { headers: probeHeaders, cache: 'no-store' });
      if (retry.ok) {
        const rows = await retry.json();
        session = Array.isArray(rows) ? rows[0] : null;
      }
      if (!session) return NextResponse.next();
    }

    // Contract §3: revoked (logout / force_logout / status-revoke) session
    // must be rejected even before it expires.
    if (session.revoked_at
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
