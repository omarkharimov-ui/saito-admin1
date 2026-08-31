import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const VOID_APPROVAL_THRESHOLD = 50;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const supabase = await createAuthClient();
    const { order_id, items, reason } = await req.json();
    if (!order_id || !items?.length) {
      return NextResponse.json({ error: 'order_id and items required' }, { status: 400 });
    }

    const s = svc();

    // Calculate void amount server-side from catalog prices
    const orderRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}&select=order_items(*)`, { headers: s.headers });
    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
    }
    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const orderItems = orders[0].order_items || [];

    const productIds = [...new Set(orderItems.map((i: any) => i.product_id).filter(Boolean))];
    let productPriceMap: Record<string, number> = {};
    if (productIds.length > 0) {
      const productsRes = await fetch(`${s.url}/rest/v1/products?id=in.(${productIds.join(',')})&select=id,price`, { headers: s.headers });
      const products = await productsRes.json();
      if (Array.isArray(products)) {
        for (const p of products) {
          productPriceMap[p.id] = Number(p.price) || 0;
        }
      }
    }

    let voidAmount = 0;
    for (const voidItem of items) {
      const orderItem = orderItems.find((i: any) => i.id === voidItem.order_item_id);
      if (!orderItem) continue;
      const qty = Number(voidItem.quantity) || 0;
      const price = productPriceMap[orderItem.product_id] || Number(orderItem.unit_price) || 0;
      voidAmount += price * qty;
    }

    // Check if approval is required
    const { data: hasVoidApprove, error: approveErr } = await supabase.rpc('has_permission', {
      p_staff_id: auth.user!.id,
      p_permission: 'void.approve',
    });

    if (approveErr || !hasVoidApprove) {
      // Create pending approval request
      const approvalData: any = {
        staff_id: auth.user.id,
        action_type: 'void',
        entity_type: 'order',
        entity_id: order_id,
        amount: voidAmount,
        reason: reason || null,
        old_values: { items: items.map((i: any) => ({ order_item_id: i.order_item_id, quantity: i.quantity })) },
        new_values: { items_voided: items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0) },
        status: 'pending',
      };

      const approvalRes = await fetch(`${s.url}/rest/v1/approval_requests`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(approvalData),
      });

      if (!approvalRes.ok) {
        const errText = await approvalRes.text();
        return NextResponse.json({ error: errText || 'Failed to create approval request' }, { status: 400 });
      }

      return NextResponse.json({
        error: `Void amount ${voidAmount.toFixed(2)} exceeds threshold ${VOID_APPROVAL_THRESHOLD}. Manager approval required.`,
        requires_approval: true,
        void_amount: voidAmount,
        threshold: VOID_APPROVAL_THRESHOLD,
      }, { status: 403 });
    }

    // User has void.approve permission, execute void
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('void_items_state_aware', {
      p_order_id: order_id,
      p_items: items.map((i: any) => ({
        order_item_id: i.order_item_id,
        quantity: i.quantity,
      })),
      p_performed_by: auth.user?.id || null,
      p_reason: reason || null,
    });

    if (rpcErr) throw rpcErr;
    if (!rpcResult?.success) {
      return NextResponse.json(rpcResult, { status: 400 });
    }

    // Log approved void
    const voidItems = items || [];
    const totalVoided = voidItems.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
    if (totalVoided > 0) {
      await fetch(`${s.url}/rest/v1/approval_requests`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          staff_id: auth.user?.id || null,
          action_type: 'void',
          entity_type: 'order',
          entity_id: order_id,
          amount: voidAmount,
          reason: reason || null,
          old_values: { items: voidItems.map((i: any) => ({ order_item_id: i.order_item_id, quantity: i.quantity })) },
          new_values: { items_voided: totalVoided, void_amount: voidAmount },
          status: 'approved',
        }),
      }).catch(() => {});
    }

    return NextResponse.json(rpcResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
