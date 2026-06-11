import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type {
  InventoryDashboardData,
  InventoryStatusRow,
  CreateIngredientPayload,
  LowStockAlert,
} from '@/types/inventory';
import { normalizeMeasurement } from '@/lib/measurement';

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

    const enrichedRows = rows.map((row) => {
      const normalized = normalizeMeasurement(Number(row.current_stock ?? 0), row.unit);
      const theoreticalNormalized = normalizeMeasurement(Number(row.theoretical_stock ?? 0), row.unit);
      const discrepancyQty = Number((theoreticalNormalized.quantity - normalized.quantity).toFixed(2));
      const discrepancyValue = Number((Math.abs(discrepancyQty) * Number(row.average_cost_per_unit ?? 0)).toFixed(2));
      const inventoryValue = Number((normalized.quantity * Number(row.average_cost_per_unit ?? 0)).toFixed(2));
      const healthScore = Math.max(0, Math.min(100,
        100 - (row.status === 'out_of_stock' ? 45 : row.status === 'critical' ? 20 : 0) -
        Math.min(25, Math.abs(discrepancyQty) * 2) -
        Math.min(20, Number(row.cold_waste_percentage ?? 0))
      ));

      return {
        ...row,
        inventory_value: inventoryValue,
        moving_average_cost: Number(row.average_cost_per_unit ?? 0),
        health_score: Number(healthScore.toFixed(0)),
        discrepancy_qty: discrepancyQty,
        discrepancy_value: discrepancyValue,
        normalized_unit: normalized.normalizedUnit,
      } satisfies InventoryStatusRow;
    });

    const stats = {
      total: enrichedRows.length,
      critical: enrichedRows.filter(r => r.status === 'critical').length,
      out_of_stock: enrichedRows.filter(r => r.status === 'out_of_stock').length,
      monthly_waste_cost: enrichedRows.reduce((s, r) => s + Number(r.monthly_waste_cost), 0),
      inventory_value: Number(enrichedRows.reduce((s, r) => s + Number(r.inventory_value ?? 0), 0).toFixed(2)),
      health_score: Number((enrichedRows.reduce((s, r) => s + Number(r.health_score ?? 0), 0) / Math.max(enrichedRows.length, 1)).toFixed(0)),
      discrepancy_count: enrichedRows.filter(r => Math.abs(Number(r.discrepancy_qty ?? 0)) > 0.01).length,
      moving_average_cost: Number((enrichedRows.reduce((s, r) => s + Number(r.moving_average_cost ?? 0), 0) / Math.max(enrichedRows.length, 1)).toFixed(2)),
    };

    const alerts: LowStockAlert[] = enrichedRows
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
      items: enrichedRows,
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
