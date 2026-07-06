import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { from_table, to_table } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    // 1. Try atomic v3 RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('transfer_tables_v3', {
      p_from_table: from_table,
      p_to_table: to_table,
      p_performed_by: auth.user?.id || null,
    });

    if (!rpcError) return NextResponse.json({ success: true, data: { ...rpcData, undo: { fromTable: from_table, toTable: to_table } } });

    // FALLBACK
    console.warn('[Transfer] RPC failed, using manual fallback...');
    const { data: targetTable } = await supabase.from('table_floors').select('status').eq('table_number', to_table).single();
    if (targetTable?.status !== 'empty') return NextResponse.json({ error: 'Hədəf masa boş deyil' }, { status: 409 });

    const { data: orders } = await supabase.from('orders').select('*').eq('table_number', from_table).not('status', 'in', '("paid","cancelled","closed")');
    if (!orders || orders.length === 0) return NextResponse.json({ error: 'Mənbə masada aktiv sifariş yoxdur' }, { status: 404 });

    const totalAmount = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const totalGuests = orders.reduce((s, o) => s + Number(o.guest_count || 0), 0);

    await supabase.from('orders').update({ table_number: to_table }).in('id', orders.map(o => o.id));
    await supabase.from('table_floors').update({ status: 'empty', guest_count: null, total_amount: 0, merged_into_table: NULL }).eq('table_number', from_table);
    await supabase.from('table_floors').update({ status: 'occupied', guest_count: totalGuests, total_amount: totalAmount }).eq('table_number', to_table);

    return NextResponse.json({ success: true, data: { undo: { fromTable: from_table, toTable: to_table } } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

