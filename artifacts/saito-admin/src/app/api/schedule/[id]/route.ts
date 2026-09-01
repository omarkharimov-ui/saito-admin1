import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = svc();
    const { id } = await params;
    const body = await req.json();
    const { start, end, notes } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/update_schedule`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_schedule_id: id,
        p_start: start,
        p_end: end,
        p_notes: notes,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = svc();
    const { id } = await params;

    const res = await fetch(`${s.url}/rest/v1/rpc/delete_schedule_entry`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_schedule_id: id }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
