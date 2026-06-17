import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = svc();

    const { name, unit, critical_limit, cold_waste_percentage, supplier_id } = body;

    // Get current ingredient to detect supplier change
    const { data: current } = await supabase
      .from('ingredients')
      .select('supplier_id')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
    }

    // If supplier changed, log the old supplier's prices so they don't affect future calculations
    if (supplier_id && current.supplier_id !== supplier_id) {
      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('cost_per_unit, created_at')
        .eq('ingredient_id', id)
        .eq('type', 'stock_in')
        .order('created_at', { ascending: false });

      if (logs && logs.length > 0) {
        const lastCost = logs[0].cost_per_unit;
        await supabase.from('transaction_logs').insert({
          table_name: 'ingredients',
          record_id: id,
          action: 'supplier_changed',
          details: {
            old_supplier_id: current.supplier_id,
            new_supplier_id: supplier_id,
            old_last_cost: lastCost,
            note: 'Supplier changed — old pricing data preserved with previous supplier',
          },
        });
      }
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (unit !== undefined) updates.unit = unit;
    if (critical_limit !== undefined) updates.critical_limit = critical_limit;
    if (cold_waste_percentage !== undefined) updates.cold_waste_percentage = cold_waste_percentage;
    if (supplier_id !== undefined) updates.supplier_id = supplier_id === '' ? null : supplier_id;

    const { data, error } = await supabase
      .from('ingredients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
