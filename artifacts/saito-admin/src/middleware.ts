import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const token = request.cookies.get('saito_token')?.value;

  const isPageRoute = !url.pathname.startsWith('/api/');
  const isAdminOrKitchen = url.pathname.startsWith('/admin') || url.pathname.startsWith('/kitchen');

  if (isPageRoute && isAdminOrKitchen) {
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', url.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const isApiRoute = url.pathname.startsWith('/api/');
  const isPublicApi = url.pathname.startsWith('/api/public/') ||
                      url.pathname.startsWith('/api/auth/me') ||
                      url.pathname.startsWith('/api/auth/pin-login');

  if (isApiRoute && !isPublicApi) {
    if (!token) {
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
