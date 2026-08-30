import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { verifyPin } from '@/lib/crypto';
import crypto from 'crypto';

function canonicalRole(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes('ofisiant') || r === 'waiter') return 'waiter';
  if (r.includes('kassir') || r === 'kassa' || r === 'cashier') return 'cashier';
  if (r.includes('aşpaz') || r === 'kitchen') return 'kitchen';
  if (r.includes('barmen') || r === 'bartender') return 'bartender';
  if (r.includes('menecer') || r.includes('menedjer') || r === 'manager') return 'manager';
  if (r === 'admin') return 'admin';
  if (r === 'superadmin') return 'superadmin';
  if (r === 'owner') return 'owner';
  return 'cashier';
}

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    if (!pin || pin.length !== 4) {
      return NextResponse.json({ error: '4 rəqəmli PIN daxil edin' }, { status: 400 });
    }

    let staff: any = null;
    let error: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 400));
      const client = await createAuthClient();
      const res = await client
        .from('staff')
        .select('id, name, full_name, role, pin_hash, is_active, shift, role_id, roles(name)')
        .eq('is_active', true)
        .limit(100);
      staff = res.data;
      error = res.error;
      if (!error) break;
    }

    if (error || !staff) {
      return NextResponse.json({ error: 'Xəta' }, { status: 500 });
    }

    const trimmedPin = pin.trim();
    const matched = staff.find((s: any) => verifyPin(trimmedPin, s.pin_hash));

    if (!matched) {
      return NextResponse.json({ error: 'Yanlış PIN' }, { status: 401 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const role = (matched as any).roles?.[0]?.name || 'cashier';

    await (await createAuthClient()).from('sessions').insert({
      token,
      user_id: matched.id,
      role,
      expires_at: expiresAt,
    });

    const res = NextResponse.json({
      success: true,
      staffId: matched.id,
      name: matched.full_name || matched.name,
      role: matched.role,
      canonicalRole: role,
      shift: matched.shift,
      token,
      expiresAt,
    });

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
