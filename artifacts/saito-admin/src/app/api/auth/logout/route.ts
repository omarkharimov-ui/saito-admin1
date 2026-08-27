import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await import('next/headers').then(m => m.cookies());
    const token = cookieStore.get('saito_token')?.value;

    if (token) {
      const supabase = await createAuthClient();
      await supabase.from('sessions').delete().eq('token', token);
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set('saito_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0),
      path: '/',
    });
    res.cookies.set('saito_csrf', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0),
      path: '/',
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
