import { NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { hashPin } from '@/lib/crypto';

/**
 * POST /api/staff/reset-pin  { staff_id, new_pin? }
 *
 * SECURITY (A-FREEZE §2/§7):
 *  - requires `staff.manage` (manager/admin) — no anonymous PIN reset
 *  - PIN hashed SERVER-SIDE with hashPin() (PBKDF2-260k) — the DB function
 *    set_staff_pin only stores the validated hash, never plaintext
 *  - banned default PINs rejected (is_banned_pin policy in DB)
 *  - response contains NO PIN (never echo credentials back)
 *  - set_staff_pin revokes all existing sessions of that staff
 */
export async function POST(req: Request) {
  try {
    const auth = await requirePermission('staff.manage');
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const staffId: string | undefined = body?.staff_id;
    if (!staffId || !/^[0-9a-f-]{36}$/i.test(staffId)) {
      return NextResponse.json({ error: 'staff_id is required (uuid)' }, { status: 400 });
    }

    // new_pin optional; if omitted → random 4-digit (non-banned).
    // Banned-list mirror of DB policy public.is_banned_pin() — keep in sync.
    const BANNED = new Set(['0000', '1111', '0001', '2222', '1234', '1213', '1122', '1212']);
    let pin: string;
    if (body?.new_pin !== undefined && body?.new_pin !== null) {
      pin = String(body.new_pin).trim();
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: 'new_pin must be 4 digits' }, { status: 400 });
      }
      if (BANNED.has(pin)) {
        return NextResponse.json({ error: 'Bu PIN dəstəklənmir (weak default). Başqa PIN seçin.' }, { status: 400 });
      }
    } else {
      do {
        pin = String(Math.floor(1000 + Math.random() * 9000));
      } while (BANNED.has(pin));
    }

    const client = await createAuthClient();
    const res = await client.rpc('set_staff_pin', {
      p_staff_id: staffId,
      p_new_pin_hash: hashPin(pin),
      p_performed_by: auth.user?.id || null,
    });

    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
    const data: any = res.data;
    if (!data?.success) {
      if (data?.error === 'INVALID_PIN_FORMAT') {
        return NextResponse.json({ error: 'PIN format rejected' }, { status: 400 });
      }
      return NextResponse.json({ error: data?.error || 'Failed to reset PIN' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      staff_id: staffId,
      message: 'PIN updated. Previous sessions revoked. Share the new PIN securely.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
