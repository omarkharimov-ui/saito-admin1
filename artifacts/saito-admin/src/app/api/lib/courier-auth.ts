// ============================================================================
// 2026-10-02 (12a): COURIER APP AUTH — stateless PIN-based session.
//
// Couriers = staff (role 'courier') with their own 4-digit pin_hash (Task 37
// SSOT; same crypto as the staff login — hashPin/verifyPin in lib/crypto).
// Token = `<staffId>.<sha256(pinHash + ':' + SALT)[:32]>` — verifiable
// WITHOUT storing the raw pin: it is derived from the staff row's pin_hash,
// so a PIN reset invalidates old tokens automatically. The 4-digit PIN itself
// is the only secret (login); the cookie rides httpOnly for 12h.
// ============================================================================
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const COURIER_SALT = 'saito-courier-v1';

export function courierToken(staffId: string, pinHash: string): string {
  const sig = crypto.createHash('sha256').update(`${pinHash}:${COURIER_SALT}`).digest('hex').slice(0, 32);
  return `${staffId}.${sig}`;
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } };
}

/** Resolve the cookie to an active courier-role staff row, or null. */
export async function getCookieCourier(req: NextRequest): Promise<{ id: string; name: string; phone: string | null } | null> {
  const token = req.cookies.get('courier_token')?.value;
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 36) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/staff?id=eq.${id}&is_active=eq.true&select=id,name,phone,role_id,pin_hash`, { headers: s.headers });
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    const st = rows[0];
    if (!st || !st.pin_hash || !st.role_id) return null;
    // role must be 'courier' (Task 37 SSOT)
    const roleRes = await fetch(`${s.url}/rest/v1/roles?id=eq.${st.role_id}&select=name`, { headers: s.headers });
    if (!roleRes.ok) return null;
    const roles: any[] = await roleRes.json();
    if (roles[0]?.name !== 'courier') return null;
    if (courierToken(st.id, st.pin_hash) !== token) return null;
    return { id: st.id, name: st.name, phone: st.phone };
  } catch {
    return null;
  }
}

/** Brute-force guard for PIN login: 10 failures / 10 min per IP → 60 s lock. */
const attempts = new Map<string, { n: number; t: number }>();
export function loginGuard(ip: string): { locked: boolean; fail(): void; ok(): void } {
  const now = Date.now();
  let a = attempts.get(ip);
  if (a && now - a.t > 10 * 60 * 1000) { a = undefined; attempts.delete(ip); }
  if (!a) a = { n: 0, t: now };
  return {
    locked: a.n >= 10,
    fail() { a!.n += 1; a!.t = now; attempts.set(ip, a); },
    ok() { attempts.delete(ip); },
  };
}
