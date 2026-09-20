import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';

// pr v1 — enqueue a print job (ANY authenticated staff — POS terminals).
// Body: { doc_type: 'receipt'|'kitchen'|'label', order_id?, trigger_key, payload? }
// D-5: location is SERVER-DERIVED (never client-supplied) — from the order
// row when order_id is given (authoritative), otherwise the operator's
// write-location context (NO_LOCATION_CONTEXT → 400 when unresolvable).
// Idempotent per (location, doc_type, order, trigger_key) — duplicate calls
// return { duplicate: true } without creating a second job.
// Routing happens SERVER-SIDE (oldest enabled device matching doc_type);
// no device → { routed: false } and the client keeps its legacy direct print.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → D-5 location →
// service_role → print_enqueue() RPC (validation + audit inside).

const DOC_TYPES = ['receipt', 'kitchen', 'label'];

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    if (!DOC_TYPES.includes(body.doc_type) ||
        typeof body.trigger_key !== 'string' || !body.trigger_key.trim()) {
      return NextResponse.json(
        { error: 'doc_type (receipt|kitchen|label) and trigger_key required' }, { status: 400 });
    }

    const orderId = typeof body.order_id === 'string' && body.order_id ? body.order_id : null;
    // D-5: no order → resolve the operator's location server-side
    let locationId: string | null = null;
    if (!orderId) {
      const ctx = await resolveWriteLocationContext(auth.user!.id);
      if (!ctx) return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
      locationId = ctx.locationId;
    }

    const res = await fetch(`${url}/rest/v1/rpc/print_enqueue`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_location_id: locationId,
        p_doc_type: body.doc_type,
        p_order_id: orderId,
        p_trigger_key: body.trigger_key.trim().slice(0, 64),
        p_payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        p_staff_id: auth.user?.id || null,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Enqueue failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
