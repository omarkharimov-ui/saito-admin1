import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyManagerPin } from '@/lib/managerPin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// QF3 (RED #1): unified shift gate with an honest manager-PIN override.
// If the request body carries `manager_pin`, it is verified (manager role +
// rate limit) and used as the shift-lock override; otherwise the plain
// active-shift rule applies.
export async function shiftGate(
  req: NextRequest,
  body: any
): Promise<{ ok: boolean; error?: string; pin_required?: boolean }> {
  const managerPin = body?.manager_pin;
  if (managerPin) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const pin = await verifyManagerPin(String(managerPin), ip);
    return pin.ok ? { ok: true } : { ok: false, error: pin.error, pin_required: true };
  }
  const shiftCheck = await requireActiveShift();
  return shiftCheck.ok ? { ok: true } : { ok: false, error: shiftCheck.error };
}

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

    return { ok: false, error: 'Smena bağlıdır. İdarəçi PIN ilə davam edin.' };
  } catch {
    return { ok: true };
  }
}
