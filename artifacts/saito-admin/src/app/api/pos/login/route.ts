import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { verifyPin } from '@/lib/crypto';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Map Azerbaijani role names to English equivalents used by API auth
function normalizeRole(role: string): string {
  const map: Record<string, string> = {
    'Kassir': 'cashier',
    'Ofisiant': 'kitchen',
    'Menecer': 'admin',
    'Barmen': 'kitchen',
    'Aşpaz': 'kitchen',
    'Superadmin': 'superadmin',
  };
  return map[role] || role;
}

export async function POST(request: Request) {
  const { pin } = await request.json();
  if (!pin || typeof pin !== 'string') {
    return NextResponse.json({ error: 'PIN tələb olunur' }, { status: 400 });
  }

  const s = svc();

  // Bütün aktiv staff-ları yüklə — plain text və hash PIN-i yoxla
  const { data: allStaff, error } = await s
    .from('staff')
    .select('id, name, role, is_active, shift, pin, pin_hash')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: 'Server xətası' }, { status: 500 });
  }

  const trimmedPin = pin.trim();
  const matched = (allStaff || []).find((st: any) => {
    // Plain text PIN match
    if (st.pin && st.pin === trimmedPin) return true;
    // Hashed PIN match
    if (st.pin_hash && verifyPin(trimmedPin, st.pin_hash)) return true;
    return false;
  });

  if (!matched) {
    return NextResponse.json({ error: 'Yanlış PIN' }, { status: 401 });
  }

  // Clock-in yaz
  await s.from('clock_events').insert({
    staff_id: matched.id,
    clock_in: new Date().toISOString(),
  });

  // Session yarat
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

  await s.from('sessions').insert({
    token,
    user_id: matched.id,
    role: normalizeRole(matched.role),
    expires_at: expiresAt.toISOString(),
  });

  return NextResponse.json({
    staffId: matched.id,
    name: matched.name,
    role: matched.role,
    shift: matched.shift,
    token,
    expiresAt: expiresAt.toISOString(),
  });
}
