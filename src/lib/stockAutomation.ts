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
 *  1. Hər order_item-in product_id-sinə görə recipes cədvəlindən resept çək
 *  2. Reseptdəki hər ingredient üçün inventory_logs-a order_consumption yaz
 *  3. Trigger avtomatik ingredients.current_stock yeniləyəcək
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const supabase = getServiceClient();

  // 1. Sifarişin item-lərini çək
  const { data: items, error } = await supabase
    .from('order_items')
    .select('quantity, product_id')
    .eq('order_id', orderId);

  if (error || !items || items.length === 0) {
    console.error('[stockAutomation] Failed to fetch order items:', error);
    return;
  }

  // 2. Hər məhsul üçün recipes-dən ingredient-ləri çək
  const productIds = items.map(i => i.product_id).filter(Boolean);
  const { data: recipes } = await supabase
    .from('recipes')
    .select('menu_item_id, ingredient_id, quantity_required')
    .in('menu_item_id', productIds);

  if (!recipes || recipes.length === 0) {
    console.log(`[stockAutomation] No recipes found for order ${orderId}`);
    return;
  }

  // 3. Hər item üçün reseptə uyğun inventory_logs yaz
  const logs: { ingredient_id: string; type: 'order_consumption'; quantity: number; reason: string }[] = [];

  for (const item of items) {
    const itemRecipes = recipes.filter(r => r.menu_item_id === item.product_id);
    for (const rec of itemRecipes) {
      const deductQty = Number(rec.quantity_required) * (Number(item.quantity) || 1);
      logs.push({
        ingredient_id: rec.ingredient_id,
        type: 'order_consumption',
        quantity: deductQty,
        reason: `Satış — Sifariş #${orderId.slice(0, 8)}`,
      });
    }
  }

  if (logs.length === 0) return;

  // 4. inventory_logs-a insert et (trigger current_stock-u avtomatik yeniləyəcək)
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
