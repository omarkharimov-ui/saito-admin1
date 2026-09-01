import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: Request) {
  try {
    const s = svc();
    const body = await req.json();
    const { requesterShiftId, targetStaffId, targetShiftId, requestedBy, message } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/request_shift_swap`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_requester_shift_id: requesterShiftId,
        p_target_staff_id: targetStaffId,
        p_target_shift_id: targetShiftId,
        p_requested_by: requestedBy,
        p_message: message,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
