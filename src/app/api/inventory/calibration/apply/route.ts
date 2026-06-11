import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeInventoryUnit } from '@/lib/inventoryEngine';
import type { InventoryReviewPayload } from '@/lib/aiIngestion';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type ApplyCalibrationPayload = {
  ingredientId: string;
  actualStock: number;
  theoreticalStock?: number;
  reason?: string;
  review?: InventoryReviewPayload['review'];
};

export async function POST(req: NextRequest) {
  try {
    const supabase = svc();
    const body = (await req.json()) as ApplyCalibrationPayload;
    const { ingredientId, actualStock, theoreticalStock, reason, review } = body;

    if (!ingredientId || typeof actualStock !== 'number') {
      return NextResponse.json({ error: 'ingredientId and actualStock are required' }, { status: 400 });
    }

    const normalizedUnit = normalizeInventoryUnit('piece');
    const normalizedActualStock = Math.max(0, actualStock);
    const normalizedTheoreticalStock = Math.max(0, theoreticalStock ?? normalizedActualStock);
    const variance = normalizedActualStock - normalizedTheoreticalStock;
    const reviewNotes = review?.reviewNotes ?? [];
    const warnings = review?.warnings ?? [];
    const auditStatus = review?.manualReviewRequired ? 'needs_review' : 'ready_to_apply';
    void normalizedUnit;

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
      note: JSON.stringify({
        source: review?.fallbackMode ?? 'manual',
        auditStatus,
        reviewNotes,
        warnings,
        theoreticalStock: normalizedTheoreticalStock,
        actualStock: normalizedActualStock,
      }),
    });

    if (logError) throw logError;

    return NextResponse.json({
      success: true,
      ingredientId,
      actualStock: normalizedActualStock,
      theoreticalStock: normalizedTheoreticalStock,
      variance,
      audit: {
        source: review?.fallbackMode ?? 'manual',
        status: auditStatus,
        reviewNotes,
        warningCount: warnings.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
