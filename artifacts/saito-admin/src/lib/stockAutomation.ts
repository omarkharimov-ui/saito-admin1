/**
 * STOCK AUTOMATION v3 — Avtomatik Satış Deduction (SERVER-ONLY)
 * Yeni sistem: recipes cədvəli + inventory_transactions (idempotent per order_item)
 */

import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { normalizeQuantity } from './units';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Sifariş ödəniləndə (status = 'paid'):
 *  1. Hər order_item-in product_id-sinə görə product tipini yoxla
 *     a) Hazır məhsul (is_ready_product=true) → birbaşa direct_ingredient_id ilə stock yaz
 *     b) Reseptli məhsul → recipes cədvəlindən ingredient-ləri oxu
 *  2. inventory_transactions-a order_consumption yaz (UNIQUE order_item_id => idempotent)
 *  3. Trigger avtomatik ingredients.current_stock yeniləyəcək
 */
export async function deductStockForOrder(orderId: string): Promise<{ deducted: number; ingredientIds: string[] }> {
  const supabase = getServiceClient();

  // 0. Idempotency check — bu sifariş artıq işlənibsə, təkrar çıxma
  // NOTE: We check by order_id because we want to skip the entire order if already processed.
  // Finer granularity (per order_item_id) is handled by the UNIQUE constraint on inventory_transactions.
  const { count: existingCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('reference_type', 'order')
    .eq('reference_id', orderId);
  if (existingCount && existingCount > 0) {
    return { deducted: 0, ingredientIds: [] };
  }

  // 1. Sifarişin item-lərini çək (product tipi ilə birlikdə)
  const { data: items, error } = await supabase
    .from('order_items')
    .select('id, quantity, product_id, products(is_ready_product, direct_ingredient_id)')
    .eq('order_id', orderId);

  if (error || !items || items.length === 0) {
    return { deducted: 0, ingredientIds: [] };
  }

  const logs: { ingredient_id: string; type: 'order_consumption'; quantity: number; reason: string; order_id: string; order_item_id: string; item_quantity: number; reference_type: string; reference_id: string }[] = [];

  // Hazır məhsulların id-lərini topla (resept yox, birbaşa ingredient)
  const readyProductIds: string[] = [];
  const recipeProductIds: string[] = [];

  for (const item of items) {
    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    if (prod?.is_ready_product && prod?.direct_ingredient_id) {
      readyProductIds.push(item.product_id!);
    } else {
      recipeProductIds.push(item.product_id!);
    }
  }

  // 2a. HAZIR MƏHSULLAR: birbaşa direct_ingredient_id ilə stock azalt
  for (const item of items) {
    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    if (prod?.is_ready_product && prod?.direct_ingredient_id) {
      const qty = Number(item.quantity) || 1;
      logs.push({
        ingredient_id: prod.direct_ingredient_id,
        type: 'order_consumption',
        quantity: qty,
        order_id: orderId,
        order_item_id: item.id!,
        item_quantity: qty,
        reference_type: 'order',
        reference_id: orderId,
        reason: `Hazır məhsul satışı — Sifariş #${orderId}`,
      });
    }
  }

  // 2b. RESEPTLİ MƏHSULLAR: recipes cədvəlindən oxu
  if (recipeProductIds.length > 0) {
    const { data: recipes } = await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id, quantity_required, quantity_brutto')
      .in('menu_item_id', recipeProductIds);

    if (recipes && recipes.length > 0) {
      // Fetch ingredient units and name for alerting
      const ingredientIds = [...new Set(recipes.map(r => r.ingredient_id))];
      const [ingredientsRes, standardsRes] = await Promise.all([
        supabase.from('ingredients').select('id, unit, name').in('id', ingredientIds),
        supabase.from('waste_standards').select('*'),
      ]);

      const ingredientsData = ingredientsRes.data || [];
      const standards = standardsRes.data || [];
      const unitMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      
      for (const ing of ingredientsData) {
        unitMap[ing.id] = ing.unit;
        nameMap[ing.id] = ing.name;
      }

      for (const item of items) {
        const prod = Array.isArray(item.products) ? item.products[0] : item.products;
        if (prod?.is_ready_product) continue; 

        const itemRecipes = recipes.filter(r => r.menu_item_id === item.product_id);
        for (const rec of itemRecipes) {
          const rawQty = (rec.quantity_brutto ?? rec.quantity_required);
          const ingUnit = unitMap[rec.ingredient_id] || 'gram';
          const qtyUnit = ingUnit === 'gram' ? 'g' : ingUnit === 'ml' ? 'ml' : 'piece';
          const normalizedQty = normalizeQuantity(rawQty, qtyUnit);
          const deductQty = normalizedQty.value * (Number(item.quantity) || 1);
          
          logs.push({
            ingredient_id: rec.ingredient_id,
            type: 'order_consumption',
            quantity: deductQty,
            order_id: orderId,
            order_item_id: item.id!,
            item_quantity: Number(item.quantity) || 1,
            reference_type: 'order',
            reference_id: orderId,
            reason: `Reseptli satış — Sifariş #${orderId}`,
          });

          // Task: Waste Standards vs Alerts Workflow
          const standard = standards.find(s => 
            nameMap[rec.ingredient_id]?.toLowerCase().includes(s.keyword.toLowerCase())
          );

          if (standard && rec.quantity_brutto && rec.quantity_required) {
            const actualWastePct = ((rec.quantity_brutto - rec.quantity_required) / rec.quantity_brutto) * 100;
            if (actualWastePct > standard.waste_percentage) {
              // Create an automated alert
              await supabase.from('discrepancy_alerts').insert({
                type: 'waste_vs_norm',
                severity: 'medium',
                title: `Normadan artıq itki: ${nameMap[rec.ingredient_id]}`,
                description: `Resept üzrə itki ${actualWastePct.toFixed(1)}%, standart isə ${standard.waste_percentage}% təşkil edir.`,
                source_id: orderId,
                source_table: 'orders',
                value: actualWastePct,
                expected_value: standard.waste_percentage,
                variance_pct: actualWastePct - standard.waste_percentage,
                status: 'open'
              });
            }
          }
        }
      }
    }
  }

  if (logs.length === 0) {
    return { deducted: 0, ingredientIds: [] };
  }

  // 3. inventory_transactions-a insert et (UNIQUE(order_item_id) => idempotent)
  // If any item was already processed, skip only that item, not the whole batch.
  const validLogs: typeof logs = [];
  for (const log of logs) {
    try {
      const { error: txError } = await supabase.from('inventory_transactions').insert(log);
      if (txError && txError.code === '23505') {
        // Unique constraint violation — this order_item was already deducted, skip
        continue;
      }
      if (txError) {
        console.error('[deductStockForOrder] Inventory transaction insert error:', txError);
        continue;
      }
      validLogs.push(log);
    } catch (e) {
      console.error('[deductStockForOrder] Exception:', e);
    }
  }

  if (validLogs.length === 0) {
    return { deducted: 0, ingredientIds: [] };
  }

  // 4. Also write to inventory_logs for backward compatibility with existing reports/views
  // This can be removed once all reports migrate to inventory_transactions
  const { error: insertError } = await supabase.from('inventory_logs').insert(validLogs);
  if (insertError) {
    console.error('[deductStockForOrder] inventory_logs insert error:', insertError);
  }

  const ingredientIds = [...new Set(validLogs.map(l => l.ingredient_id))];
  return { deducted: validLogs.length, ingredientIds };
}

/**
 * Manual deduction — birbaşa inventory_transactions-a order_consumption yaz
 */
export async function deductStockManual(
  rows: { ingredient_id: string; quantity: number; reason?: string }[],
  orderId?: string
): Promise<{ deducted: number; ingredientIds: string[] }> {
  const supabase = getServiceClient();

  const logs = rows.map((row, idx) => ({
    ingredient_id: row.ingredient_id,
    type: 'manual_adjustment',
    quantity: row.quantity,
    order_id: orderId || null,
    order_item_id: null,
    item_quantity: row.quantity,
    reference_type: orderId ? 'order' : 'manual',
    reference_id: orderId || null,
    reason: row.reason || 'Manual adjustment',
  }));

  const { error } = await supabase.from('inventory_transactions').insert(logs);
  if (error) {
    console.error('[deductStockManual] Error:', error);
    return { deducted: 0, ingredientIds: [] };
  }

  const ingredientIds = [...new Set(logs.map(l => l.ingredient_id))];
  return { deducted: logs.length, ingredientIds };
}

/**
 * Rollback stock for a specific order_item (e.g., void/refund)
 */
export async function rollbackStockForOrderItem(orderItemId: string): Promise<boolean> {
  const supabase = getServiceClient();

  // Find the original inventory_transaction for this order_item
  const { data: tx, error: txError } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('order_item_id', orderItemId)
    .eq('transaction_type', 'order_consumption')
    .maybeSingle();

  if (txError || !tx) {
    return false;
  }

  // Create a reversal transaction
  const { error: reverseError } = await supabase.from('inventory_transactions').insert({
    order_item_id: orderItemId,
    ingredient_id: tx.ingredient_id,
    quantity: -Math.abs(tx.quantity),
    unit: tx.unit,
    transaction_type: 'reversal',
    reference_type: tx.reference_type,
    reference_id: tx.reference_id,
    performed_by: null,
  });

  if (reverseError) {
    console.error('[rollbackStockForOrderItem] Error:', reverseError);
    return false;
  }

  return true;
}
