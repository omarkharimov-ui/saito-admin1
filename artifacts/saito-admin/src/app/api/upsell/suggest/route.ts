import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// Wave B #3 (v2) — stateful upsell engine. ONE offer at a time.
//
// POST {
//   product_ids: string[],          // current cart product set (order: any)
//   order_id?: string,              // order in progress (stateful mode)
//   client_excluded?: string[]      // client-side guard (added-via-card ids)
// }
//
// → { offer: Offer|null, offer_id: string|null, reason?: string, budget?: {...} }
//   Offer = { product_id, name, price, discount_price, image_url, category_name,
//             offer_type: 'complement'|'beverage'|'generic', ref_name?, pct? }
//
// OFFER CONTRACT (ratified 2026-09-21 — "ən relevant olan bir şeyi, bir dəfə,
// düzgün anda"):
//   • budget per order: MAX 2 shown, MAX 1 accepted (acceptance never chains)
//   • dismissed candidate: never re-shown for this order + 120s engine
//     cooldown (cart-set change lifts it early)
//   • unresolved 'shown' + identical cart snapshot → SAME offer resumed
//     (idempotent re-fetch while the card is on screen — no double count)
//   • candidates: 90-day real history (complement % / beverage gap / generic),
//     active + in-stock, not in cart, price jump ≤ 2.5× max cart price,
//     complement evidence ≥ 15%
//   • no order_id → stateless mode (fresh draft): same engine, no budget,
//     no history (client guard covers anti-nag until the order exists)
//
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// upsell_offers (history) + suggest_addons_v2() RPC.
const DISMISS_COOLDOWN_MS = 120_000;
const MAX_SHOWN = 2;
const MAX_ACCEPTED = 1;
const ORG_ID = '00000000-0000-0000-0000-000000000001'; // house single org (see gates)

