import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

const PARTNER_IDS = ['bolt', 'uber_eats', 'glovo', 'wolt'] as const;
type PartnerId = (typeof PARTNER_IDS)[number];

const PARTNER_DISPLAY: Record<PartnerId, string> = {
  bolt: 'Bolt', uber_eats: 'Uber Eats', glovo: 'Glovo', wolt: 'Wolt',
};

/**
 * 2026-09-25 (owner): "1 dənə test burax, görəyim necə görünür" —
 * fire a realistic TEST order from a connected partner so the owner can see
 * the branding end-to-end (POS delivery/takeaway card, KDS ticket, BDS).
 *
 * Body: { partner: 'bolt'|..., mode: 'delivery'|'takeaway' }
 *
 * The order is a NORMAL confirmed order (kitchen items sent) tagged with
 * partner_source + external_order_id (+ partner courier for delivery). It is
 * fully cancelable through the usual POS flow — nothing special.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    const supabase = await createAuthClient();
    const body = await req.json();
    const partner = String(body.partner) as PartnerId;
    const mode = body.mode === 'takeaway' ? 'takeaway' : 'delivery';

    if (!PARTNER_IDS.includes(partner)) {
      return NextResponse.json({ error: `unknown partner: ${partner}` }, { status: 400 });
    }

    // Next sequential order number (ORD-n)
    const { data: numRows } = await supabase
      .from('orders').select('order_number').order('created_at', { ascending: false }).limit(50);
    const maxN = (numRows || []).reduce((m: number, r: any) => {
      const n = parseInt(String(r.order_number || '').replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    const orderNumber = `ORD-${maxN + 1}`;

    // Location of the operating venue (+ org — NOT NULL, no session in service-role path)
    const { data: locRows } = await supabase.from('orders').select('location_id').limit(1);
    const locationId = locRows?.[0]?.location_id || null;
    const { data: locRow } = locationId
      ? await supabase.from('locations').select('id, organization_id').eq('id', locationId).maybeSingle()
      : { data: null };

    // Two real menu items so the kitchen ticket looks real
    const { data: prods } = await supabase
      .from('products').select('id,name_az,name_en,price').eq('is_active', true).order('created_at').limit(4);
    const picked = (prods || []).slice(0, 2);
    if (picked.length === 0) {
      return NextResponse.json({ error: 'no active products to build the test order' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const externalId = `${partner.toUpperCase().replace(/_/g, '-')}-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
    const total = picked.reduce((s, p: any) => s + (Number(p.price) || 0), 0);

    const { data: order, error: oErr } = await supabase.from('orders').insert({
      order_number: orderNumber,
      location_id: locationId,
      organization_id: locRow?.organization_id || null,
      status: 'confirmed',
      kitchen_status: 'preparing',
      order_source: mode,
      customer_name: `${PARTNER_DISPLAY[partner]} Test Müştəri`,
      customer_phone: '+994 55 000 11 22',
      total_amount: total,
      partner_source: partner,
      external_order_id: externalId,
      ...(mode === 'delivery' ? {
        delivery_district: 'Nərimanov',
        delivery_zone: 'Bakı Mərkəz',
        delivery_street: 'Azərbaycan prospekti 54',
        delivery_building: '3',
         courier_name: 'Elvin Məmmədov',
         courier_phone: '+994 50 123 45 67',
         courier_assigned_at: now,
         courier_eta: '12–15 dəq', // simulated partner ETA (real value comes with the Bolt webhook phase)
      } : {}),
    }).select().single();
    if (oErr || !order) throw oErr || new Error('order insert failed');

    const items = picked.map((p: any) => ({
      order_id: order.id,
      product_id: p.id,
      product_name: p.name_az || p.name_en || 'item',
      quantity: 1,
      unit_price: p.price,
      total_price: p.price,
      kitchen_status: 'sent',
    }));
    const { error: iErr } = await supabase.from('order_items').insert(items);
    if (iErr) throw iErr;

    // Audit trail (never a state transition — plain insert, nothing frozen).
    // Isolated: a failed audit row must not 500 an already-created order.
    try {
      await supabase.from('audit_logs_canonical').insert({
        action: 'partner_test_order',
        entity_type: 'order',
        entity_id: order.id,
        actor_id: auth.user?.id || null,
        actor_name: 'pos-test',
        metadata: { partner, mode, external_order_id: externalId },
      });
    } catch { /* audit is best-effort here */ }

    return NextResponse.json({ success: true, order_id: order.id, order_number: orderNumber, external_order_id: externalId, partner, mode });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
