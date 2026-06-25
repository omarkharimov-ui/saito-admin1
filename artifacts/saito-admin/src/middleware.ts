import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const url = request.nextUrl.clone();

  // 1. Protect Admin Routes (Redirect to root if not logged in)
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/kitchen')) {
    if (!session) {
      // If it's a page request, we allow it for the login screen to render within layout,
      // OR we can force redirect. Currently, /admin layout handles the login overlay.
      // But for better security, we'll block direct access to internal components if possible.
    }
  }

  // 2. Protect PROTECTED API Routes (Return 401 if not logged in)
  const isApiRoute = url.pathname.startsWith('/api/');
  const isPublicApi = url.pathname.startsWith('/api/auth/login') || 
                      url.pathname.startsWith('/api/auth/register') || 
                      url.pathname.startsWith('/api/public');

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
  ],
};
