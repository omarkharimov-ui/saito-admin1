import { NextResponse, type NextRequest } from 'next/server';

async function validateToken(token: string | undefined): Promise<{ valid: boolean; role: string | null }> {
  if (!token) return { valid: false, role: null };
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return { valid: false, role: null };

  try {
    const res = await fetch(`${url}/rest/v1/sessions?select=role,expires_at&token=eq.${encodeURIComponent(token)}&limit=1`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { valid: false, role: null };
    const data = await res.json();
    const session = Array.isArray(data) ? data[0] : data;
    if (!session) return { valid: false, role: null };
    
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return { valid: false, role: null };
    }
    
    return { valid: true, role: session.role };
  } catch {
    return { valid: false, role: null };
  }
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const token = request.cookies.get('saito_token')?.value;
  const { valid, role } = await validateToken(token);

  const isPageRoute = !url.pathname.startsWith('/api/');
  const isAdmin = url.pathname.startsWith('/admin');
  const isKitchen = url.pathname.startsWith('/kitchen');

  if (isPageRoute && (isAdmin || isKitchen)) {
    if (!valid) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', url.pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (isAdmin && !['admin', 'superadmin'].includes(role || '')) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
    if (isKitchen && !['kitchen', 'superadmin'].includes(role || '')) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  const isApiRoute = url.pathname.startsWith('/api/');
  const isPublicApi = url.pathname.startsWith('/api/public/') ||
                      url.pathname.startsWith('/api/auth/me') ||
                      url.pathname.startsWith('/api/auth/pin-login');

  if (isApiRoute && !isPublicApi) {
    if (!valid) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/kitchen/:path*',
    '/api/:path*',
    '/',
  ],
};
