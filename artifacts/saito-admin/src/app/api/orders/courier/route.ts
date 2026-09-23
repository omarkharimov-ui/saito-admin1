import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

/**
 * POST /api/orders/courier — 2026-09-23 (owner): "kuryer staff səhifəsinə
 * köçür, DB-də düzgün et".
 *
 * Couriers are now real staff records (role 'courier', created on the Staff
 * page). Assigning a courier to a delivery order writes BOTH the reference
 * (courier_id → staff.id) and a denormalized display name (courier_name), so
 * the BDS board / receipts work without a join. Passing courier_id: null
 * clears the assignment.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('orders.manage');
  if (!auth.authenticated) return auth;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const body = await req.json();
    const { order_id, courier_id, courier_name } = body;
    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

    // Verify the courier is a real ACTIVE staff record — the client can never
    // invent a courier identity (free-text courier_name is not accepted as
    // the source of truth).
    let finalName: string | null = null;
    if (courier_id) {
      const staffRes = await fetch(`${url}/rest/v1/staff?id=eq.${courier_id}&select=id,name,is_active`, { headers });
      if (!staffRes.ok) return NextResponse.json({ error: 'Staff lookup failed' }, { status: 500 });
      const staff = await staffRes.json();
      const row = Array.isArray(staff) ? staff[0] : null;
      if (!row || !row.is_active) {
        return NextResponse.json({ error: 'COURIER_NOT_FOUND' }, { status: 400 });
      }
      finalName = row.name;
    }

    const res = await fetch(`${url}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        courier_id: courier_id || null,
        courier_name: finalName,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `PATCH failed: ${text}` }, { status: res.status });
    }
    return NextResponse.json({ success: true, courier_id: courier_id || null, courier_name: finalName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
