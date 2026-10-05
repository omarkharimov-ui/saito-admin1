import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { id } = await params;
    const s = svc();

    const orderRes = await fetch(
      `${s.url}/rest/v1/orders?id=eq.${id}&select=*,campaigns(name),order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,variant_id,variant_name,modifiers,special_notes,combo_group_id,is_combo_parent,parent_order_item_id,kitchen_status,served_quantity,prepared_quantity,seat_number,course,products(name_az,name_en))`,
      { headers: s.headers }
    );

    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orders[0];

    // 13f (latent bug found while wiring merged-group detail): the LIVE
    // ledger is order_payments (frozen RPC complete_payment_atomic_v2 writes
    // there); the legacy `payments` table has not received a row since
    // 2026-09-27, so every recent order's ÖDƏNİŞLƏR section rendered EMPTY.
    // Read order_payments first; fall back to legacy for pre-09-27 orders.
    const opRes = await fetch(
      `${s.url}/rest/v1/order_payments?order_id=eq.${id}&order=created_at.asc`,
      { headers: s.headers }
    );
    let payments: any[] = opRes.ok ? await opRes.json() : [];
    if (!Array.isArray(payments) || payments.length === 0) {
      const paymentsRes = await fetch(
        `${s.url}/rest/v1/payments?order_id=eq.${id}&order=created_at.asc`,
        { headers: s.headers }
      );
      payments = paymentsRes.ok ? await paymentsRes.json() : [];
    }

    // AUDIT 2026-09-23 (root cause of the "weak timeline"): order-scoped
    // audit rows are written with the order id in `record_id` (table_name
    // = 'orders'), while the `order_id` column is NULL on all 440 rows.
    // Querying order_id only → the timeline was ALWAYS empty.
    // AUDIT 2026-09-28 (E2E-verified fix): the old `?or(order_id.eq.X,
    // record_id.eq.X)` template was MISSING THE '=' — PostgREST silently
    // ignores unknown/malformed query params, so the timeline showed the
    // GLOBAL newest 100 rows under every order (foreign dismiss/waiting
    // rows from other orders). The app's audit convention is record_id for
    // order-scoped rows, so a plain eq filter is both correct and simple.
    // (Rule: raw fetch URLs must always be `key=op.value`; or-filters need
    // `or=(...)` — supabase-js builds these correctly.)
    const auditRes = await fetch(
      `${s.url}/rest/v1/audit_logs?record_id=eq.${id}&order=created_at.asc&limit=100`,
      { headers: s.headers }
    );
    let auditLogs: any[] = auditRes.ok ? await auditRes.json() : [];

    // Staff attribution: rows carry performed_by (staff id) with staff_name
    // usually NULL — resolve names server-side in one batch query.
    try {
      const staffIds = Array.from(new Set(
        auditLogs.map(l => l.performed_by).filter((x: any) => x && String(x).length > 8)
      )) as string[];
      if (staffIds.length > 0) {
        const inClause = staffIds.map(x => `eq.${x}`).join(',');
        const staffRes = await fetch(
          `${s.url}/rest/v1/staff?select=id,name&id=in.(${inClause})`,
          { headers: s.headers }
        );
        if (staffRes.ok) {
          const staff = await staffRes.json();
          const nameById: Record<string, string> = {};
          for (const st of staff as any[]) nameById[st.id] = st.name;
          auditLogs = auditLogs.map(l => ({
            ...l,
            staff_name: l.staff_name || nameById[l.performed_by] || null,
          }));
        }
      }
    } catch { /* keep raw logs */ }

    // 13f: merged payment group — if this order's ledger rows carry a
    // split_group_id shared with other orders, expand the whole group so
    // Tarixçə can show ONE merged detail (every member's items/payments/audit).
    let group: any = null;
    const groupIds = Array.from(new Set(payments.map((p: any) => p.split_group_id).filter(Boolean)));
    if (groupIds.length > 0) {
      try {
        const sibRes = await fetch(
          `${s.url}/rest/v1/order_payments?split_group_id=in.(${groupIds.join(',')})&order_id=neq.${id}&is_refund=eq.false&select=order_id`,
          { headers: s.headers }
        );
        if (sibRes.ok) {
          const sibRows: any[] = await sibRes.json();
          const sibIds = Array.from(new Set(sibRows.map((r: any) => r.order_id))).slice(0, 10);
          if (sibIds.length > 0) {
            const gid = groupIds[0];
            const inCsv = [id, ...sibIds].join(',');
            const [membersRes, membersPayRes, membersAuditRes] = await Promise.all([
              fetch(`${s.url}/rest/v1/orders?id=in.(${inCsv})&select=*,campaigns(name),order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,variant_id,variant_name,modifiers,special_notes,combo_group_id,kitchen_status,served_quantity,prepared_quantity,products(name_az,name_en))`, { headers: s.headers }),
              fetch(`${s.url}/rest/v1/order_payments?order_id=in.(${inCsv})&order=created_at.asc`, { headers: s.headers }),
              fetch(`${s.url}/rest/v1/audit_logs?record_id=in.(${inCsv})&order=created_at.asc&limit=300`, { headers: s.headers }),
            ]);
            const memberOrders: any[] = membersRes.ok ? await membersRes.json() : [];
            const memberPays: any[] = membersPayRes.ok ? await membersPayRes.json() : [];
            const memberAudits: any[] = membersAuditRes.ok ? await membersAuditRes.json() : [];
            // Same staff-name resolution as the primary timeline.
            let resolvedMemberAudits = memberAudits;
            try {
              const memberStaffIds = Array.from(new Set(
                memberAudits.map((l: any) => l.performed_by).filter((x: any) => x && String(x).length > 8)
              )) as string[];
              if (memberStaffIds.length > 0) {
                const staffRes = await fetch(
                  `${s.url}/rest/v1/staff?select=id,name&id=in.(${memberStaffIds.map(x => `eq.${x}`).join(',')})`,
                  { headers: s.headers }
                );
                if (staffRes.ok) {
                  const staff = await staffRes.json();
                  const nameById: Record<string, string> = {};
                  for (const st of staff as any[]) nameById[st.id] = st.name;
                  resolvedMemberAudits = memberAudits.map((l: any) => ({
                    ...l,
                    staff_name: l.staff_name || nameById[l.performed_by] || null,
                  }));
                }
              }
            } catch { /* keep raw */ }
            const members = memberOrders
              .sort((a: any, b: any) => String(a.paid_at || a.created_at).localeCompare(String(b.paid_at || b.created_at)))
              .map((mo: any) => ({
                order: mo,
                payments: memberPays.filter((p: any) => p.order_id === mo.id),
                auditLogs: resolvedMemberAudits.filter((l: any) => l.record_id === mo.id),
              }));
            if (members.length > 1) {
              group = { split_group_id: gid, members };
            }
          }
        }
      } catch (e) {
        console.error('[history detail] group expand failed (single-order fallback):', e);
      }
    }

    return NextResponse.json({ order, payments, auditLogs, group });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
