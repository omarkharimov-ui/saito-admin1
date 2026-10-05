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

    const parsedOrders: any = await res.json();
    const rawOrders: any[] = Array.isArray(parsedOrders) ? parsedOrders : [];
    const rawPageLength = rawOrders.length;
    
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

    // 13f (owner: "merged odeniş merged olaraq DB-də saxlanılsın"): a merged
    // table group paid in ONE payment action has every member order's
    // order_payments rows stamped with the SAME split_group_id. Collapse them
    // into ONE history entry here (server-side, so pagination + search stay
    // consistent): the earliest-paid member becomes the PRIMARY and carries
    // `payment_group`; the other members are removed from the page.
    // Grouping is display-only and best-effort — any failure falls back to
    // the flat per-order list (never break history).
    let visibleOrders: any[] = rawOrders;
    let hiddenCount = 0;
    if (rawOrders.length > 1) {
      try {
        const ids = rawOrders.map((o: any) => o.id);
        const idSet = new Set(ids);
        const payRes = await fetch(
          `${s.url}/rest/v1/order_payments?order_id=in.(${ids.join(',')})&split_group_id=not.is.null&is_refund=eq.false&select=order_id,split_group_id`,
          { headers: s.headers }
        );
        if (payRes.ok) {
          const payRows: any[] = await payRes.json();
          const byGroup = new Map<string, Set<string>>();
          for (const r of payRows) {
            if (!idSet.has(r.order_id) || !r.split_group_id) continue;
            if (!byGroup.has(r.split_group_id)) byGroup.set(r.split_group_id, new Set());
            byGroup.get(r.split_group_id)!.add(r.order_id);
          }
          const hiddenIds = new Set<string>();
          for (const [gid, memberIds] of byGroup) {
            if (memberIds.size < 2) continue; // single-order payments: unchanged
            const members = rawOrders
              .filter((o: any) => memberIds.has(o.id))
              .sort((a: any, b: any) =>
                String(a.paid_at || a.created_at).localeCompare(String(b.paid_at || b.created_at)));
            const primary = members[0];
            for (const m of members) if (m.id !== primary.id) hiddenIds.add(m.id);
            primary.payment_group = {
              id: gid,
              member_count: members.length,
              member_order_ids: members.map((m: any) => m.id),
              // 13f (E2E r30 catch): after a merge the CHILD order's
              // table_number is rewritten to the PARENT table — the member's
              // ORIGINAL table lives in merged_from_table. Without this the
              // group rendered "Masa 401 + 401" instead of "Masa 90 + 401".
              member_tables: members.map((m: any) => m.merged_from_table ?? m.table_number).filter((n: any) => n != null),
              member_totals: members.map((m: any) => Number(m.total_amount) || 0),
              member_search: members
                .map((m: any) => (m.order_items || []).map((i: any) => i.product_name || '').join(' '))
                .join(' ').toLowerCase(),
            };
          }
          if (hiddenIds.size > 0) {
            visibleOrders = rawOrders.filter((o: any) => !hiddenIds.has(o.id));
            hiddenCount = rawOrders.length - visibleOrders.length;
          }
        }
      } catch (e) {
        console.error('[history] group collapse failed (flat fallback):', e);
      }
    }

    return NextResponse.json({
      orders: visibleOrders,
      // adjusted: hidden members would otherwise inflate the "N sifariş"
      // counter and the load-more gate (client offset follows VISIBLE rows,
      // server offset follows RAW rows — nextOffset bridges the two).
      totalCount: Math.max(0, totalCount - hiddenCount),
      nextOffset: offset + rawPageLength,
      limit,
      offset,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
