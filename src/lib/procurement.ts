import { createClient } from '@supabase/supabase-js';
import { normalizeToStorage } from '@/types/inventory';
import type { InventoryImportPayload, InventoryImportLine } from '@/types/recipes';

const UNIT_MAP: Record<string, string> = {
  g: 'gram', gram: 'gram', grams: 'gram',
  kg: 'kg', kq: 'kg', kilo: 'kg', kilogram: 'kg',
  ml: 'ml', milliliter: 'ml',
  l: 'liter', lt: 'liter', liter: 'liter', litr: 'liter',
  piece: 'piece', pcs: 'piece', ədəd: 'piece', adet: 'piece',
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function svc() {
  return createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function similarityScore(a: string, b: string) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  let overlap = 0;
  leftTokens.forEach(token => { if (rightTokens.has(token)) overlap += 1; });
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function buildDiscrepancy(reason: string, severity: 'low' | 'medium' | 'high' | 'critical', details: Record<string, any>) {
  return { reason, severity, details };
}

function unitToStorage(unit?: string | null) {
  if (!unit) return 'gram';
  return UNIT_MAP[unit.trim().toLowerCase()] || unit.trim().toLowerCase();
}

async function resolveSupplierId(supplierName?: string | null) {
  const name = supplierName?.trim();
  if (!name) return null;

  const supabase = svc();
  const { data: existing } = await supabase
    .from('suppliers')
    .select('id')
    .ilike('name', name)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from('suppliers')
    .insert({ name })
    .select('id')
    .single();

  if (error || !created?.id) return null;
  return created.id as string;
}

async function resolveIngredient(line: InventoryImportLine) {
  const supabase = svc();
  const name = normalizeName(line.name);
  const rawUnit = unitToStorage(line.unit);
  const { value: normQty, unit: storageUnit } = normalizeToStorage(Number(line.quantity) || 0, rawUnit as any);

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, current_stock, average_cost_per_unit')
    .limit(1000);

  let bestMatch: { ingredientId: string; matchedName: string; confidence: number } | null = null;
  for (const ingredient of ingredients ?? []) {
    const score = Math.max(similarityScore(line.name, ingredient.name), similarityScore(name, ingredient.name));
    if (!bestMatch || score > bestMatch.confidence) {
      bestMatch = { ingredientId: ingredient.id as string, matchedName: ingredient.name as string, confidence: score };
    }
  }

  if (bestMatch && bestMatch.confidence >= 0.75) {
    return { ingredientId: bestMatch.ingredientId, storageUnit, normQty, matchedName: bestMatch.matchedName, confidence: bestMatch.confidence };
  }

  const { data: created, error } = await supabase
    .from('ingredients')
    .insert({
      name: line.name.trim(),
      unit: storageUnit,
      current_stock: 0,
      theoretical_stock: 0,
      critical_limit: Math.max(normQty * 0.1, 1),
      average_cost_per_unit: line.unit_cost ?? 0,
      purchase_price: line.unit_cost ?? 0,
      cold_waste_percentage: line.waste_percentage ?? 0,
    })
    .select('id, name')
    .single();

  if (error || !created?.id) {
    return { ingredientId: null, storageUnit, normQty, matchedName: null, error: error?.message || 'ingredient_create_failed', confidence: 0 };
  }

  return { ingredientId: created.id as string, storageUnit, normQty, matchedName: created.name as string, confidence: 0.6 };
}

export async function importProcurementPayload(payload: InventoryImportPayload) {
  if (!payload || !Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error('Import payload must include at least one line item');
  }

  const supabase = svc();
  const supplierId = await resolveSupplierId(payload.supplierName || null);
  const reviewMode = payload.reviewMode !== false;

  const { data: invoice, error: invoiceError } = await supabase
    .from('supplier_invoices')
    .insert({
      supplier_id: supplierId,
      invoice_number: payload.invoiceNumber || null,
      invoice_date: payload.invoiceDate || null,
      currency: payload.currency || 'AZN',
      total_amount: payload.totalAmount ?? 0,
      source_type: 'ocr',
      source_ref: payload.invoiceNumber || null,
      parsed_payload: payload as any,
      notes: payload.notes || null,
      status: reviewMode ? 'reviewing' : 'draft',
    })
    .select('id, status')
    .single();

  if (invoiceError || !invoice?.id) {
    throw new Error(invoiceError?.message || 'Failed to create supplier invoice');
  }

  const results: { name: string; status: 'created' | 'updated' | 'mapped' | 'draft' | 'skipped'; ingredientId?: string | null; error?: string; reviewRequired?: boolean; confidence?: number }[] = [];
  const discrepancies: Array<{ reason: string; severity: 'low' | 'medium' | 'high' | 'critical'; details: Record<string, any> }> = [];

  for (let index = 0; index < payload.lines.length; index += 1) {
    const line = payload.lines[index];
    const lineTotal = typeof line.total_cost === 'number'
      ? line.total_cost
      : ((Number(line.quantity) || 0) * (Number(line.unit_cost) || 0));

    const resolved = await resolveIngredient(line);
    const matchedName = resolved.matchedName || line.name.trim();
    const needsReview = !resolved.ingredientId || (resolved.confidence ?? 0) < 0.75 || (line.unit_cost ?? 0) <= 0 || (payload.lines.length > 0 && (resolved.normQty ?? 0) <= 0);

    const { error: lineError } = await supabase.from('supplier_invoice_lines').insert({
      supplier_invoice_id: invoice.id,
      line_index: index,
      raw_description: line.name.trim(),
      normalized_description: matchedName,
      ingredient_id: resolved.ingredientId,
      quantity: resolved.normQty,
      unit: resolved.storageUnit,
      unit_price: line.unit_cost ?? 0,
      line_total: lineTotal,
      match_confidence: resolved.ingredientId ? (needsReview ? 0.72 : 0.92) : 0.22,
      review_required: needsReview,
      metadata: {
        waste_percentage: line.waste_percentage ?? null,
        source: 'ocr',
        review_mode: reviewMode,
      },
    } as any);

    if (needsReview) {
      discrepancies.push(buildDiscrepancy(
        !resolved.ingredientId ? 'unmatched_line' : (resolved.confidence ?? 0) < 0.75 ? 'low_confidence_match' : (line.unit_cost ?? 0) <= 0 ? 'invalid_price' : 'invalid_quantity',
        !resolved.ingredientId ? 'high' : (resolved.confidence ?? 0) < 0.75 ? 'high' : 'medium',
        {
          lineName: line.name.trim(),
          confidence: resolved.confidence ?? 0,
          unit: line.unit,
          quantity: line.quantity,
          unitCost: line.unit_cost ?? null,
        }
      ));
    }

    if (!reviewMode && resolved.ingredientId && !needsReview) {
      const { error: receiptErr } = await supabase.from('goods_receipts').insert({
        supplier_invoice_id: invoice.id,
        supplier_id: supplierId,
        receipt_type: 'auto',
        status: 'applied',
        received_at: new Date().toISOString(),
      } as any);

      const { error: logErr } = await supabase.from('inventory_logs').insert({
        ingredient_id: resolved.ingredientId,
        type: 'stock_in',
        quantity: resolved.normQty,
        cost_per_unit: line.unit_cost ?? null,
        reason: `Procurement import${payload.invoiceNumber ? `: Faktura #${payload.invoiceNumber}` : ''}`,
      });

      results.push({
        name: line.name.trim(),
        status: lineError || receiptErr || logErr ? 'skipped' : 'mapped',
        ingredientId: resolved.ingredientId,
        error: lineError?.message || receiptErr?.message || logErr?.message,
        reviewRequired: false,
        confidence: resolved.confidence,
      });
    } else {
      results.push({
        name: line.name.trim(),
        status: needsReview ? 'draft' : 'skipped',
        ingredientId: resolved.ingredientId,
        error: lineError?.message || resolved.error,
        reviewRequired: needsReview,
        confidence: resolved.confidence,
      });
    }
  }

  if (!reviewMode) {
    await supabase
      .from('supplier_invoices')
      .update({ status: 'applied', applied_at: new Date().toISOString() })
      .eq('id', invoice.id);
  }

  return {
    ok: true,
    source: 'procurement',
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    reviewMode,
    imported: results.filter(r => r.status === 'mapped' || r.status === 'created' || r.status === 'updated').length,
    drafted: results.filter(r => r.status === 'draft').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    reviewRequired: results.filter(r => r.reviewRequired).length,
    discrepancies,
    results,
  };
}
