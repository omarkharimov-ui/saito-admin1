import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

function supabaseRpc() {
  const s = svc();
  return createClient(s.url, s.headers['Authorization'].replace('Bearer ', ''));
}

interface ApplyVatRequest {
  order_id: string;
  apply_vat: boolean;
  apply_service?: boolean;
}

/**
 * 1.5 / Q2: POS VAT toggle — MANAGER PIN required (client PinGuard) +
 * server-side permission re-verification (discount.approve = manager+).
 * Calculation is SSOT-only: calculate_order_total_v3 (DB). No math here.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body: ApplyVatRequest = await request.json();
    const { order_id, apply_vat, apply_service } = body;
    if (!order_id || typeof apply_vat !== 'boolean') {
      return NextResponse.json({ error: 'order_id and apply_vat (boolean) required' }, { status: 400 });
    }

    // Manager-only (R3/POS): cashier cannot add/remove VAT.
    const { data: hasApprove, error: approveErr } = await supabaseRpc().rpc('has_permission', {
      p_staff_id: auth.user!.id,
      p_permission: 'discount.approve',
    });
    if (approveErr || !hasApprove) {
      return NextResponse.json({ error: 'VAT changes require manager approval' }, { status: 403 });
    }

    const s = svc();
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/calculate_order_total_v3`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_order_id: order_id,
        p_apply_vat: apply_vat,
        p_apply_service: apply_service ?? false,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return NextResponse.json({ error: `Total recompute failed: ${errText}` }, { status: 500 });
    }

    const result = await rpcRes.json();

    // Audit (same pattern as discount).
    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        order_id,
        action: apply_vat ? 'apply_vat' : 'remove_vat',
        old_values: JSON.stringify({ apply_vat: !apply_vat }),
        new_values: JSON.stringify({ apply_vat, result }),
        performed_by: auth.user!.id,
      }),
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'VAT toggle failed' }, { status: 500 });
  }
}
