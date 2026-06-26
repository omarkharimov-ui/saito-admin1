import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Müvəqqəti olaraq bütün yoxlamaları keçirik
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
