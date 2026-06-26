import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const url = request.nextUrl.clone();

  const isPageRoute = !url.pathname.startsWith('/api/');
  const isAdminOrKitchen = url.pathname.startsWith('/admin') || url.pathname.startsWith('/kitchen');

  // Protect admin/kitchen pages → redirect to login
  if (isPageRoute && isAdminOrKitchen) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', url.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect API routes → return 401 if no session (except public endpoints)
  const isApiRoute = url.pathname.startsWith('/api/');
  const isPublicApi = url.pathname.startsWith('/api/public/') ||
                      url.pathname.startsWith('/api/auth/me');

  if (isApiRoute && !isPublicApi) {
    if (!session) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/kitchen/:path*',
    '/api/:path*',
    '/',
  ],
};
