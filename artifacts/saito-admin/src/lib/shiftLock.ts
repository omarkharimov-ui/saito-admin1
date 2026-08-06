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

    if (activeShift || managerOverride) {
      return { ok: true };
    }

    // No active shift. Allow operations if a shift was never opened at all,
    // otherwise require manager override.
    const everRes = await fetch(`${SUPABASE_URL}/rest/v1/shifts?select=id&limit=1`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const everData = everRes.ok ? await everRes.json() : [];
    const shiftEverOpened = Array.isArray(everData) && everData.length > 0;

    if (!shiftEverOpened) {
      return { ok: true };
    }

    return { ok: false, error: 'Smena bağlıdır. Mütəşəddim icazəsi ilə əməliyyat edə bilərsiniz.' };
  } catch {
    return { ok: true };
  }
}
