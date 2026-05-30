/**
 * STOCK AUTOMATION v2 — Avtomatik Satış Deduction
 * Yeni sistem: recipes cədvəli + inventory_logs (order_consumption)
 *
 * handlePay çağırıldığında avtomatik işləyir.
 */

import { createClient } from '@supabase/supabase-js';

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
 *  2. inventory_logs-a order_consumption yaz
 *  3. Trigger avtomatik ingredients.current_stock yeniləyəcək
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const supabase = getServiceClient();

  // 1. Sifarişin item-lərini çək (product tipi ilə birlikdə)
  const { data: items, error } = await supabase
    .from('order_items')
    .select('quantity, product_id, products(is_ready_product, direct_ingredient_id)')
    .eq('order_id', orderId);

  if (error || !items || items.length === 0) {
    console.error('[stockAutomation] Failed to fetch order items:', error);
    return;
  }

  console.log('[stockAutomation] Order items:', JSON.stringify(items, null, 2));

  const logs: { ingredient_id: string; type: 'order_consumption'; quantity: number; reason: string }[] = [];

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

  console.log('[stockAutomation] Ready IDs:', readyProductIds, 'Recipe IDs:', recipeProductIds);

  // 2a. HAZIR MƏHSULLAR: birbaşa direct_ingredient_id ilə stock azalt
  for (const item of items) {
    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    if (prod?.is_ready_product && prod?.direct_ingredient_id) {
      const qty = Number(item.quantity) || 1;
      console.log(`[stockAutomation] Ready deduct: product=${item.product_id}, ingredient=${prod.direct_ingredient_id}, qty=${qty}`);
      logs.push({
        ingredient_id: prod.direct_ingredient_id,
        type: 'order_consumption',
        quantity: qty,
        reason: `Hazır məhsul satışı — Sifariş #${orderId.slice(0, 8)}`,
      });
    }
  }

  // 2b. RESEPTLİ MƏHSULLAR: recipes cədvəlindən oxu
  if (recipeProductIds.length > 0) {
    const { data: recipes } = await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id, quantity_required, quantity_brutto')
      .in('menu_item_id', recipeProductIds);

    console.log('[stockAutomation] Recipes found:', recipes?.length || 0, JSON.stringify(recipes, null, 2));

    if (recipes && recipes.length > 0) {
      for (const item of items) {
        const prod = Array.isArray(item.products) ? item.products[0] : item.products;
        if (prod?.is_ready_product) continue; // hazır məhsulları skip

        const itemRecipes = recipes.filter(r => r.menu_item_id === item.product_id);
        console.log(`[stockAutomation] Item ${item.product_id} (qty=${item.quantity}): ${itemRecipes.length} recipes matched`);
        for (const rec of itemRecipes) {
          const unitQty = (rec.quantity_brutto ?? rec.quantity_required);
          const deductQty = unitQty * (Number(item.quantity) || 1);
          console.log(`[stockAutomation] Recipe deduct: ingredient=${rec.ingredient_id}, unit=${unitQty}, itemQty=${item.quantity}, total=${deductQty}`);
          logs.push({
            ingredient_id: rec.ingredient_id,
            type: 'order_consumption',
            quantity: deductQty,
            reason: `Reseptli satış — Sifariş #${orderId.slice(0, 8)}`,
          });
        }
      }
    }
  }

  console.log('[stockAutomation] Logs to insert:', JSON.stringify(logs, null, 2));

  if (logs.length === 0) {
    console.log(`[stockAutomation] No stock to deduct for order ${orderId}`);
    return;
  }

  // 3. inventory_logs-a insert et (trigger current_stock-u avtomatik yeniləyəcək)
  const { error: insertError } = await supabase.from('inventory_logs').insert(logs);
  if (insertError) {
    console.error('[stockAutomation] inventory_logs insert error:', insertError);
  } else {
    console.log(`[stockAutomation] ${logs.length} inventory log(s) written for order ${orderId}`);
  }
}

/**
 * Manual deduction — birbaşa inventory_logs-a order_consumption yaz
 */
export async function deductStockManual(
  rows: { ingredient_id: string; quantity: number; reason?: string }[],
): Promise<void> {
  const supabase = getServiceClient();

  const logs = rows.map(item => ({
    ingredient_id: item.ingredient_id,
    quantity: Math.abs(item.quantity),
    type: 'order_consumption' as const,
    reason: item.reason || 'Manual deduction',
  }));

  const { error } = await supabase.from('inventory_logs').insert(logs);
  if (error) console.error('[deductStockManual] Error:', error);
}
