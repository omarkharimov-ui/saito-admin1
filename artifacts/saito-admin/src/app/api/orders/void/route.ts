import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
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
    // P-1 M4 (ratified 2026-09-12): RBAC gate — was requireAuth()-only (any
    // logged-in staff could reach the void path). The manager PIN-override /
    // pending-approval logic below is unchanged.
    const auth = await requirePermission('pos.void');
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const supabase = await createAuthClient();
    const { order_id, items, reason, approver_staff_id } = await req.json();
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
      // Line price of the ORDER (already reflects any applied discount),
      // falling back to the catalog price only when the line price is missing.
      // This keeps the approval threshold honest: voiding a discounted line
      // must count for what it is actually worth, not the pre-discount price.
      const qtyOrdered = Number(orderItem.quantity) || 1;
      const linePrice = Number(orderItem.total_price) ? Number(orderItem.total_price) / qtyOrdered : 0;
      const price = linePrice || productPriceMap[orderItem.product_id] || Number(orderItem.unit_price) || 0;
      voidAmount += price * qty;
    }

    // Approval (Sprint-1 manager-override pattern, same as apply-vat):
    // the session user must hold void.approve, OR the PIN-verified approver
    // (whose identity the client sends after verify-pin) must hold it. The
    // server re-verifies the approver's permission — the PIN itself is only
    // the client-side gate and is never trusted.
    let effectiveActor = auth.user!.id;
    const { data: hasVoidApprove, error: approveErr } = await supabase.rpc('has_permission', {
      p_staff_id: auth.user!.id,
      p_permission: 'void.approve',
    });

    // Void is gated by VOID_APPROVAL_THRESHOLD: small voids are executed
    // directly for pos.void holders; only voids ABOVE the threshold need the
    // void.approve permission (or a PIN-verified approver). The threshold
    // constant was previously defined but never checked — every void by a
    // cashier (no void.approve) 403'd into a pending approval, so "void"
    // appeared broken (item never left the table).
    const needsApproval = voidAmount > VOID_APPROVAL_THRESHOLD;
    if (needsApproval && (approveErr || !hasVoidApprove)) {
      if (approver_staff_id) {
        // PIN-override path: validate the approver directly (no pending
        // approval request is created for a PIN-mediated void).
        const { data: hasApprover, error: approverErr } = await supabase.rpc('has_permission', {
          p_staff_id: approver_staff_id,
          p_permission: 'void.approve',
        });
        if (approverErr || !hasApprover) {
          return NextResponse.json({
            error: 'The PIN entered belongs to a staff without void approval rights',
            requires_approval: true,
          }, { status: 403 });
        }
        effectiveActor = approver_staff_id;
      } else if (!approver_staff_id) {
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
           approval_required: true,
         }, { status: 403 });
       }
     }

    // Execute void. effectiveActor = session user, or the PIN-verified approver
    // when the session user lacked void.approve (recorded for forensics).
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('void_items_state_aware', {
      p_order_id: order_id,
      p_items: items.map((i: any) => ({
        order_item_id: i.order_item_id,
        quantity: i.quantity,
      })),
      p_performed_by: auth.user?.id || null,
      p_reason: reason || (effectiveActor !== auth.user!.id ? `Manager PIN override by ${approver_staff_id}` : null),
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
          new_values: {
            items_voided: totalVoided,
            void_amount: voidAmount,
            // Sprint-1: forensics — who actually authorized (PIN override).
            ...(effectiveActor !== auth.user!.id ? { pin_overridden_by: effectiveActor } : {}),
          },
          status: 'approved',
        }),
      }).catch(() => {});
    }

    return NextResponse.json(rpcResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
