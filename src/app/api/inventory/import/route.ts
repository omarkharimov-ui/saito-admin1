import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { InventoryImportPayload } from '@/types/recipes';
import { normalizeToStorage } from '@/types/inventory';

const UNIT_MAP: Record<string, string> = {
  g: 'gram', gram: 'gram', grams: 'gram',
  kg: 'kg', kq: 'kg', kilo: 'kg', kilogram: 'kg',
  ml: 'ml', milliliter: 'ml',
  l: 'liter', lt: 'liter', liter: 'liter', litr: 'liter',
  piece: 'piece', pcs: 'piece', ədəd: 'piece', adet: 'piece',
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as InventoryImportPayload;

    if (!payload || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      return NextResponse.json(
        { error: 'Import payload must include at least one line item' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: { name: string; status: 'created' | 'updated' | 'skipped'; ingredientId?: string; error?: string }[] = [];

    for (const line of payload.lines) {
      const name = line.name.trim();
      const rawUnit = (UNIT_MAP[line.unit?.trim().toLowerCase()] || 'gram');
      const { value: normQty, unit: storageUnit } = normalizeToStorage(Number(line.quantity) || 0, rawUnit as any);
      const unitCost = typeof line.unit_cost === 'number' ? line.unit_cost : null;
      const wastePct = typeof line.waste_percentage === 'number' ? line.waste_percentage : null;

      // Mövcud ingredient-i adla axtar
      const { data: existing } = await supabase
        .from('ingredients')
        .select('id, current_stock, average_cost_per_unit')
        .eq('name', name)
        .maybeSingle();

      if (existing) {
        const { error: logErr } = await supabase.from('inventory_logs').insert({
          ingredient_id: existing.id,
          type: 'stock_in',
          quantity: normQty,
          cost_per_unit: unitCost ?? existing.average_cost_per_unit,
          reason: `OCR import: ${payload.invoiceNumber ? `Faktura #${payload.invoiceNumber}` : 'Invoice import'}`,
        });
        results.push({
          name,
          status: logErr ? 'skipped' : 'updated',
          ingredientId: existing.id,
          error: logErr?.message,
        });
      } else {
        const { data: newIng, error: createErr } = await supabase
          .from('ingredients')
          .insert({
            name,
            unit: storageUnit,
            current_stock: 0,
            theoretical_stock: 0,
            critical_limit: Math.max(normQty * 0.1, 1),
            average_cost_per_unit: unitCost ?? 0,
            purchase_price: unitCost ?? 0,
            cold_waste_percentage: wastePct ?? 0,
          })
          .select('id')
          .single();

        if (createErr || !newIng) {
          results.push({ name, status: 'skipped', error: createErr?.message });
          continue;
        }

        const { error: logErr } = await supabase.from('inventory_logs').insert({
          ingredient_id: newIng.id,
          type: 'stock_in',
          quantity: normQty,
          cost_per_unit: unitCost,
          reason: `OCR import: ${payload.invoiceNumber ? `Faktura #${payload.invoiceNumber}` : 'Yeni ingredient'}`,
        });
        results.push({
          name,
          status: logErr ? 'skipped' : 'created',
          ingredientId: newIng.id,
          error: logErr?.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      source: 'ocr',
      imported: results.filter(r => r.status === 'created' || r.status === 'updated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to import inventory payload' },
      { status: 500 }
    );
  }
}
