import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_numbers } = await request.json();
    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'Ən azı 2 masa seçilməlidir' }, { status: 400 });
    }

    const targetTable = table_numbers[0];
    const restTables = table_numbers.slice(1);

    // Try new atomic v3 RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('merge_tables_v3', {
      p_table_numbers: table_numbers,
      p_performed_by: auth.user?.id || null
    });

    if (!rpcError) return NextResponse.json({ success: true, data: rpcData });

    // FALLBACK: If RPC doesn't exist, handle it via REST (Manual Transaction-like)
    console.warn('[Merge] v3 RPC failed or missing, falling back to manual merge...');
    
    // 1. Get/Create Primary Order
    let { data: primaryOrder } = await supabase.from('orders')
      .select('id, total_amount, guest_count')
      .eq('table_number', targetTable)
      .not('status', 'in', '("paid","cancelled","closed")')
      .maybeSingle();

    if (!primaryOrder) {
      const { data: newOrder, error: createError } = await supabase.from('orders')
        .insert({ table_number: targetTable, total_amount: 0, guest_count: 1, status: 'confirmed' })
        .select().single();
      if (createError) throw createError;
      primaryOrder = newOrder;
    }

    // 2. Fetch Source Orders
    const { data: sourceOrders } = await supabase.from('orders')
      .select('id, total_amount, guest_count')
      .in('table_number', restTables)
      .not('status', 'in', '("paid","cancelled","closed")');

    let totalAmount = Number(primaryOrder.total_amount || 0);
    let totalGuests = Number(primaryOrder.guest_count || 1);

    if (sourceOrders && sourceOrders.length > 0) {
      for (const src of sourceOrders) {
        totalAmount += Number(src.total_amount || 0);
        totalGuests += Number(src.guest_count || 0);
        await supabase.from('orders').update({ merged_into: primaryOrder.id }).eq('id', src.id);
      }
    }

    // 3. Update Primary and Floors
    await supabase.from('orders').update({ total_amount: totalAmount, guest_count: totalGuests }).eq('id', primaryOrder.id);
    await supabase.from('table_floors').update({ status: 'merged', merged_into_table: targetTable, guest_count: null, total_amount: 0 }).in('table_number', restTables);
    await supabase.from('table_floors').update({ status: 'occupied', guest_count: totalGuests, total_amount: totalAmount }).eq('table_number', targetTable);

    return NextResponse.json({ success: true, data: { primary_order_id: primaryOrder.id } });
  } catch (error: any) {
    console.error('[Merge Fatal]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


