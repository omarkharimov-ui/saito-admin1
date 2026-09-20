import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// pr v1 — REAL reprint (was fake success: inserted into nonexistent
// `order_reprints` table and returned "Reprint logged (no table)").
// Body: { order_id } → enqueues a receipt print job (doc_type=receipt,
// trigger_key=reprint:<ts> so repeated reprints each print once; the
// idempotency unique is per trigger_key). Routing to a device + terminal
// claim + actual print happens through the pr v1 job pipeline; if no
// receipt device is configured, { routed: false } and the client falls
// back to its legacy direct browser print.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// print_enqueue() RPC (audit inside).

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { order_id } = await request.json().catch(() => ({}));
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const res = await fetch(`${url}/rest/v1/rpc/print_enqueue`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_location_id: null, // resolved from the order inside the RPC
        p_doc_type: 'receipt',
        p_order_id: order_id,
        p_trigger_key: `reprint:${Date.now()}`,
        p_payload: { reason: 'manual_reprint' },
        p_staff_id: auth.user?.id || null,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Reprint failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });

    return NextResponse.json({
      success: true,
      routed: row.routed,
      job: row.job || null,
      message: row.routed ? 'Reprint queued' : 'Reprint requested (no receipt device — use direct print)',
    });
  } catch (error: any) {
    console.error('[API /orders/reprint] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
