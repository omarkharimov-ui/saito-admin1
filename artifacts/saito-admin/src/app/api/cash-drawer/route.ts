import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
import { verifyPin } from '@/lib/crypto';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// P-8 (D-1): GET requires cash.view and is scoped to the OPERATOR'S location
// (was: any authenticated role reading the global newest open session).
export async function GET() {
  const auth = await requirePermission('cash.view');
  if (!auth.authenticated) return auth;
  const s = svc();
  try {
    const opLoc = await resolveWriteLocationContext(auth.user!.id);
    if (!opLoc?.locationId) {
      return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    }

    const { data: session, error: sessErr } = await s
      .from('cash_drawer_sessions')
      .select('*')
      .eq('status', 'open')
      .eq('location_id', opLoc.locationId)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr && sessErr.code !== 'PGRST116') {
      return NextResponse.json({ error: sessErr.message }, { status: 500 });
    }

    let movements: any[] = [];
    if (session) {
      const { data } = await s
        .from('cash_drawer_log')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });
      movements = data || [];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todaySessions } = await s
      .from('cash_drawer_sessions')
      .select('*, opened_by:opened_by(name), closed_by:closed_by(name)')
      .eq('location_id', opLoc.locationId)
      .gte('opened_at', todayStart.toISOString())
      .order('opened_at', { ascending: false });

    // Calculate card/voucher total from cash_drawer_log for each session
    const sessionsWithCardTotal = await Promise.all((todaySessions || []).map(async (session: any) => {
      const { data: cardLogs } = await s
        .from('cash_drawer_log')
        .select('amount')
        .eq('session_id', session.id)
        .eq('type', 'card_payment');

      const cardTotal = (cardLogs || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      return { ...session, card_total: cardTotal };
    }));

    return NextResponse.json({
      session: session || null,
      movements,
      todaySessions: sessionsWithCardTotal || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = svc();
  const body = await req.json();
  const { action, amount, description, session_id } = body;

  try {
    if (action === 'open') {
      const auth = await requirePermission('cash.open');
      if (!auth.authenticated) return auth;

      // S-08 (frozen): identity = session token (A-frozen set_session_staff);
      // loc/org + 1:1 shift bind resolved server-side inside the RPC.
      const { data, error: rpcError } = await s.rpc('open_cash_register', {
        p_token: auth.token,
        p_opening_balance: amount || 0,
        p_notes: description || null,
      });

      if (rpcError) throw rpcError;

      return NextResponse.json(data, { status: data?.success === false ? 400 : 200 });
    }

    if (action === 'close') {
      const auth = await requirePermission('cash.close');
      if (!auth.authenticated) return auth;
      const staffId = auth.user?.id || null;

      // P-8 (D-5): the approver identity comes ONLY from a server-verified
      // manager PIN. body.manager_id is no longer accepted (client-supplied
      // approver uuids were spoofable). The DB re-asserts manager role +
      // is_active + SAME ORGANIZATION (close_cash_register_v2).
      let managerId: string | null = null;
      if (body.manager_pin) {
        const { data: staffUsers } = await s
          .from('staff')
          .select('id, name, pin_hash, organization_id')
          .eq('is_active', true)
          .not('pin_hash', 'is', null)
          .limit(100);
        const mgr = (staffUsers || []).find(
          (u: any) => u.pin_hash && verifyPin(String(body.manager_pin), u.pin_hash)
        );
        if (!mgr) {
          return NextResponse.json({ error: 'Invalid manager PIN' }, { status: 401 });
        }
        const { data: mgrPerm } = await s.rpc('has_permission', {
          p_staff_id: mgr.id,
          p_permission: 'cash.close.approve',
        });
        if (!mgrPerm) {
          return NextResponse.json({ error: 'Manager cannot approve cash closes' }, { status: 403 });
        }
        managerId = mgr.id;
      }

      // P-8 (D-10/D-11): token-bound identity (PERFORMER_MISMATCH / ORG /
      // LOCATION enforced in the DB) + optional client idempotency key
      // (namespace 'drawer'; E/S-frozen keyless calls remain legal).
      const { data: rpcResult, error: rpcErr } = await s.rpc('close_cash_register_v2', {
        p_session_id: session_id,
        p_actual_cash: Number(amount) || 0,
        p_notes: description || null,
        p_manager_id: managerId,
        p_performed_by: staffId,
        p_token: auth.token,
        p_idempotency_key: body.idempotency_key || null,
      });

      if (rpcErr) throw rpcErr;
      if (!rpcResult?.success) {
        return NextResponse.json(rpcResult, { status: rpcResult?.requires_approval ? 403 : 400 });
      }

      return NextResponse.json(rpcResult);
    }

    if (action === 'cash_in' || action === 'cash_out') {
      const auth = await requirePermission(action === 'cash_in' ? 'cash.in' : 'cash.out');
      if (!auth.authenticated) return auth;
      const staffId = auth.user?.id || null;

      const rpcName = action === 'cash_in' ? 'cash_in_atomic' : 'cash_out_atomic';
      const { data: rpcResult, error: rpcErr } = await s.rpc(rpcName, {
        p_session_id: session_id,
        p_amount: Math.abs(Number(amount)),
        p_description: description || (action === 'cash_in' ? 'Kassa daxilolma' : 'Kassa xərc'),
        p_performed_by: staffId,
        p_token: auth.token,
        p_idempotency_key: body.idempotency_key || null,
      });

      if (rpcErr) throw rpcErr;
      if (!rpcResult?.success) {
        return NextResponse.json(rpcResult, { status: 400 });
      }

      return NextResponse.json(rpcResult);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
