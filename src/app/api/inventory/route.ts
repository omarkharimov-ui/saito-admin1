import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type {
  InventoryDashboardData,
  InventoryStatusRow,
  CreateIngredientPayload,
  LowStockAlert,
} from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/inventory — full dashboard data + low stock alerts
export async function GET() {
  try {
    const supabase = svc();

    const { data: items, error } = await supabase
      .from('inventory_status')
      .select('*');

    if (error) throw error;

    const rows = (items ?? []) as InventoryStatusRow[];

    const stats = {
      total: rows.length,
      critical: rows.filter(r => r.status === 'critical').length,
      out_of_stock: rows.filter(r => r.status === 'out_of_stock').length,
      monthly_waste_cost: rows.reduce((s, r) => s + Number(r.monthly_waste_cost), 0),
    };

    const alerts: LowStockAlert[] = rows
      .filter(r => r.status !== 'normal')
      .map(r => ({
        ingredientId: r.id,
        name: r.name,
        unit: r.unit,
        current_stock: r.current_stock,
        critical_limit: r.critical_limit,
        status: r.status as 'critical' | 'out_of_stock',
      }));

    const response: InventoryDashboardData & { alerts: LowStockAlert[] } = {
      items: rows,
      stats,
      alerts,
    };

    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/inventory — create new ingredient
export async function POST(req: NextRequest) {
  try {
    const supabase = svc();
    const body: CreateIngredientPayload = await req.json();

    const { name, unit, criticalLimit, averageCostPerUnit, purchasePrice, coldWastePercentage } = body;
    if (!name?.trim() || !unit) {
      return NextResponse.json({ error: 'name and unit are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ingredients')
      .insert({
        name: name.trim(),
        unit,
        critical_limit: criticalLimit ?? 0,
        average_cost_per_unit: averageCostPerUnit ?? 0,
        purchase_price: purchasePrice ?? averageCostPerUnit ?? 0,
        cold_waste_percentage: coldWastePercentage ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/inventory?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const supabase = svc();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
