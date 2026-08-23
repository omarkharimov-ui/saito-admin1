import { NextRequest, NextResponse } from 'next/server';

export function validateCsrfToken(req: NextRequest, authenticated = false): boolean {
  const csrfHeader = req.headers.get('x-csrf-token');
  const cookieHeader = req.headers.get('cookie') || '';
  
  const cookieMatch = cookieHeader.match(/saito_csrf=([^;]+)/);
  const cookieToken = cookieMatch ? cookieMatch[1] : null;
  
  if (!authenticated) return true;
  if (!csrfHeader || !cookieToken) return false;
  if (csrfHeader !== cookieToken) return false;
  
  return true;
}

export function setCsrfCookie(response: NextResponse): string {
  const token = crypto.randomUUID();
  
  response.cookies.set('saito_csrf', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  });
  
  return token;
}
