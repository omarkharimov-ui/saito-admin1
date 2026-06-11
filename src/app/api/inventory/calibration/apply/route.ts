import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface ApplyCalibrationPayload {
  ingredientId: string;
  actualStock: number;
  theoreticalStock?: number;
  reason?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = svc();
    const body: ApplyCalibrationPayload = await req.json();
    const { ingredientId, actualStock, theoreticalStock, reason } = body;

    if (!ingredientId || typeof actualStock !== 'number') {
      return NextResponse.json({ error: 'ingredientId and actualStock are required' }, { status: 400 });
    }

    const normalizedActualStock = Math.max(0, actualStock);
    const normalizedTheoreticalStock = Math.max(0, theoreticalStock ?? normalizedActualStock);
    const variance = normalizedActualStock - normalizedTheoreticalStock;

    const { data: ingredient, error: ingredientError } = await supabase
      .from('ingredients')
      .select('id, current_stock, theoretical_stock, name')
      .eq('id', ingredientId)
      .single();

    if (ingredientError) throw ingredientError;

    const { error: updateError } = await supabase
      .from('ingredients')
      .update({
        current_stock: normalizedActualStock,
        theoretical_stock: normalizedTheoreticalStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingredientId);

    if (updateError) throw updateError;

    const { error: logError } = await supabase.from('inventory_logs').insert({
      ingredient_id: ingredientId,
      type: 'adjustment',
      quantity: Math.abs(variance),
      cost_per_unit: null,
      reason: reason?.trim() || `Calibration applied for ${ingredient?.name ?? 'ingredient'}`,
    });

    if (logError) throw logError;

    return NextResponse.json({
      success: true,
      ingredientId,
      actualStock: normalizedActualStock,
      theoreticalStock: normalizedTheoreticalStock,
      variance,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
