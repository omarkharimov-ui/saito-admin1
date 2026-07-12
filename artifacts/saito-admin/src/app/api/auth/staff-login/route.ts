import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    if (!pin || pin.length !== 4) {
      return NextResponse.json({ error: '4 rəqəmli PIN daxil edin' }, { status: 400 });
    }

    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, full_name, role, pin, is_active')
      .eq('is_active', true)
      .limit(100);

    if (error || !staff) {
      return NextResponse.json({ error: 'Xəta' }, { status: 500 });
    }

    const matched = staff.find((s: any) => s.pin === pin);

    if (!matched) {
      return NextResponse.json({ error: 'Yanlış PIN' }, { status: 401 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const roleMap: Record<string, string> = {
      'Ofisiant': 'cashier',
      'Baş Ofisiant': 'cashier',
      'Menecer': 'manager',
      'Barmen': 'cashier',
      'Aşpaz': 'kitchen',
      'Kassa': 'cashier',
    };

    await supabase.from('sessions').insert({
      token,
      user_id: matched.id,
      role: roleMap[matched.role] || 'cashier',
      expires_at: expiresAt,
    });

    const res = NextResponse.json({ success: true, role: matched.role, name: matched.full_name });
    res.cookies.set('saito_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(expiresAt),
      path: '/',
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
