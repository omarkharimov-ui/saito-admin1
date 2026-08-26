import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { paymentRateLimit } from '@/lib/rate-limit';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const rateLimitResult = paymentRateLimit(request);
    if (rateLimitResult) return rateLimitResult;

    const { items, reason } = await request.json();
    if (!items?.length || !reason) {
      return NextResponse.json({ error: 'items[] and reason are required' }, { status: 400 });
    }

    const s = svc();
    const results: any[] = [];

    for (const item of items) {
      const productRes = await fetch(
        `${s.url}/rest/v1/products?id=eq.${item.product_id}&select=is_ready_product,direct_ingredient_id`,
        { headers: s.headers },
      );
      const product = (await productRes.json())?.[0];
      if (!product) continue;

      if (product.is_ready_product && product.direct_ingredient_id) {
        const insertRes = await fetch(`${s.url}/rest/v1/inventory_logs`, {
          method: 'POST',
          headers: s.headers,
          body: JSON.stringify({
            ingredient_id: product.direct_ingredient_id,
            type: 'waste',
            quantity: item.quantity,
            unit_cost: item.unit_price || 0,
            reason: `POS itki: ${reason}`,
            reference_type: 'loss',
            created_at: new Date().toISOString(),
          }),
        });
        if (!insertRes.ok) {
          const err = await insertRes.text();
          throw new Error(`Inventory insert failed: ${err}`);
        }
        results.push({ product_id: item.product_id, ingredient_id: product.direct_ingredient_id, quantity: item.quantity });
      } else {
        const recipesRes = await fetch(
          `${s.url}/rest/v1/recipes?menu_item_id=eq.${item.product_id}&is_ai_suggested=eq.false&select=ingredient_id,quantity_required,quantity_brutto`,
          { headers: s.headers },
        );
        const recipes = await recipesRes.json();
        for (const r of (recipes || [])) {
          const qty = (r.quantity_brutto ?? r.quantity_required) * item.quantity;
          const insertRes = await fetch(`${s.url}/rest/v1/inventory_logs`, {
            method: 'POST',
            headers: s.headers,
            body: JSON.stringify({
              ingredient_id: r.ingredient_id,
              type: 'waste',
              quantity: qty,
              unit_cost: item.unit_price || 0,
              reason: `POS itki: ${reason}`,
              reference_type: 'loss',
              created_at: new Date().toISOString(),
            }),
          });
          if (!insertRes.ok) {
            const err = await insertRes.text();
            throw new Error(`Inventory insert failed: ${err}`);
          }
          results.push({ product_id: item.product_id, ingredient_id: r.ingredient_id, quantity: qty });
        }
      }
    }

    return NextResponse.json({ success: true, entries: results.length });
  } catch (error: any) {
    console.error('[API /stock/loss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
