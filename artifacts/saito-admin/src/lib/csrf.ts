import { NextRequest, NextResponse } from 'next/server';

export function validateCsrfToken(req: NextRequest): boolean {
  const csrfToken = req.headers.get('x-csrf-token');
  const cookieToken = req.headers.get('cookie')?.match(/saito_csrf=([^;]+)/)?.[1];
  
  if (!csrfToken || !cookieToken) return false;
  if (csrfToken !== cookieToken) return false;
  
  return true;
}

export function setCsrfCookie(response: NextResponse): void {
  const token = crypto.randomUUID();
  response.cookies.set('saito_csrf', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  });
  response.headers.set('X-CSRF-Token', token);
}
