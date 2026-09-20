import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// CP-1 (2026-09-20, map §6 gap): customer profile fields — birthday / email
// / notes. Additive on the frozen customers table (migration
// 20260920000003); no existing contract touched.
// Body: { birthday?: 'YYYY-MM-DD' | null, email?: string | null, notes?: string | null }
// SECURITY CHAIN (Rule 10): staff session -> requireAuth -> role gate ->
// service_role client -> fixed-column UPDATE (no client SQL) -> log_audit.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROFILE_ROLES = ['admin', 'manager', 'superadmin', 'owner'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!PROFILE_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Next 15+: params is async (await required at runtime).
    const { id } = await params;
    if (!UUID_RE.test(String(id || ''))) {
      return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (body.birthday !== undefined) {
      if (body.birthday === null || body.birthday === '') patch.birthday = null;
      else if (typeof body.birthday === 'string' && DATE_RE.test(body.birthday)) patch.birthday = body.birthday;
      else return NextResponse.json({ error: 'birthday must be YYYY-MM-DD or null' }, { status: 400 });
    }
    if (body.email !== undefined) {
      if (body.email === null || body.email === '') patch.email = null;
      else if (typeof body.email === 'string' && body.email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) patch.email = body.email.trim().toLowerCase();
      else return NextResponse.json({ error: 'email must be a valid address or null' }, { status: 400 });
    }
    if (body.notes !== undefined) {
      if (body.notes === null || body.notes === '') patch.notes = null;
      else if (typeof body.notes === 'string') patch.notes = body.notes.trim().slice(0, 2000);
      else return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const supabase = await createAuthClient();

    const { data: before, error: beforeErr } = await supabase
      .from('customers')
      .select('id, birthday, email, notes')
      .eq('id', id)
      .limit(1)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: updated, error: upErr } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', id)
      .select('id, name, phone, birthday, email, notes')
      .limit(1)
      .single();
    if (upErr) throw upErr;

    // audit (best-effort — the update already committed)
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (url && key) {
        await fetch(`${url}/rest/v1/rpc/log_audit`, {
          method: 'POST',
          headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_action: 'customer_profile_update',
            p_entity_type: 'customer',
            p_entity_id: id,
            p_actor_id: auth.user?.id || null,
            p_actor_name: null,
            p_old_data: JSON.stringify({ birthday: before.birthday, email: before.email, notes: before.notes }),
            p_new_data: JSON.stringify({ birthday: updated.birthday, email: updated.email, notes: updated.notes }),
            p_metadata: null,
            p_ip_address: null,
          }),
        });
      }
    } catch { /* audit is non-fatal here (route-level write, not RPC) */ }

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
