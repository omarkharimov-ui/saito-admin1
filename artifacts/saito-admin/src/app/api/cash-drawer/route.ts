import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
import { verifyPin } from '@/lib/crypto';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2026-09-23 (owner, Toast benchmark): Toast auto-closes drawers at 4 AM when
// the business day turns. We close an OPEN session whose open time belongs to
// the PREVIOUS local business day — counted = expected (drawer assumed
// accurate), clearly noted for manager review in the reports page.
function localDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

// Walk the movement log EXACTLY like the UI's canonical balance (P-8 D-4/Q2):
// 'open' rows carry the opening amount; cash_in/payment add; cash_out/refund/
// void/cash_drop subtract; 'reopen' rows are signed-negative and are
// subtracted (restoring the previous close amount). Card payments do NOT
// physically sit in the drawer, so they are excluded — same as the UI.
// The session row's expected_balance is NULL while open/paused (the frozen
// RPCs don't maintain it), so it must be computed.
async function computeExpected(s: ReturnType<typeof svc>, session: any): Promise<number> {
  const { data: logs } = await s
    .from('cash_drawer_log')
    .select('type, amount')
    .eq('session_id', session.id);
  if (!logs?.length && session.expected_balance != null) {
    return Number(session.expected_balance) || 0;
  }
  const ADD = new Set(['open', 'cash_in', 'payment']);
  const SUB = new Set(['cash_out', 'refund', 'void', 'reopen', 'cash_drop']);
  let expected = 0;
  for (const l of logs || []) {
    const amt = Number(l.amount) || 0;
    if (ADD.has(l.type)) expected += amt;
    else if (SUB.has(l.type)) expected -= amt;
  }
  return Math.round(expected * 100) / 100;
}

// Manual finalization (no frozen-RPC changes): used by the 4AM auto-close,
// the paused-drawer "SAY" flow, and deposit logging. Mirrors what
// close_cash_register_v2 writes: session fields + a 'close' log row.
async function finalizeSession(
  s: ReturnType<typeof svc>,
  session: any,
  counted: number,
  staffId: string | null,
  managerId: string | null,
  note: string | null,
) {
  const expected = await computeExpected(s, session);
  const difference = Math.round((counted - expected) * 100) / 100;
  const { error: pErr } = await s
    .from('cash_drawer_sessions')
    .update({
      status: 'closed',
      closing_balance: counted,
      expected_balance: expected,
      difference,
      closed_at: new Date().toISOString(),
      closed_by: staffId,
      approved_by: managerId,
      approval_note: note || null,
      locked: false,
    })
    .eq('id', session.id);
  if (pErr) throw pErr;
  await s.from('cash_drawer_log').insert({
    session_id: session.id,
    type: 'close',
    amount: counted,
    description: note || null,
    created_by: staffId,
  });
  return { success: true, expected, counted, difference };
}

async function verifyManagerPin(s: ReturnType<typeof svc>, pin: unknown): Promise<{ id: string; name: string } | null> {
  if (!pin) return null;
  const { data: staffUsers } = await s
    .from('staff')
    .select('id, name, pin_hash, organization_id')
    .eq('is_active', true)
    .not('pin_hash', 'is', null)
    .limit(100);
  const mgr = (staffUsers || []).find(
    (u: any) => u.pin_hash && verifyPin(String(pin), u.pin_hash)
  );
  if (!mgr) return null;
  return { id: mgr.id, name: mgr.name };
}

async function insertDenominations(s: ReturnType<typeof svc>, sessionId: string, rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const valid = rows
    .map(r => ({ denomination: Number(r?.denomination), count: Math.max(0, Math.floor(Number(r?.count) || 0)) }))
    .filter(r => r.denomination > 0 && r.count > 0);
  if (valid.length === 0) return;
  const { error } = await s.from('denomination_counts').insert(valid.map(r => ({ session_id: sessionId, ...r })));
  if (error) throw new Error(`Denomination count failed: ${error.message}`);
}

