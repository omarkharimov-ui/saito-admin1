import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { original_order_id, items_to_split, version } = await request.json();

    if (!original_order_id || !items_to_split || items_to_split.length === 0) {
      return NextResponse.json({ error: 'original_order_id and items_to_split required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('BillSplit', async () => {
      const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${original_order_id}&select=*`, { headers });
      const originalOrder = (await orderRes.json())?.[0];

      if (!originalOrder) throw new Error('Original order not found');
      if (originalOrder.status === 'paid') throw new Error('Cannot split a paid order');

      if (version !== undefined && originalOrder.version !== undefined && originalOrder.version !== version) {
        throw new Error('CONCURRENCY_CONFLICT');
      }

      const splitTotal = items_to_split.reduce((sum: number, item: any) => sum + (Number(item.unit_price) * Number(item.quantity)), 0);
      const newOriginalTotal = Math.max(0, Number(originalOrder.total_amount) - splitTotal);

      const newOrderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          table_number: originalOrder.table_number,
          total_amount: splitTotal,
          guest_count: 1, // Split usually implies 1 or more, default to 1
          status: 'confirmed',
          kitchen_status: 'pending',
          merged_into: originalOrder.id, // Keep link for tracking
          is_split: true,
          created_at: new Date().toISOString(),
          version: 1
        }),
      });

      if (!newOrderRes.ok) throw new Error('Failed to create split order');
      const newOrder = (await newOrderRes.json())?.[0];

      for (const item of items_to_split) {
        await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: newOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: Number(item.unit_price) * Number(item.quantity),
            modifiers: item.modifiers,
            kitchen_status: 'ready' // Usually split items are already cooked
          }),
        });

        const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/order_items?id=eq.${item.id}&select=id,quantity`, { headers });
        const origItems = await itemRes.json();
        if (Array.isArray(origItems) && origItems.length > 0) {
          const origItem = origItems[0];
          const newQty = Math.max(0, (Number(origItem.quantity) || 0) - (Number(item.quantity) || 0));
          if (newQty > 0) {
            await fetch(`${SUPABASE_URL}/rest/v1/order_items?id=eq.${origItem.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ quantity: newQty }),
            });
          } else {
            await fetch(`${SUPABASE_URL}/rest/v1/order_items?id=eq.${origItem.id}`, {
              method: 'DELETE',
              headers,
            });
          }
        }
      }

      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${original_order_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          total_amount: newOriginalTotal,
          version: (originalOrder.version || 0) + 1
        }),
      });

      if (!updateRes.ok) throw new Error('Failed to update original order total');

      return {
        original_order_id,
        new_order_id: newOrder.id,
        split_total: splitTotal,
        undo_payload: { original_order_id, new_order_id: newOrder.id, split_total: splitTotal }
      };
    });

    if (!result.success && result.error === 'CONCURRENCY_CONFLICT') {
      return NextResponse.json({ error: 'Order modified by another user' }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
