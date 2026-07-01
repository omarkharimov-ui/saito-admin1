import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { data, error } = await supabase
      .from('stock_count_items')
      .select('*, ingredient:ingredients(name,unit,current_stock)')
      .eq('stock_count_id', params.id)
      .order('created_at');

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { ingredient_id, actual_qty, notes } = await request.json();
    if (!ingredient_id || actual_qty === undefined) {
      return NextResponse.json({ error: 'ingredient_id and actual_qty are required' }, { status: 400 });
    }

    // Get system qty
    const { data: ingredient } = await supabase
      .from('ingredients')
      .select('id, current_stock, theoretical_stock, average_cost_per_unit')
      .eq('id', ingredient_id)
      .single();

    if (!ingredient) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
    }

    const systemQty = ingredient.current_stock || 0;
    const variance = actual_qty - systemQty;
    const varianceCost = variance * (ingredient.average_cost_per_unit || 0);

    // Upsert — if item already exists for this count+ingredient, update it
    const { data: existing } = await supabase
      .from('stock_count_items')
      .select('id')
      .eq('stock_count_id', params.id)
      .eq('ingredient_id', ingredient_id)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('stock_count_items')
        .update({
          actual_qty,
          variance,
          unit_cost: ingredient.average_cost_per_unit,
          variance_cost: varianceCost,
          notes,
        })
        .eq('id', existing.id)
        .select('*, ingredient:ingredients(name,unit)')
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('stock_count_items')
        .insert({
          stock_count_id: params.id,
          ingredient_id,
          system_qty: systemQty,
          actual_qty,
          variance,
          unit_cost: ingredient.average_cost_per_unit,
          variance_cost: varianceCost,
          notes,
        })
        .select('*, ingredient:ingredients(name,unit)')
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json(result, { status: existing ? 200 : 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
