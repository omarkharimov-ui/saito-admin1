import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.view');
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const actionType = searchParams.get('action_type') || '';

    const s = svc();
    let query = `${s.url}/rest/v1/approval_requests?select=*&order=created_at.desc`;
    if (status) query += `&status=eq.${status}`;
    if (actionType) query += `&action_type=eq.${actionType}`;

    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();

    if (!Array.isArray(data)) {
      return NextResponse.json([]);
    }

    const staffIds = [...new Set(data.map((r: any) => r.staff_id).filter(Boolean))];
    let staffMap: Record<string, string> = {};

    if (staffIds.length > 0) {
      const staffRes = await fetch(`${s.url}/rest/v1/staff?id=in.(${staffIds.join(',')})&select=id,name`, { headers: s.headers });
      const staffData = await staffRes.json();
      if (Array.isArray(staffData)) {
        for (const s of staffData) {
          staffMap[s.id] = s.name;
        }
      }
    }

    const enriched = data.map((r: any) => ({
      ...r,
      staff_name: staffMap[r.staff_id] || 'Unknown',
    }));

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.manage');
    if (!auth.authenticated) return auth as any;

    const body = await request.json();
    const { staff_id, action_type, entity_type, entity_id, amount, reason, old_values, new_values } = body;

    if (!staff_id || !action_type || !entity_type) {
      return NextResponse.json({ error: 'staff_id, action_type, and entity_type are required' }, { status: 400 });
    }

    const s = svc();
    const supabase = await createAuthClient();

    const requiresApproval = ['cash_discrepancy', 'price_override', 'refund', 'void', 'discount'].includes(action_type);

    const insertData: any = {
      staff_id,
      action_type,
      entity_type,
      entity_id: entity_id || null,
      amount: amount || null,
      reason: reason || null,
      old_values: old_values || null,
      new_values: new_values || null,
      status: requiresApproval ? 'pending' : 'approved',
    };

    if (!requiresApproval) {
      insertData.reviewed_by = auth.user?.id;
      insertData.reviewed_at = new Date().toISOString();
    }

    const res = await fetch(`${s.url}/rest/v1/approval_requests`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(insertData),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to create approval request' }, { status: 400 });
    }

    const created = Array.isArray(data) ? data[0] : data;

    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        action: 'approval_request',
        entity_type: 'approval_request',
        entity_id: created.id,
        old_values: { status: 'pending' },
        new_values: { status: created.status },
        performed_by: auth.user?.id,
        metadata: { action_type, entity_type, amount },
      }),
    });

    return NextResponse.json({ success: true, data: created, requires_approval: requiresApproval });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.manage');
    if (!auth.authenticated) return auth as any;

    const body = await request.json();
    const { id, status, review_note } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const s = svc();
    const supabase = await createAuthClient();

    // Fetch existing approval request
    const fetchRes = await fetch(`${s.url}/rest/v1/approval_requests?id=eq.${id}&select=*`, {
      headers: s.headers,
    });
    const existing = await fetchRes.json();
    const approval = Array.isArray(existing) ? existing[0] : existing;

    if (!approval) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 400 });
    }

    // Prevent self-approval
    if (approval.staff_id === auth.user?.id) {
      return NextResponse.json({ error: 'Cannot approve your own request' }, { status: 403 });
    }

    const patch: any = {
      status,
      reviewed_by: auth.user?.id,
      reviewed_at: new Date().toISOString(),
    };
    if (review_note) patch.review_note = review_note;

    // If approving a void, execute the void atomically
    if (status === 'approved' && approval.action_type === 'void') {
      const { data: hasVoidApprove, error: approveErr } = await supabase.rpc('has_permission', {
        p_staff_id: auth.user!.id,
        p_permission: 'void.approve',
      });

      if (approveErr || !hasVoidApprove) {
        return NextResponse.json({ error: 'You do not have permission to approve voids' }, { status: 403 });
      }

      const items = approval.new_values?.items || approval.old_values?.items || [];
      if (!items.length) {
        return NextResponse.json({ error: 'No items specified for void' }, { status: 400 });
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('void_items_state_aware', {
        p_order_id: approval.entity_id,
        p_items: items.map((i: any) => ({
          order_item_id: i.order_item_id,
          quantity: i.quantity,
        })),
        p_performed_by: approval.staff_id,
        p_reason: approval.reason || review_note || 'Manager approved void',
      });

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }
      if (!rpcResult?.success) {
        return NextResponse.json(rpcResult, { status: 400 });
      }

      patch.executed_at = new Date().toISOString();
      patch.execution_result = rpcResult;
    }

    // If approving a refund, execute the refund atomically
    if (status === 'approved' && approval.action_type === 'refund') {
      const { data: hasRefundApprove, error: approveErr } = await supabase.rpc('has_permission', {
        p_staff_id: auth.user!.id,
        p_permission: 'refund.approve',
      });

      if (approveErr || !hasRefundApprove) {
        return NextResponse.json({ error: 'You do not have permission to approve refunds' }, { status: 403 });
      }

      const refundData = approval.new_values || approval.old_values || {};
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('complete_payment_atomic_v2', {
        p_order_id: approval.entity_id,
        p_payments: JSON.stringify([{
          amount: Number(refundData.refund_amount || refundData.amount || 0),
          method: refundData.method || 'cash',
          is_refund: true,
          reason_text: approval.reason || review_note || 'Manager approved refund',
        }]),
        p_payment_method: refundData.method || 'cash',
        p_performed_by: approval.staff_id,
      });

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }
      if (!rpcResult?.success) {
        return NextResponse.json(rpcResult, { status: 400 });
      }

      patch.executed_at = new Date().toISOString();
      patch.execution_result = rpcResult;
    }

    const res = await fetch(`${s.url}/rest/v1/approval_requests?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to update approval request' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] : data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
