import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * POST /api/orders/return-to-stock
 *
 * Return a READY/SERVED order item to stock.
 * Stock was consumed at READY; this reverses it.
 *
 * Body: {
 *   order_item_id: string,
 *   quantity?: number   // null = full quantity
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const supabase = await createAuthClient();
    const { order_item_id, quantity, reason, reason_text } = await req.json();

    if (!order_item_id) {
      return NextResponse.json({ error: 'order_item_id required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('return_to_stock', {
      p_order_item_id: order_item_id,
      p_quantity: quantity || null,
      p_reason: reason || 'return_to_stock',
      p_reason_text: reason_text || null,
      p_performed_by: auth.user?.id || null,
    });

    if (error) throw error;
    if (data && !data.success) {
      return NextResponse.json(data, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
