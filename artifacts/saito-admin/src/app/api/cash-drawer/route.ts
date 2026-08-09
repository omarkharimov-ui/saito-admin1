import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
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
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const s = svc();
  const body = await req.json();
  const { action, amount, description, session_id } = body;
  const staffId = auth.user?.id || null;

  try {
    if (action === 'open') {
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
      const { data: sess } = await s
        .from('cash_drawer_sessions')
        .select('*')
        .eq('id', session_id)
        .single();
      if (!sess) throw new Error('Session not found');

      const { data: logData } = await s
        .from('cash_drawer_log')
        .select('*')
        .eq('session_id', session_id);

      const expectedBalance = (logData || []).reduce((sum: number, entry: any) => {
        if (entry.type === 'cash_in' || entry.type === 'payment') return sum + Number(entry.amount);
        if (entry.type === 'cash_out') return sum - Number(entry.amount);
        return sum;
      }, Number(sess.opening_balance));

      const diff = (amount || 0) - expectedBalance;

      const { error } = await s
        .from('cash_drawer_sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closing_balance: amount || 0,
          expected_balance: expectedBalance,
          difference: diff,
          closed_by: staffId,
        })
        .eq('id', session_id);
      if (error) throw error;

      await s.from('cash_drawer_log').insert({
        session_id,
        type: 'close',
        amount: amount || 0,
        description: description || `Kassa bağlandı. Fərq: ${diff.toFixed(2)}₼`,
        created_by: staffId,
      });

      return NextResponse.json({ expectedBalance, difference: diff });
    }

    if (action === 'cash_in' || action === 'cash_out') {
      const { error } = await s.from('cash_drawer_log').insert({
        session_id,
        type: action,
        amount: Math.abs(Number(amount)),
        description: description || (action === 'cash_in' ? 'Kassa daxilolma' : 'Kassa xərc'),
        created_by: staffId,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
