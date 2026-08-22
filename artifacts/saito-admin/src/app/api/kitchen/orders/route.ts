import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const { url, headers } = svc();
    const queryParams = new URLSearchParams({
      select: '*,order_items(*,products(image_url,translations)),merged_into_table:orders!merged_into(table_number)',
      'table_number': 'gt.0',
      'status': 'not.in.(paid,cancelled,closed,completed)',
      'kitchen_status': 'neq.completed',
      order: 'created_at.desc',
    });

    const res = await fetch(`${url}/rest/v1/orders?${queryParams.toString()}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Kitchen orders fetch failed: ${res.status} ${text}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kitchen orders fetch failed' }, { status: 500 });
  }
}
