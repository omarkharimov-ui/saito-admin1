import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: '4 rəqəmli PIN tələb olunur' }, { status: 400 });
    }

    const supabase = svc();

    const { data: user } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('pin', pin)
      .eq('is_active', true)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ error: 'PIN yanlışdır' }, { status: 401 });
    }

    // Generate session token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 saat

    await supabase.from('sessions').insert({
      token,
      user_id: user.id,
      role: user.role,
      expires_at: expiresAt,
    });

    const cookieStore = await cookies();
    cookieStore.set('saito_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });

    return NextResponse.json({ success: true, role: user.role });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
