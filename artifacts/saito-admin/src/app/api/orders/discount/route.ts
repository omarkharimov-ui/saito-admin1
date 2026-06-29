import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

type DiscountType = 'percent' | 'fixed' | 'item_percent' | 'item_fixed';

interface DiscountRequest {
  order_id: string;
  discount_type: DiscountType;
  discount_value: number;
  item_id?: string;
  reason?: string;
  approved_by?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body: DiscountRequest = await request.json();
    const { order_id, discount_type, discount_value, item_id, reason, approved_by } = body;

    if (!order_id || !discount_type || discount_value === undefined || discount_value === null) {
      return NextResponse.json({ error: 'order_id, discount_type, and discount_value are required' }, { status: 400 });
    }

    const s = svc();

    const isItemLevel = discount_type.startsWith('item_');
    if (isItemLevel && !item_id) {
      return NextResponse.json({ error: 'item_id is required for item-level discounts' }, { status: 400 });
    }

    const orderRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}&select=*,order_items(*)`, { headers: s.headers });
    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
    }
    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const order = orders[0];
    const items = order.order_items || [];

    const oldAmount = Number(order.total_amount) || 0;

    if (isItemLevel) {
      const item = items.find((i: any) => i.id === item_id);
      if (!item) {
        return NextResponse.json({ error: 'Item not found in order' }, { status: 404 });
      }

      const preparedQty = Number(item.prepared_quantity) || 0;
      const orderedQty = Number(item.quantity) || 0;
      if (preparedQty >= orderedQty) {
        return NextResponse.json({ error: 'Cannot apply discount to prepared item' }, { status: 400 });
      }

      const itemTotal = (Number(item.unit_price) || 0) * orderedQty;

      let newUnitPrice: number;

      if (discount_type === 'item_percent') {
        if (discount_value < 0 || discount_value > 100) {
          return NextResponse.json({ error: 'Percent discount must be between 0 and 100' }, { status: 400 });
        }
        newUnitPrice = Number(item.unit_price) * (1 - discount_value / 100);
      } else {
        if (discount_value < 0) {
          return NextResponse.json({ error: 'Fixed discount cannot be negative' }, { status: 400 });
        }
        if (discount_value > itemTotal) {
          return NextResponse.json({ error: 'Fixed discount cannot exceed item total' }, { status: 400 });
        }
        newUnitPrice = (itemTotal - discount_value) / orderedQty;
      }

      await fetch(`${s.url}/rest/v1/order_items?id=eq.${item_id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ unit_price: newUnitPrice, total_price: newUnitPrice * orderedQty }),
      });
    }

    const isOrderPercent = discount_type === 'percent';
    const isOrderFixed = discount_type === 'fixed';

    if (isOrderPercent && (discount_value < 0 || discount_value > 100)) {
      return NextResponse.json({ error: 'Percent discount must be between 0 and 100' }, { status: 400 });
    }

    if (isOrderFixed && discount_value < 0) {
      return NextResponse.json({ error: 'Fixed discount cannot be negative' }, { status: 400 });
    }

    if (isOrderPercent && discount_value > 20 && auth.role === 'cashier') {
      return NextResponse.json({ error: 'Discounts over 20% require manager approval' }, { status: 403 });
    }

    if (isOrderPercent && discount_value > 20) {
      if (!reason || !approved_by) {
        return NextResponse.json({ error: 'reason and approved_by are required for discounts over 20%' }, { status: 400 });
      }
    }

    if (isOrderFixed) {
      const itemsTotal = items.reduce((sum: number, i: any) => sum + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0);
      if (discount_value > itemsTotal) {
        return NextResponse.json({ error: 'Fixed discount cannot exceed order total' }, { status: 400 });
      }
    }

    let newTotalAmount = 0;
    if (!isItemLevel) {
      const itemsTotal = items.reduce((sum: number, i: any) => sum + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0);

      if (discount_type === 'percent') {
        newTotalAmount = itemsTotal * (1 - discount_value / 100);
      } else {
        newTotalAmount = Math.max(0, itemsTotal - discount_value);
      }
    } else {
      const updatedItemsRes = await fetch(`${s.url}/rest/v1/order_items?order_id=eq.${order_id}&select=unit_price,quantity`, { headers: s.headers });
      const updatedItems = await updatedItemsRes.json();
      newTotalAmount = updatedItems.reduce((sum: number, i: any) => sum + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0);
    }

    await fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ total_amount: newTotalAmount }),
    });

    const auditLog = {
      action: 'discount',
      order_id,
      item_id: isItemLevel ? item_id : null,
      old_amount: oldAmount,
      new_amount: newTotalAmount,
      discount_type,
      discount_value,
      reason: reason || null,
      approved_by: approved_by || null,
      created_at: new Date().toISOString(),
      created_by: auth.user.id,
    };

    const auditRes = await fetch(`${s.url}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(auditLog),
    });

    if (!auditRes.ok) {
      console.error('[discount] Audit log creation failed');
    }
    const discountRecord = await auditRes.json();

    return NextResponse.json({
      success: true,
      order_total: newTotalAmount,
      discount: discountRecord?.[0] || auditLog,
    });
  } catch (error: any) {
    console.error('[API /orders/discount] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}