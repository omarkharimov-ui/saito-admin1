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
  /**
   * Manager-override via PIN (Toast/Square pattern): if the session user does
   * NOT hold discount.approve, the staffId whose PIN was just verified may be
   * supplied. The server re-verifies that staff's permission — the PIN itself
   * is NOT trusted (it is only the client-side gate).
   */
  approver_staff_id?: string | null;
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
    const { order_id, apply_vat, apply_service, approver_staff_id } = body;
    if (!order_id || typeof apply_vat !== 'boolean') {
      return NextResponse.json({ error: 'order_id and apply_vat (boolean) required' }, { status: 400 });
    }

    // Manager-only (R3/POS): the effective actor (session user, or the
    // PIN-verified approver for a manager override) must hold discount.approve.
    let effectiveActor = auth.user!.id;
    const { data: hasApprove, error: approveErr } = await supabaseRpc().rpc('has_permission', {
      p_staff_id: auth.user!.id,
      p_permission: 'discount.approve',
    });
    if (approveErr || !hasApprove) {
      if (!approver_staff_id) {
        return NextResponse.json(
          { error: 'VAT changes require manager approval', approval_required: true },
          { status: 403 }
        );
      }
      const { data: hasApprover, error: approverErr } = await supabaseRpc().rpc('has_permission', {
        p_staff_id: approver_staff_id,
        p_permission: 'discount.approve',
      });
      if (approverErr || !hasApprover) {
        return NextResponse.json(
          { error: 'The PIN entered belongs to a staff without VAT approval rights', approval_required: true },
          { status: 403 }
        );
      }
      effectiveActor = approver_staff_id;
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

    // Audit (same pattern as discount). effectiveActor = session user, or the
    // PIN-verified approver when the session user lacked the permission.
    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        order_id,
        action: apply_vat ? 'apply_vat' : 'remove_vat',
        old_values: JSON.stringify({ apply_vat: !apply_vat }),
        new_values: JSON.stringify({ apply_vat, result }),
        performed_by: auth.user!.id,
        ...(effectiveActor !== auth.user!.id ? { metadata: { pin_overridden_by: effectiveActor } } : {}),
      }),
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'VAT toggle failed' }, { status: 500 });
  }
}
