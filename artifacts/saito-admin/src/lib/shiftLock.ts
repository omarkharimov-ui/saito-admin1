import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyManagerPin } from '@/lib/managerPin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 2026-09-28 (owner: "HESAB ÇAĞIR berbat işləyir" — smena bağlı olduqda
// client-ə yalnız toast gedir, PIN eskalasiyası yoxdur): the shift gate now
// accepts `approver_staff_id` (the PinGuard pattern, same as discount/void —
// the PIN was already verified client-side against /api/auth/verify-pin; the
// server re-verifies the approver is an ACTIVE manager-role staff member).
const MANAGER_ROLES = ['admin', 'manager', 'owner', 'superadmin'];

async function isManagerStaff(staffId: string): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: staffRows } = await supabase
      .from('staff')
      .select('id, role_id, is_active')
      .eq('id', staffId)
      .limit(1);
    const staff = Array.isArray(staffRows) ? staffRows[0] : null;
    if (!staff || staff.is_active !== true) return false;
    if (!staff.role_id) return false;
    const { data: roleRow } = await supabase.from('roles').select('name').eq('id', staff.role_id).maybeSingle();
    return !!roleRow?.name && MANAGER_ROLES.includes(roleRow.name);
  } catch {
    return false;
  }
}

// QF3 (RED #1): unified shift gate with an honest manager-PIN override.
// If the request body carries `manager_pin`, it is verified (manager role +
// rate limit) and used as the shift-lock override; if it carries
// `approver_staff_id` (PinGuard flow) the manager role is re-verified server-
// side; otherwise the plain active-shift rule applies.
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
  const approverStaffId = body?.approver_staff_id;
  if (approverStaffId) {
    const ok = await isManagerStaff(String(approverStaffId));
    return ok
      ? { ok: true }
      : { ok: false, error: 'İdarəçi təsdiqi təsdiqlənə bilmədi', pin_required: true };
  }
  const shiftCheck = await requireActiveShift();
  return shiftCheck.ok ? { ok: true } : { ok: false, error: shiftCheck.error, pin_required: true };
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
