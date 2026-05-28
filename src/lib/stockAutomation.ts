/**
 * STOCK AUTOMATION — Avtomatik Satış Deduction
 *
 * İstifadəsi:
 *   1. products cədvəlinə "recipe" JSONB column əlavə edin:
 *      [{ "ingredient_id": "uuid", "quantity": 0.2 }, ...]
 *
 *   2. Sifariş ödəniləndə (status = 'paid') bu funksiyanı çağırın:
 *      await deductStockForOrder(orderId);
 *
 *   3. Yaxud orders tablosuna Supabase Database Webhook/Trigger qoyun
 *      ki, status 'paid'-a keçəndə avtomatik tetiklənsin.
 */

import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface RecipeItem {
  ingredient_id: string;
  quantity: number; // məs: 0.2 kq
}

/**
 * Sifarişdəki hər məhsulun recipe-sinə əsasən stoku azaldır.
 * @param orderId - ödənilmiş sifarişin ID-si
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const supabase = getServiceClient();

  // 1. Sifarişin item-lərini çək (product recipe-si ilə birlikdə)
  const { data: items, error } = await supabase
    .from('order_items')
    .select('quantity, products(id, recipe)')
    .eq('order_id', orderId);

  if (error || !items) {
    console.error('[stockAutomation] Failed to fetch order items:', error);
    return;
  }

  // 2. Hər item üçün recipe-yə baxıb transaction yarat
  for (const item of items) {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    const recipe: RecipeItem[] = product?.recipe ?? [];

    for (const recipeItem of recipe) {
      const deductQty = recipeItem.quantity * (item.quantity ?? 1);

      await supabase.from('stock_transactions').insert({
        ingredient_id: recipeItem.ingredient_id,
        quantity: -deductQty,         // mənfi = stokdan çıx
        type: 'sale',
        description: `Avtomatik satış deduction — Sifariş #${orderId.slice(0, 8)}`,
      });
    }
  }

  console.log(`[stockAutomation] Stock deducted for order ${orderId}`);
}

/**
 * TEK MƏHSUL üçün manual deduction nümunəsi:
 *
 * Saito Roll sifariş verildiyi zaman:
 *   - Düyü: -0.15 kq
 *   - Somon: -0.08 kq
 *   - Nori: -1 ədəd
 *
 * await deductStockManual([
 *   { ingredient_id: 'duyu-uuid',  quantity: -0.15 },
 *   { ingredient_id: 'somon-uuid', quantity: -0.08 },
 *   { ingredient_id: 'nori-uuid',  quantity: -1    },
 * ], 'Saito Roll satışı');
 */
export async function deductStockManual(
  items: { ingredient_id: string; quantity: number }[],
  description: string
): Promise<void> {
  const supabase = getServiceClient();

  const rows = items.map(item => ({
    ingredient_id: item.ingredient_id,
    quantity: -Math.abs(item.quantity), // həmişə mənfi
    type: 'sale' as const,
    description,
  }));

  const { error } = await supabase.from('stock_transactions').insert(rows);
  if (error) console.error('[deductStockManual] Error:', error);
}
