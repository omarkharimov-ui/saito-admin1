import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { AddStockInPayload, ReportWastePayload } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/inventory/logs?ingredientId=xxx&limit=50
export async function GET(req: NextRequest) {
  try {
    const supabase = svc();
    const ingredientId = req.nextUrl.searchParams.get('ingredientId');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50');

    let query = supabase
      .from('inventory_logs')
      .select('*, ingredient:ingredients(name, unit)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (ingredientId) query = query.eq('ingredient_id', ingredientId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/inventory/logs — stock_in or waste
export async function POST(req: NextRequest) {
  try {
    const supabase = svc();
    const body: (AddStockInPayload | ReportWastePayload) & { type: 'stock_in' | 'waste' | 'adjustment' | 'order_consumption' } =
      await req.json();

    const { type, ingredientId, quantity, reason } = body;
    const costPerUnit = (body as AddStockInPayload).costPerUnit ?? null;

    if (!ingredientId || !quantity || !type) {
      return NextResponse.json(
        { error: 'ingredientId, quantity and type are required' },
        { status: 400 }
      );
    }
    if (quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be positive' }, { status: 400 });
    }
    if (type === 'waste' && !reason?.trim()) {
      return NextResponse.json({ error: 'reason is required for waste' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('inventory_logs')
      .insert({
        ingredient_id: ingredientId,
        type,
        quantity,
        cost_per_unit: type === 'stock_in' || type === 'adjustment' ? costPerUnit : null,
        reason: reason?.trim() ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    // current_stock-u da yenilə (DB trigger olmayana qədər safety net)
    const delta = type === 'stock_in' || type === 'adjustment' ? quantity : -quantity;
    const { data: ing } = await supabase.from('ingredients').select('current_stock').eq('id', ingredientId).single();
    if (ing) {
      await supabase.from('ingredients').update({
        current_stock: Math.max(0, (ing.current_stock ?? 0) + delta),
        updated_at: new Date().toISOString(),
      }).eq('id', ingredientId);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