// P-8 (D-1): GET requires cash.view and is scoped to the OPERATOR'S location
// (was: any authenticated role reading the global newest open session).
// 2026-09-23: ?all=1 = reports scope (drawer history + cash activity).
export async function GET(req: Request) {
  const auth = await requirePermission('cash.view');
  if (!auth.authenticated) return auth;
  const s = svc();
  try {
    const opLoc = await resolveWriteLocationContext(auth.user!.id);
    if (!opLoc?.locationId) {
      return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    }
    const { data: locRow } = await s.from('locations').select('timezone').eq('id', opLoc.locationId).maybeSingle();
    const tz = (locRow as any)?.timezone || 'Asia/Baku';

    // 4AM business-day-turn auto-close (before anything else reads state).
    const { data: openSession } = await s
      .from('cash_drawer_sessions')
      .select('*')
      .eq('status', 'open')
      .eq('location_id', opLoc.locationId)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openSession && localDate(openSession.opened_at, tz) < localDate(new Date().toISOString(), tz)) {
      const autoExpected = await computeExpected(s, openSession);
      await finalizeSession(
        s, openSession,
        autoExpected,
        null, null,
        'Avtomatik bağlandı — növbəti iş günü (4AM qaydası)',
      );
    }

    // REPORTS SCOPE — Drawer History + Cash Activity for /admin/cash-reports.
    const all = new URL(req.url).searchParams.get('all') === '1';
    if (all) {
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data: sessions } = await s
        .from('cash_drawer_sessions')
        .select('*, opened_by:opened_by(name), closed_by:closed_by(name)')
        .eq('location_id', opLoc.locationId)
        .gte('opened_at', since)
        .order('opened_at', { ascending: false })
        .limit(100);
      const sessionIds = ((sessions || []).map(x => x.id)) as string[];
      let movements: any[] = [];
      if (sessionIds.length > 0) {
        const { data } = await s
          .from('cash_drawer_log')
          .select('*')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false })
          .limit(300);
        movements = data || [];
      }
      // Enrich (order ref + staff name + session label).
      const orderIds = Array.from(new Set(movements.map(m => m.order_id).filter(Boolean))) as string[];
      const orderRef: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { data: orderRows } = await s.from('orders').select('id, order_number, table_number, order_source').in('id', orderIds);
        for (const o of orderRows || []) {
          orderRef[o.id] = (o.table_number != null && o.order_source === 'dine_in') ? `Masa ${o.table_number}` : (o.order_number || String(o.id).slice(-4).toUpperCase());
        }
      }
      const staffIds = Array.from(new Set(movements.map(m => m.created_by).filter(Boolean))) as string[];
      const staffName: Record<string, string> = {};
      if (staffIds.length > 0) {
        const { data: staffRows } = await s.from('staff').select('id, name').in('id', staffIds);
        for (const st of staffRows || []) staffName[st.id] = st.name;
      }
      const sessLabel: Record<string, string> = {};
      for (const [i, ses] of ((sessions || []) as any[]).entries()) sessLabel[ses.id] = `#${i + 1} · ${new Date(ses.opened_at).toLocaleDateString('az', { day: '2-digit', month: '2-digit' })} ${new Date(ses.opened_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}`;
      movements = movements.map(m => ({
        ...m,
        order_ref: m.order_id ? (orderRef[m.order_id] || null) : null,
        created_by_name: m.created_by ? (staffName[m.created_by] || null) : null,
        session_label: sessLabel[m.session_id] || null,
      }));
      const { data: deposits } = await s
        .from('deposits')
        .select('*, session_id')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false });
      return NextResponse.json({ report: true, sessions, movements, deposits: deposits || [] });
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

    // 2026-09-23 (owner, Toast "count this drawer later"): paused sessions
    // wait for their final count while a new active drawer runs.
    const { data: pausedSessionRaw } = await s
      .from('cash_drawer_sessions')
      .select('*, opened_by:opened_by(name)')
      .eq('status', 'paused')
      .eq('location_id', opLoc.locationId)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // The paused row's expected_balance is NULL (see computeExpected) — attach
    // the log-walked expected so the UI "SAY" flow prefills the right number.
    const pausedSession = pausedSessionRaw
      ? { ...pausedSessionRaw, paused_expected: await computeExpected(s, pausedSessionRaw) }
      : null;

    let movements: any[] = [];
    if (session) {
      const { data } = await s
        .from('cash_drawer_log')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });
      movements = data || [];

      // AUDIT 2026-09-23: the log rows carry order_id + created_by but the UI
      // showed neither — the cashier couldn't tell which order a payment row
      // belonged to. Resolve both server-side in two batch queries.
      const orderIds = Array.from(new Set(movements.map(m => m.order_id).filter(Boolean))) as string[];
      const orderRef: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { data: orderRows } = await s
          .from('orders')
          .select('id, order_number, table_number, order_source')
          .in('id', orderIds);
        for (const o of orderRows || []) {
          if (o.table_number != null && o.order_source === 'dine_in') orderRef[o.id] = `Masa ${o.table_number}`;
          else orderRef[o.id] = o.order_number || String(o.id).slice(-4).toUpperCase();
        }
      }
      const staffIds = Array.from(new Set(movements.map(m => m.created_by).filter(Boolean))) as string[];
      const staffName: Record<string, string> = {};
      if (staffIds.length > 0) {
        const { data: staffRows } = await s.from('staff').select('id, name').in('id', staffIds);
        for (const st of staffRows || []) staffName[st.id] = st.name;
      }
      movements = movements.map(m => ({
        ...m,
        order_ref: m.order_id ? (orderRef[m.order_id] || null) : null,
        created_by_name: m.created_by ? (staffName[m.created_by] || null) : null,
      }));
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
      pausedSession: pausedSession || null,
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

      // 2026-09-23 (owner, Toast benchmark): bill-by-bill counting. The frozen
      // RPC is untouched — denomination rows are written AFTER success and the
      // sum is validated server-side against the counted amount.
      if (Array.isArray(body.denominations) && body.denominations.length > 0) {
        const billSum = body.denominations.reduce(
          (sum: number, r: any) => sum + (Number(r?.denomination) || 0) * Math.max(0, Math.floor(Number(r?.count) || 0)), 0);
        if (Math.abs(billSum - (Number(amount) || 0)) > 0.01) {
          return NextResponse.json({ error: 'BILL_SUM_MISMATCH', bill_sum: billSum, counted: Number(amount) || 0 }, { status: 400 });
        }
        try {
          await insertDenominations(s, session_id, body.denominations);
        } catch (e: any) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
      }

      return NextResponse.json(rpcResult);
    }

    // 2026-09-23 (owner, Toast "Count this drawer later"): pause the open
    // drawer (its count waits in the list) so a NEW drawer can be opened —
    // multiple drawers per day, each finalized independently.
    if (action === 'pause') {
      const auth = await requirePermission('cash.close');
      if (!auth.authenticated) return auth;
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('*')
        .eq('id', session_id)
        .eq('status', 'open')
        .eq('location_id', opLoc2?.locationId)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
      const { error } = await s
        .from('cash_drawer_sessions')
        .update({ status: 'paused' })
        .eq('id', ses.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Finalize a PAUSED drawer (the "SAY" button) — manual path (no RPC):
    // same writes as close_cash_register_v2, variance needs a manager PIN.
    if (action === 'finalize') {
      const auth = await requirePermission('cash.close');
      if (!auth.authenticated) return auth;
      const staffId = auth.user?.id || null;
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('*')
        .eq('id', session_id)
        .in('status', ['paused', 'open'])
        .eq('location_id', opLoc2?.locationId)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });

      const counted = Number(amount) || 0;
      const expected = await computeExpected(s, ses);
      const difference = Math.round((counted - expected) * 100) / 100;
      let managerId: string | null = null;
      if (Math.abs(difference) > 0.005) {
        const mgr = await verifyManagerPin(s, body.manager_pin);
        if (!mgr) return NextResponse.json({ error: 'Invalid manager PIN' }, { status: 401 });
        const { data: mgrPerm } = await s.rpc('has_permission', { p_staff_id: mgr.id, p_permission: 'cash.close.approve' });
        if (!mgrPerm) return NextResponse.json({ error: 'Manager cannot approve cash closes' }, { status: 403 });
        managerId = mgr.id;
      }
      if (Array.isArray(body.denominations) && body.denominations.length > 0) {
        const billSum = body.denominations.reduce(
          (sum: number, r: any) => sum + (Number(r?.denomination) || 0) * Math.max(0, Math.floor(Number(r?.count) || 0)), 0);
        if (Math.abs(billSum - counted) > 0.01) {
          return NextResponse.json({ error: 'BILL_SUM_MISMATCH', bill_sum: billSum, counted }, { status: 400 });
        }
      }
      const result = await finalizeSession(s, ses, counted, staffId, managerId, description || 'Sayım tamamlandı (gözləyən drawer)');
      try { await insertDenominations(s, ses.id, Array.isArray(body.denominations) ? body.denominations : []); } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    // No Sale (Toast: every no-sale is logged with a mandatory reason and
    // shows in the exception reports).
    if (action === 'no_sale') {
      const auth = await requirePermission('cash.view');
      if (!auth.authenticated) return auth;
      const reason = String(description || '').trim();
      if (!reason) return NextResponse.json({ error: 'NO_SALE_REASON_REQUIRED' }, { status: 400 });
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('id')
        .in('status', ['open', 'paused'])
        .eq('location_id', opLoc2?.locationId)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'OPEN_SESSION_REQUIRED' }, { status: 400 });
      const { error } = await s.from('cash_drawer_log').insert({
        session_id: ses.id,
        type: 'no_sale',
        amount: Math.abs(Number(amount)) || 0,
        description: `NO SALE — ${reason}`,
        created_by: auth.user?.id || null,
      });
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Cash Drop → House/safe (money leaves the drawer; reported separately
    // from expenses in the Drawer History).
    if (action === 'cash_drop') {
      const auth = await requirePermission('cash.out');
      if (!auth.authenticated) return auth;
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('id')
        .eq('status', 'open')
        .eq('location_id', opLoc2?.locationId)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'OPEN_SESSION_REQUIRED' }, { status: 400 });
      const { error } = await s.from('cash_drawer_log').insert({
        session_id: ses.id,
        type: 'cash_drop',
        amount: Math.abs(Number(amount)) || 0,
        description: description || 'Drop → House',
        created_by: auth.user?.id || null,
      });
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // 2026-09-24 (owner, Toast "Adjust Closing Entries" / "Edit Historical
    // Data"): a CLOSED session's counted amount can be corrected by a
    // manager. Re-computes difference, stamps the approver + note, and logs
    // an 'adjust_close' row (no status change → state-guard not involved).
    if (action === 'adjust_close') {
      const auth = await requirePermission('cash.close');
      if (!auth.authenticated) return auth;
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('*')
        .eq('id', session_id)
        .eq('status', 'closed')
        .eq('location_id', opLoc2?.locationId)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'SESSION_NOT_FOUND_OR_NOT_CLOSED' }, { status: 404 });

      const mgr = await verifyManagerPin(s, body.manager_pin);
      if (!mgr) return NextResponse.json({ error: 'Invalid manager PIN' }, { status: 401 });
      const { data: mgrPerm } = await s.rpc('has_permission', { p_staff_id: mgr.id, p_permission: 'cash.close.approve' });
      if (!mgrPerm) return NextResponse.json({ error: 'Manager cannot edit historical cash data' }, { status: 403 });

      const newCounted = Number(amount);
      if (!Number.isFinite(newCounted) || newCounted < 0) {
        return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });
      }
      const expected = await computeExpected(s, ses);
      const difference = Math.round((newCounted - expected) * 100) / 100;

      const { error: upErr } = await s
        .from('cash_drawer_sessions')
        .update({
          closing_balance: newCounted,
          difference,
          approved_by: mgr.id,
          approval_note: `Manual adjustment (old: ${(Number(ses.closing_balance) || 0).toFixed(2)}₼): ${description || 'no note'}`,
        })
        .eq('id', ses.id);
      if (upErr) throw upErr;
      await s.from('cash_drawer_log').insert({
        session_id: ses.id,
        type: 'adjust_close',
        amount: newCounted,
        description: description || 'Sayım düzəldildi',
        created_by: mgr.id,
      });
      return NextResponse.json({ success: true, expected, counted: newCounted, difference });
    }

    // Drawer lock (Toast: locked drawer restricted to the staff member).
    if (action === 'lock' || action === 'unlock') {
      const auth = await requirePermission('cash.close');
      if (!auth.authenticated) return auth;
      const mgr = await verifyManagerPin(s, body.manager_pin);
      if (!mgr) return NextResponse.json({ error: 'Invalid manager PIN' }, { status: 401 });
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('id')
        .eq('status', 'open')
        .eq('location_id', opLoc2?.locationId)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
      const { error } = await s
        .from('cash_drawer_sessions')
        .update({ locked: action === 'lock', locked_by: action === 'lock' ? mgr.id : null })
        .eq('id', ses.id);
      if (error) throw error;
      return NextResponse.json({ success: true, locked: action === 'lock' });
    }

    // Deposit (Toast: create a deposit from a closed drawer; expected vs
    // actual with overage/shortage).
    if (action === 'deposit') {
      const auth = await requirePermission('cash.close');
      if (!auth.authenticated) return auth;
      const mgr = await verifyManagerPin(s, body.manager_pin);
      if (!mgr) return NextResponse.json({ error: 'Invalid manager PIN' }, { status: 401 });
      const opLoc2 = await resolveWriteLocationContext(auth.user!.id);
      const { data: ses } = await s
        .from('cash_drawer_sessions')
        .select('id')
        .eq('location_id', opLoc2?.locationId)
        .order('closed_at', { ascending: false })
        .not('closed_at', 'is', null)
        .limit(1)
        .maybeSingle();
      if (!ses) return NextResponse.json({ error: 'NO_CLOSED_SESSION' }, { status: 404 });
      const expected = Number(body.expected_amount) || 0;
      const actual = Number(amount) || 0;
      const { error } = await s.from('deposits').insert({
        session_id: ses.id,
        expected_amount: expected,
        actual_amount: actual,
        note: description || null,
        created_by: mgr.id,
      });
      if (error) throw error;
      await s.from('cash_drawer_log').insert({
        session_id: ses.id,
        type: 'deposit',
        amount: actual,
        description: `Depozit: ₼${actual.toFixed(2)} (gözlənilən ₼${expected.toFixed(2)})${description ? ` — ${description}` : ''}`,
        created_by: mgr.id,
      });
      return NextResponse.json({ success: true, difference: Math.round((actual - expected) * 100) / 100 });
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
