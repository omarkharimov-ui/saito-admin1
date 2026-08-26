import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, requirePermission } from '@/lib/api-auth';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) return auth;
  const s = svc();
  try {
    const { data: session, error: sessErr } = await s
      .from('cash_drawer_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single();

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
      const auth = await requirePermission('cash.open', ['cashier', 'admin', 'superadmin']);
      if (!auth.authenticated) return auth;
      const staffId = auth.user?.id || null;
      const { data, error } = await s
        .from('cash_drawer_sessions')
        .insert({
          opening_balance: amount || 0,
          status: 'open',
          notes: description || null,
          opened_by: staffId,
        })
        .select()
        .single();
      if (error) throw error;

      await s.from('cash_drawer_log').insert({
        session_id: data.id,
        type: 'open',
        amount: amount || 0,
        description: description || 'Kassa açıldı',
        created_by: staffId,
      });

      return NextResponse.json(data);
    }

    if (action === 'close') {
      const auth = await requirePermission('cash.close', ['cashier', 'admin', 'superadmin']);
      if (!auth.authenticated) return auth;
      const staffId = auth.user?.id || null;
      const managerId = body.manager_id || null;

      // Delegate to close_cash_register_v2 RPC (server-side expected balance, atomic close, audit)
      const { data: rpcResult, error: rpcErr } = await s.rpc('close_cash_register_v2', {
        p_session_id: session_id,
        p_actual_cash: Number(amount) || 0,
        p_notes: description || null,
        p_manager_id: managerId,
        p_performed_by: staffId,
      });

      if (rpcErr) throw rpcErr;
      if (!rpcResult?.success) {
        return NextResponse.json(rpcResult, { status: rpcResult?.requires_approval ? 403 : 400 });
      }

      return NextResponse.json(rpcResult);
    }

    if (action === 'cash_in' || action === 'cash_out') {
      const auth = await requirePermission(action === 'cash_in' ? 'cash.in' : 'cash.out', ['cashier', 'admin', 'superadmin']);
      if (!auth.authenticated) return auth;
      const staffId = auth.user?.id || null;

      const rpcName = action === 'cash_in' ? 'cash_in_atomic' : 'cash_out_atomic';
      const { data: rpcResult, error: rpcErr } = await s.rpc(rpcName, {
        p_session_id: session_id,
        p_amount: Math.abs(Number(amount)),
        p_description: description || (action === 'cash_in' ? 'Kassa daxilolma' : 'Kassa xərc'),
        p_performed_by: staffId,
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
