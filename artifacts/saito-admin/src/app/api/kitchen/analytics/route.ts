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
    const auth = await requireAuth(['kitchen', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { order_id, order_item_id, station, action, prep_time_seconds, rush } = body;

    if (!order_id || !order_item_id || !station) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const s = svc();
    const delaySeconds = action === 'deliver' ? Math.max(0, (prep_time_seconds || 0) - 900) : null;

    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/log_kitchen_analytics`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_order_id: order_id,
        p_order_item_id: order_item_id,
        p_station: station,
        p_action: action,
        p_prep_time_seconds: prep_time_seconds || null,
        p_delay_seconds: delaySeconds,
        p_rush: rush || false,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!rpcRes.ok) {
      const err = await rpcRes.text();
      console.error('[kitchen/analytics] RPC failed:', err);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const { searchParams } = new URL(request.url);
    const station = searchParams.get('station');
    const days = parseInt(searchParams.get('days') || '7');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startIso = startDate.toISOString();

    let query = `${s.url}/rest/v1/kitchen_analytics?select=*&created_at=gte.${startIso}&order=created_at.desc`;
    if (station) query += `&station=eq.${station}`;

    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();

    if (!Array.isArray(data)) {
      return NextResponse.json({ analytics: [] });
    }

    const analytics = data.map((a: any) => ({
      ...a,
      prep_time_minutes: a.prep_time_seconds ? Math.round(a.prep_time_seconds / 60) : null,
    }));

    return NextResponse.json({ analytics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
