import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/orders/history/exceptions — 2026-09-23 (owner, Toast "Sales
 * Exception Report" / Square voided-comped audit).
 *
 * One place to answer "kim nə ləğv etdi, nə üçün, nə vaxt":
 * void / cancel / refund events from audit_logs (order id in record_id —
 * see the history [id] route fix), enriched with the order reference and
 * the staff name.
 */
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const tzOffsetMin = Number(url.searchParams.get('tz_offset_min') || 0);
    const localDayStart = (d: string) => new Date(new Date(`${d}T00:00:00`).getTime() + tzOffsetMin * 60000).toISOString();
    const localDayEnd = (d: string) => new Date(new Date(`${d}T00:00:00`).getTime() + tzOffsetMin * 60000 + 86400000 - 1).toISOString();

    const s = svc();
    let query = `${s.url}/rest/v1/audit_logs?action=in.(void,cancel,refund)&record_id=not.is.null&order=created_at.desc&limit=150&select=id,action,record_id,reason,performed_by,staff_name,created_at`;
    if (dateFrom) query += `&created_at=gte.${localDayStart(dateFrom)}`;
    if (dateTo) query += `&created_at=lte.${localDayEnd(dateTo)}`;

    const res = await fetch(query, { headers: s.headers });
    if (!res.ok) return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    let rows: any[] = await res.json();
    // Legacy probe rows carry INTEGER record_ids (2026-09-17 E2E triggers) —
    // they reference no order and carry no reason/staff: drop the pure
    // garbage, keep anything with real context.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    rows = rows.filter(r => UUID_RE.test(String(r.record_id || '')) || r.reason || r.staff_name);
    if (!rows.length) return NextResponse.json({ exceptions: [] });

    // Order references (record_id → order).
    const orderIds = Array.from(new Set(rows.map(r => r.record_id))) as string[];
    const orderRef: Record<string, string> = {};
    const orderInClause = orderIds.map(id => encodeURIComponent(id)).join(',');
    const orderRes = await fetch(`${s.url}/rest/v1/orders?select=id,order_number,table_number,order_source&id=in.(${orderInClause})`, { headers: s.headers });
    const orderRows = orderRes.ok ? await orderRes.json() : [];
    for (const o of orderRows || []) {
      orderRef[o.id] = (o.table_number != null && o.order_source === 'dine_in')
        ? `Masa ${o.table_number}`
        : (o.order_number || String(o.id).slice(-4).toUpperCase());
    }

    // Staff names (performed_by / staff_name).
    const staffIds = Array.from(new Set(rows.map(r => r.performed_by).filter(Boolean))) as string[];
    const staffName: Record<string, string> = {};
    if (staffIds.length > 0) {
      const inClause = staffIds.map(id => encodeURIComponent(id)).join(',');
      const sr = await fetch(`${s.url}/rest/v1/staff?select=id,name&id=in.(${inClause})`, { headers: s.headers });
      if (sr.ok) {
        for (const st of await sr.json()) staffName[st.id] = st.name;
      }
    }

    const exceptions = rows.map(r => ({
      id: r.id,
      action: r.action,
      order_ref: r.record_id ? (orderRef[r.record_id] || null) : null,
      reason: r.reason || null,
      staff_name: r.staff_name || (r.performed_by ? staffName[r.performed_by] || null : null),
      created_at: r.created_at,
    }));

    return NextResponse.json({ exceptions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
