import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAuthClient();
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('dismiss_table_v3', {
      p_table_number: table_number,
    });

    if (!rpcError) return NextResponse.json({ success: true, result: rpcData });

    // FALLBACK
    console.warn('[Dismiss] RPC failed, using manual fallback...');
    await supabase.from('orders').update({ status: 'cancelled' }).eq('table_number', table_number).not('status', 'in', '("paid","cancelled","closed")');
    await supabase.from('table_floors').update({ status: 'empty', guest_count: null, total_amount: 0, merged_into_table: null, reservation_id: null }).or(`table_number.eq.${table_number},merged_into_table.eq.${table_number}`);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