const svc = () => ({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});
const svcHeaders = (key: string) => ({ 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' });
const normSet = (ids: string[]) => [...new Set(ids.filter(Boolean))].sort().join(',');

async function readHistory(url: string, key: string, orderId: string) {
  const res = await fetch(
    `${url}/rest/v1/upsell_offers?order_id=eq.${orderId}&select=id,candidate_product_id,offer_type,evidence_pct,cart_snapshot,outcome,offered_at,resolved_at&order=offered_at.desc&limit=20`,
    { headers: svcHeaders(key) }
  );
  if (!res.ok) throw new Error(`history read failed: ${res.status}`);
  return (await res.json()) as any[];
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const productIds = Array.isArray(body.product_ids)
      ? ((body.product_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x !== '').slice(0, 50))
      : [];
    const orderId = typeof body.order_id === 'string' && body.order_id ? body.order_id : null;
    const clientExcluded = Array.isArray(body.client_excluded)
      ? ((body.client_excluded as unknown[]).filter((x): x is string => typeof x === 'string' && x !== '').slice(0, 50))
      : [];

    const { url, key } = svc();
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    if (productIds.length === 0) return NextResponse.json({ offer: null, offer_id: null, reason: 'empty_cart' });

    const snapshot = normSet(productIds);

    // ── STATEFUL mode (order in progress) ─────────────────────────────────
    if (orderId) {
      const rows = await readHistory(url, key, orderId);
      const shownCount = rows.length;
      const acceptedCount = rows.filter(r => r.outcome === 'accepted').length;
      const excluded = [...new Set([...rows.map(r => r.candidate_product_id), ...clientExcluded])];
      const last = rows[0] || null;

      // Resume: the same offer is still on screen (unresolved, same snapshot).
      if (last && last.outcome === 'shown' && last.cart_snapshot === snapshot) {
        const p = await fetch(`${url}/rest/v1/products?id=eq.${last.candidate_product_id}&select=id,name,name_az,price,discount_price,image_url,category_id`, { headers: svcHeaders(key) });
        const parr = p.ok ? await p.json() : [];
        const catId = parr[0]?.category_id;
        const cat = catId ? await (await fetch(`${url}/rest/v1/categories?id=eq.${catId}&select=name`, { headers: svcHeaders(key) })).json() : [];
        const prod = parr[0];
        if (prod) {
          return NextResponse.json({
            offer: {
              product_id: prod.id, name: prod.name_az || prod.name, price: prod.price,
              discount_price: prod.discount_price, image_url: prod.image_url,
              category_name: cat[0]?.name || null, offer_type: last.offer_type,
              ref_name: null, pct: last.evidence_pct ?? null,
            },
            offer_id: last.id, resumed: true,
            budget: { shown: shownCount, accepted: acceptedCount },
          });
        }
      }

      // Budget: the order is done with offers.
      if (shownCount >= MAX_SHOWN || acceptedCount >= MAX_ACCEPTED) {
        return NextResponse.json({ offer: null, offer_id: null, reason: 'budget', budget: { shown: shownCount, accepted: acceptedCount } });
      }

      // Cooldown after dismiss (cart-state change already lifted it — we got
      // here with a different snapshot only if the caller sent a changed set).
      if (last && last.outcome === 'dismissed') {
        const resolvedAt = last.resolved_at ? Date.parse(last.resolved_at) : 0;
        const sameSnapshot = last.cart_snapshot === snapshot;
        if (sameSnapshot && Date.now() - resolvedAt < DISMISS_COOLDOWN_MS) {
          return NextResponse.json({ offer: null, offer_id: null, reason: 'cooldown_after_dismiss' });
        }
      }

      const res = await fetch(`${url}/rest/v1/rpc/suggest_addons_v2`, {
        method: 'POST',
        headers: svcHeaders(key),
        body: JSON.stringify({ p_cart: productIds, p_limit: 6, p_excluded: excluded, p_max_price_ratio: 2.5, p_min_co_pct: 15 }),
      });
      if (!res.ok) return NextResponse.json({ error: `Suggest failed: ${await res.text()}` }, { status: 500 });
      const list = (await res.json()) as any[];
      const top = Array.isArray(list) ? list[0] : null;
      if (!top) return NextResponse.json({ offer: null, offer_id: null, reason: 'no_candidates', budget: { shown: shownCount, accepted: acceptedCount } });

      const ins = await fetch(`${url}/rest/v1/upsell_offers`, {
        method: 'POST',
        headers: { ...svcHeaders(key), Prefer: 'return=representation' },
        body: JSON.stringify({
          order_id: orderId,
          candidate_product_id: top.product_id,
          offer_type: top.offer_type || 'generic',
          evidence_pct: top.pct ?? null,
          cart_snapshot: snapshot,
          outcome: 'shown',
          organization_id: ORG_ID,
        }),
      });
      if (!ins.ok) return NextResponse.json({ error: `Offer record failed: ${await ins.text()}` }, { status: 500 });
      const row = await ins.json();
      const [created] = Array.isArray(row) ? row : [row];

      return NextResponse.json({
        offer: {
          product_id: top.product_id, name: top.name, price: top.price,
          discount_price: top.discount_price, image_url: top.image_url,
          category_name: top.category_name, offer_type: top.offer_type,
          ref_name: top.ref_name ?? null, pct: top.pct ?? null,
        },
        offer_id: created?.id ?? null,
        budget: { shown: shownCount + 1, accepted: acceptedCount },
      });
    }

    // ── Stateless mode (fresh draft, no order row yet) ────────────────────
    const res = await fetch(`${url}/rest/v1/rpc/suggest_addons_v2`, {
      method: 'POST',
      headers: svcHeaders(key),
      body: JSON.stringify({ p_cart: productIds, p_limit: 6, p_excluded: clientExcluded, p_max_price_ratio: 2.5, p_min_co_pct: 15 }),
    });
    if (!res.ok) return NextResponse.json({ error: `Suggest failed: ${await res.text()}` }, { status: 500 });
    const list = (await res.json()) as any[];
    const top = Array.isArray(list) ? list[0] : null;
    return NextResponse.json({
      offer: top || null,
      offer_id: null,
      reason: top ? undefined : 'no_candidates',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
