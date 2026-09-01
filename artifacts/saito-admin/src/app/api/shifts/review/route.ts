import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { shift_id, declared_cash_tips, declared_tip_out, declared_notes } = body;

    if (!shift_id) {
      return NextResponse.json({ error: 'shift_id is required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/submit_shift_review`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_shift_id: shift_id,
        p_staff_id: auth.user.id,
        p_declared_cash_tips: declared_cash_tips || 0,
        p_declared_tip_out: declared_tip_out || 0,
        p_declared_notes: declared_notes || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to submit shift review' }, { status: 400 });
    }

    return NextResponse.json({ success: true, review: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shift_id');

    if (!shiftId) {
      return NextResponse.json({ error: 'shift_id is required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/shift_reviews?shift_id=eq.${shiftId}&select=*`, {
      headers: s.headers,
    });

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
