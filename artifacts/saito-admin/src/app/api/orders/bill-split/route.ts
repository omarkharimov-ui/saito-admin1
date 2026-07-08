import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { runOrderAction } from '@/lib/transaction';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { original_order_id, items_to_split } = await request.json();

    if (!original_order_id || !items_to_split || items_to_split.length === 0) {
      return NextResponse.json({ error: 'original_order_id and items_to_split required' }, { status: 400 });
    }

    const result = await runOrderAction('BillSplit', async () => {
      const splitTotal = items_to_split.reduce((sum: number, item: any) => sum + (Number(item.unit_price) * Number(item.quantity)), 0);

      // Build items payload for RPC
      const splitItems = items_to_split.map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: Number(item.unit_price) * Number(item.quantity),
        modifiers: typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || []),
        special_notes: item.special_notes || null,
        combo_group_id: item.combo_group_id || null,
        variant_id: item.variant_id || null,
      }));

      // Use atomic RPC with FOR UPDATE
      const { data: rpcResult, error: rpcError } = await supabase.rpc('split_order_atomic', {
        p_original_order_id: original_order_id,
        p_split_items: JSON.stringify(splitItems),
        p_split_total: splitTotal,
        p_new_guest_count: 1,
        p_performed_by: auth.user?.id || null,
      });

      if (rpcError) throw rpcError;

      return rpcResult;
    });

    if (!result.success && result.error === 'CONCURRENCY_CONFLICT') {
      return NextResponse.json({ error: 'Order modified by another user' }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
