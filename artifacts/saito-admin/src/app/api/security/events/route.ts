import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

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
    const staffId = searchParams.get('staff_id');
    const eventType = searchParams.get('event_type');
    const limit = parseInt(searchParams.get('limit') || '100');

    const s = svc();
    let query = `${s.url}/rest/v1/security_events?select=*&order=created_at.desc&limit=${limit}`;

    if (staffId) query += `&staff_id=eq.${staffId}`;
    if (eventType) query += `&event_type=eq.${eventType}`;

    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();

    if (!Array.isArray(data)) {
      return NextResponse.json([]);
    }

    const staffIds = [...new Set(data.map((e: any) => e.staff_id).filter(Boolean))];
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

    const enriched = data.map((e: any) => ({
      ...e,
      staff_name: staffMap[e.staff_id] || 'Unknown',
    }));

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staff_id, event_type, success, ip_address, user_agent, metadata } = body;

    if (!event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 });
    }

    const s = svc();

    const res = await fetch(`${s.url}/rest/v1/security_events`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        staff_id: staff_id || null,
        event_type,
        success: success ?? true,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
