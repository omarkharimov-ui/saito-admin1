import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { ingredient_id, quantity, unit_cost, reason } = await request.json();
    if (!ingredient_id || quantity === undefined || quantity <= 0) {
      return NextResponse.json({ error: 'ingredient_id and positive quantity are required' }, { status: 400 });
    }

    const supabase = svc();

    const { data: ingredient, error: fetchError } = await supabase
      .from('ingredients')
      .select('id, current_stock, name')
      .eq('id', ingredient_id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
    }

    const vOldStock = Number(ingredient.current_stock) || 0;

    const { error: logError } = await supabase.from('inventory_logs').insert({
      ingredient_id,
      type: 'waste',
      quantity,
      cost_per_unit: unit_cost ?? null,
      reason: reason || 'waste',
      reference_type: 'manual',
      notes: `Waste: -${quantity} from ${ingredient.name}`,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }

    const { data: updatedIngredient } = await supabase
      .from('ingredients')
      .select('current_stock')
      .eq('id', ingredient_id)
      .single();

    return NextResponse.json({
      success: true,
      ingredient_id,
      previous_stock: vOldStock,
      new_stock: updatedIngredient?.current_stock ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
