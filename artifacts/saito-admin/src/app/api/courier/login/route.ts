// ============================================================================
// 2026-10-02 (12a): COURIER APP LOGIN — the courier's own 4-digit PIN (staff
// role 'courier'). Returns {name, phone} + sets the httpOnly courier_token
// cookie (stateless — see lib/courier-auth). No saito auth needed: this is
// the courier's OWN app on their phone.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { verifyPin } from '@/lib/crypto';
import { courierToken, loginGuard } from '../../lib/courier-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } };
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local';
    const guard = loginGuard(ip);
    if (guard.locked) return NextResponse.json({ error: 'Çox səhv PIN — 1 dəqiqə gözlə' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const pin = String(body.pin || '').trim();
    if (!/^\d{3,6}$/.test(pin)) return NextResponse.json({ error: 'PIN daxil edin (4 rəqəm)' }, { status: 400 });

    const s = svc();
    const res = await fetch(
      `${s.url}/rest/v1/staff?is_active=eq.true&pin_hash=not.is.null&select=id,name,phone,role_id,pin_hash`,
      { headers: s.headers },
    );
    if (!res.ok) return NextResponse.json({ error: 'Giriş etmir' }, { status: 500 });
    const staff: any[] = await res.json();
    // courier-role rows only (role filter via a second query keeps REST simple)
    const roleIds = [...new Set(staff.map((x) => x.role_id))];
    let courierIds = new Set<string>();
    if (roleIds.length) {
      const roleRes = await fetch(
        // PGRST100 (this PostgREST build): inside or/and logic trees the ONLY
        // accepted comparison form is `col.op.value` (dot, no `=` before the
        // operator) — bare `col=value` and `col=eq.value` both fail to parse.
        `${s.url}/rest/v1/roles?or=(${roleIds.map((r) => `id.eq.${r}`).join(',')})&select=id,name`,
        { headers: s.headers },
      );
      if (roleRes.ok) {
        for (const r of await roleRes.json()) if (r.name === 'courier') courierIds.add(r.id);
      }
    }
    const candidates = staff.filter((x) => courierIds.has(x.role_id));
    const matched = candidates.find((x) => typeof x.pin_hash === 'string' && verifyPin(pin, x.pin_hash));
    if (!matched) {
      guard.fail();
      return NextResponse.json({ error: 'Səhv PIN' }, { status: 401 });
    }

    guard.ok();
    const resJson = NextResponse.json({ success: true, courier: { id: matched.id, name: matched.name, phone: matched.phone } });
    resJson.cookies.set('courier_token', courierToken(matched.id, matched.pin_hash), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60, path: '/',
    });
    return resJson;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Login xətası' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  res.cookies.set('courier_token', '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
