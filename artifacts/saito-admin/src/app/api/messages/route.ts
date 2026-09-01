import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(req: Request) {
  try {
    const s = svc();
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staff');

    if (!staffId) {
      return NextResponse.json({ error: 'staff parameter required' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/rpc/get_messages`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_staff_id: staffId }),
    });

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = svc();
    const body = await req.json();
    const { fromStaffId, toStaffId, locationId, type, subject, content } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/send_message`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_from_staff_id: fromStaffId,
        p_to_staff_id: toStaffId,
        p_location_id: locationId,
        p_type: type,
        p_subject: subject,
        p_content: content,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
