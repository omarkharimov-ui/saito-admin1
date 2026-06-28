/**
 * STOCK AUTOMATION v2 — Avtomatik Satış Deduction
 * Yeni sistem: recipes cədvəli + inventory_logs (order_consumption)
 *
 * handlePay çağırıldığında avtomatik işləyir.
 */

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
 *  2. inventory_logs-a order_consumption yaz
 *  3. Trigger avtomatik ingredients.current_stock yeniləyəcək
 */
export async function deductStockForOrder(orderId: string): Promise<{ deducted: number; ingredientIds: string[] }> {
  const supabase = getServiceClient();

  // 0. Idempotency check — bu sifariş artıq işlənibsə, təkrar çıxma
  const { count: existingCount } = await supabase
    .from('inventory_logs')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'order_consumption')
    .eq('order_id', orderId);
  if (existingCount && existingCount > 0) {
    console.log(`[stockAutomation] Order ${orderId} already processed (${existingCount} logs), skipping`);
    return { deducted: 0, ingredientIds: [] };
  }

  // 1. Sifarişin item-lərini çək (product tipi ilə birlikdə)
  const { data: items, error } = await supabase
    .from('order_items')
    .select('quantity, product_id, products(is_ready_product, direct_ingredient_id)')
    .eq('order_id', orderId);

  if (error || !items || items.length === 0) {
    console.error('[stockAutomation] Failed to fetch order items:', error);
    return { deducted: 0, ingredientIds: [] };
  }

  console.log('[stockAutomation] Order items:', JSON.stringify(items, null, 2));

  const logs: { ingredient_id: string; type: 'order_consumption'; quantity: number; reason: string; order_id: string }[] = [];

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
        order_id: orderId,
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

    console.log('[stockAutomation] Recipes found:', recipes?.length || 0, JSON.stringify(recipes, null, 2));

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

  console.log('[stockAutomation] Logs to insert:', JSON.stringify(logs, null, 2));

  if (logs.length === 0) {
    console.log(`[stockAutomation] No stock to deduct for order ${orderId}`);
    return { deducted: 0, ingredientIds: [] };
  }

  // 3. inventory_logs-a insert et (trigger current_stock-u avtomatik yeniləyəcək)
  const ingredientIds = [...new Set(logs.map(l => l.ingredient_id))];
  const { error: insertError } = await supabase.from('inventory_logs').insert(logs);
  if (insertError) {
    console.error('[stockAutomation] inventory_logs insert error:', insertError);
    return { deducted: 0, ingredientIds: [] };
  } else {
    console.log(`[stockAutomation] ${logs.length} inventory log(s) written for order ${orderId}`);
    return { deducted: logs.length, ingredientIds };
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
