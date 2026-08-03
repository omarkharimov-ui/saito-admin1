import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function requireActiveShift(managerOverride = false): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { ok: true };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shifts?select=id,closed_at&closed_at=is.null&limit=1`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    if (!res.ok) {
      return { ok: true };
    }

    const data = await res.json();
    const activeShift = Array.isArray(data) ? data[0] : null;

    if (!activeShift && !managerOverride) {
      return { ok: false, error: 'Smena bağlıdır. Mütəşəddim icazəsi ilə əməliyyat edə bilərsiniz.' };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
