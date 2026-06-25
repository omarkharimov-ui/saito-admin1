import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasPermission, Role } from './lib/permissions';

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
  const role = request.cookies.get('saito_role')?.value as Role | undefined;

  // Public paths skip auth
  const isPublicPath = url.pathname.startsWith('/login') || 
                       url.pathname.startsWith('/unauthorized') ||
                       url.pathname.includes('.');
  
  if (isPublicPath) return response;

  // 1. Authenticated check
  if (!session) {
    if (url.pathname.startsWith('/api/')) {
      const isPublicApi = url.pathname.startsWith('/api/auth/login') || 
                          url.pathname.startsWith('/api/auth/register') || 
                          url.pathname.startsWith('/api/public');
      if (!isPublicApi) {
        return new NextResponse(
          JSON.stringify({ error: 'Unauthenticated' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return response;
    }
    
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', url.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Authorization (RBAC) check
  const isApiRoute = url.pathname.startsWith('/api/');
  
  if (role) {
    const allowed = hasPermission(role, url.pathname, isApiRoute);
    
    if (!allowed) {
      if (isApiRoute) {
        return new NextResponse(
          JSON.stringify({ error: 'Forbidden: Insufficient permissions' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  } else if (!isApiRoute || !url.pathname.startsWith('/api/auth/me')) {
    // If we have a session but no role cookie, we might need to fetch it or redirect
    // For now, if it's a page and no role, redirect to unauthorized
    if (!isApiRoute) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
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

