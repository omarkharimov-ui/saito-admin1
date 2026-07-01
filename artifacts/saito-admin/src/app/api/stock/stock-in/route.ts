import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { ingredient_id, quantity, unit_cost, reason } = await request.json();
    if (!ingredient_id || quantity === undefined || quantity <= 0) {
      return NextResponse.json({ error: 'ingredient_id and positive quantity are required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('process_stock_in', {
      p_ingredient_id: ingredient_id,
      p_quantity: quantity,
      p_unit_cost: unit_cost || null,
      p_reason: reason || 'manual_adjustment',
      p_reference_type: 'manual',
      p_reference_id: null,
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[stock/stock-in] RPC failed:', error);
      if (error.message === 'INGREDIENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
