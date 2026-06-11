/**
 * STOCK AUTOMATION v2 — Avtomatik Satış Deduction
 * Yeni sistem: recipes cədvəli + inventory_logs (order_consumption)
 *
 * handlePay çağırıldığında avtomatik işləyir.
 */

import { createClient } from '@supabase/supabase-js';
import { buildOrderConsumptionPlan, isDirectStockItem } from './inventoryEngine';
import type { ProductCatalogItem, RecipeRow } from '@/types/inventory';

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

  const plan = buildOrderConsumptionPlan({
    items: items as Array<{
      quantity: number;
      product_id: string | null;
      products?: Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'> | Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'>[] | null;
    }>,
    recipes: (await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id, quantity_required, quantity_brutto, ingredient:ingredients(unit)')
      .in('menu_item_id', items.map(item => item.product_id).filter(Boolean) as string[])).data || [] as RecipeRow[],
    orderId,
  });

  logs.push(...plan.logs);

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
