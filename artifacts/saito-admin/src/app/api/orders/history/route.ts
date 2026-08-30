import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'paid';
    const orderSource = url.searchParams.get('order_source');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    const s = svc();
    let query = `${s.url}/rest/v1/orders?status=eq.${status}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*,order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,variant_id,variant_name,modifiers,special_notes,combo_group_id,kitchen_status,served_quantity,prepared_quantity,products(name_az,name_en))`;

    if (orderSource) {
      query += `&order_source=eq.${orderSource}`;
    }
    if (dateFrom) {
      query += `&created_at=gte.${dateFrom}T00:00:00.000Z`;
    }
    if (dateTo) {
      const endDate = new Date(dateTo + 'T23:59:59.999Z').toISOString();
      query += `&created_at=lte.${endDate}`;
    }

    const res = await fetch(query, { headers: s.headers });
    if (!res.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    const orders = await res.json();
    
    // Get total count for pagination
    let countQuery = `${s.url}/rest/v1/orders?status=eq.${status}&select=count`;
    if (orderSource) {
      countQuery += `&order_source=eq.${orderSource}`;
    }
    if (dateFrom) {
      countQuery += `&created_at=gte.${dateFrom}T00:00:00.000Z`;
    }
    if (dateTo) {
      const endDate = new Date(dateTo + 'T23:59:59.999Z').toISOString();
      countQuery += `&created_at=lte.${endDate}`;
    }
    
    const countRes = await fetch(countQuery, { headers: s.headers });
    const countData = countRes.ok ? await countRes.json() : [];
    const totalCount = Array.isArray(countData) ? countData.length : 0;
    
    return NextResponse.json({ orders: orders || [], totalCount, limit, offset });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
