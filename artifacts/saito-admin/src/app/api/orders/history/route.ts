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
    // AUDIT 2026-09-23: the old bounds were hardcoded UTC — a Baku user
    // (UTC+4) filtering "23 sentyabr" lost the first 4 local hours and
    // leaked 4 hours of the next day. The client now sends its offset.
    const tzOffsetMin = Number(url.searchParams.get('tz_offset_min') || 0);
    const localDayStart = (d: string) => new Date(new Date(`${d}T00:00:00`).getTime() + tzOffsetMin * 60000).toISOString();
    const localDayEnd = (d: string) => new Date(new Date(`${d}T00:00:00`).getTime() + tzOffsetMin * 60000 + 86400000 - 1).toISOString();

    const s = svc();
    // 2026-09-23 (owner, Toast/Square benchmark): status filters — refunded /
    // cancelled / all (before: paid only; voided & refunded orders were
    // invisible from the POS history).
    const statusFilter = (st: string) => {
      if (st === 'refunded') return 'status=in.(refunded,partially_refunded)';
      if (st === 'cancelled') return 'status=in.(cancelled,voided)';
      if (st === 'all') return 'status=in.(paid,refunded,partially_refunded,cancelled,voided,closed)';
      return `status=eq.${st}`;
    };
    let query = `${s.url}/rest/v1/orders?${statusFilter(status)}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*,order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,variant_id,variant_name,modifiers,special_notes,combo_group_id,kitchen_status,served_quantity,prepared_quantity,products(name_az,name_en))`;

    if (orderSource) {
      query += `&order_source=eq.${orderSource}`;
    }
    if (dateFrom) {
      query += `&created_at=gte.${localDayStart(dateFrom)}`;
    }
    if (dateTo) {
      query += `&created_at=lte.${localDayEnd(dateTo)}`;
    }

    const res = await fetch(query, { headers: s.headers });
    if (!res.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    const orders = await res.json();
    
    // Get total count for pagination
    let countQuery = `${s.url}/rest/v1/orders?${statusFilter(status)}`;
    if (orderSource) {
      countQuery += `&order_source=eq.${orderSource}`;
    }
    if (dateFrom) {
      countQuery += `&created_at=gte.${localDayStart(dateFrom)}`;
    }
    if (dateTo) {
      countQuery += `&created_at=lte.${localDayEnd(dateTo)}`;
    }
    
    // AUDIT 2026-09-23: the old count used `select=count` (returns an empty
    // array — totalCount was ALWAYS 0). PostgREST counts need head + Prefer.
    const countRes = await fetch(countQuery, {
      headers: { ...s.headers, Prefer: 'count=exact', Range: '0-0' },
    });
    const totalHeader = countRes.headers.get('content-range') || '';
    const totalCount = Number(totalHeader.split('/')[1]) || 0;
    
    return NextResponse.json({ orders: orders || [], totalCount, limit, offset });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
