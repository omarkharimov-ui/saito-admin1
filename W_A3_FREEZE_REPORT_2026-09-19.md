# W-A3 FREEZE REPORT — CUSTOMER TIMELINE (backend) (2026-09-19)

**Status:** FROZEN (backend). **UI = HARD STOP** — timeline placement/look is
designed together with the user (permanent rule). Plan/decisions: `W_A3_PLAN.md`
(T1–T10). Gate: `.w-a3-gate.cjs` (9/9, zero residue).

## 1. What shipped

| # | Surface | Change |
|---|---|---|
| T1 | New read-only route `GET /api/customers/[id]/timeline?limit=50` (max 100) | Staff `requireAuth` (identical house pattern to `/api/customers`; no `customers.view` permission exists in the frozen P-1 registry — adding one = separate ratified decision, FOLLOW-UP). Next 16 async-`params` handled correctly (`await params`). |
| — | Migration `20260919000004_w_a3_customer_timeline.sql` (+rollback) | One new READ-ONLY SQL function `get_customer_timeline(uuid, int)`; EXECUTE = `{postgres, service_role}` only. Applied to live, verified (col-less: pure SELECT aggregation, no schema change). |
| T2 | Stats SSOT | All stats computed live from `orders` (visits exclude cancelled/voided; `total_spent` = Σ paid_amount; avg; first/last visit; items ordered). **Live evidence:** `customers.total_visits/total_spent/last_order_at` are DEAD denormalized columns — no trigger writes them (pg_trigger scan: none on `customers`; only `guest_link_customer` inserts 0s). They are not exposed; MFM §6 "profile" row corrected (table has no birthday/email/notes). |
| T3/T4 | `orders[]` (newest-first, items + payments embedded) and `favorites` (top 10 by Σ qty, cancelled excluded) | Serves "order/visit history + favorite items" (MFM §6 🟡→backend ✅). |
| T5 | Loyalty NOT in the payload | UI already calls frozen `/api/orders/loyalty?customer_id=`; no duplication. |

## 2. Evidence

| Unit | Result | Evidence |
|---|---|---|
| `.w-a3-gate.cjs` (route-level E2E, real HTTP via :3000) | **9/9, residue 0** | W3-01 shape + dead-column proof (bogus 999/999999 on the customer row NOT exposed) · W3-02 stats exact (visits=3, spent=200.00, avg=91.67, items=7, first/last = correct orders; cancelled excluded) · W3-03 orders[] newest-first with items+payments embedded (card 150 captured) · W3-04 favorites ranked (W3_P1:4 > W3_P2:3) · W3-05 limit=1 clamp → newest only, stats unaffected · W3-06 second-customer isolation · W3-07 404 unknown id / 400 bad id / 401 no session · W3-08 read-only delta proof (0 new audit/op-log/outbox/order-event rows) · W3-09 teardown `0/0/0/0/0/0` |
| Typecheck (`tsc --noEmit`, excl. pre-broken `__tests__`) | clean | — |
| **W-A1** reflow (customer-channel surface, T9) | **18/18** | gate run 2026-09-19 (idempotent, zero residue) |

**Narrowed-reflow justification (Rule 6/11):** W-A3 is additive read-only — one
new SQL function (no schema change), one new route; no frozen route, RPC,
trigger, or table touched. Only the adjacent customer-channel gate (W-A1) was
re-run as a sanity check. Full chain was re-verified green at the W-A2/D18
freeze (O 38/38, F 35/35, W-A1 18/18).

## 3. Security chain (Rule 10)

Staff session → `requireAuth` (route) → service_role client → server-side fixed
RPC (no client-composed SQL) → pure SELECT aggregation → **read-only** (no
writes of any kind — proven by W3-08 delta check). Unknown customer → 404
(no existence leak beyond what the staff list route already exposes).

## 4. Environment/infra findings (documented, no action)

- **Next 16 async `params` — FIXED (same day):** full-surface audit (Rule 1,
  not the summary): of 37 dynamic route files, exactly 3 used the broken sync
  pattern — `stock/returns/[id]` (3 handlers), `stock/counts/[id]` (3),
  `stock/counts/[id]/items` (2) = 8 handlers; all others already use
  `Promise<{ id }>`. Fixed with the minimal `await params` change. Verified by
  `.dyn-params-probe.cjs` (4/4, self-cleaning fixture): `counts/{id}/items`
  → 200 `[]`, `returns/{id}` + `counts/{id}` → 500 **PGRST116**
  ("Cannot coerce the result to a single JSON object" — the id filter reached
  PostgREST and returned 0 rows on the empty tables; broken params fail
  client-side or with PGRST204), unauth → 401. tsc clean. The stock tables
  (`supplier_returns`, `stock_counts`, `stock_count_items`) are empty in prod —
  the breakage was latent (feature unused; no HTTP gate covered these routes).
- Pooler `to_char(numeric,'0.00')` remains broken (`#.##`) — harnesses keep
  using `round(x,2)::text` / epoch-ms comparisons.

## 5. OUT OF SCOPE / FOLLOW-UP (not shipped)

- `customers.view` permission (needs ratified P-1 registry migration + role seeding).
- Dead-column cleanup (`total_visits/total_spent/last_order_at` drop or backfill) = P-9 hygiene class.
- birthday/email/notes profile fields = product decision (MFM corrected).
- **UI (HARD STOP):** timeline placement options on the table — (a) ActionSheet customer-tab extension, (b) dedicated `/admin/customers` page, (c) drawer from POS table view. Backend payload serves any of them.

## 6. Commit scope

`W_A3_PLAN.md` · `W_A3_FREEZE_REPORT_2026-09-19.md` · `.w-a3-gate.cjs` ·
`.w-a3-result.json` · `supabase/migrations/20260919000004_w_a3_customer_timeline.sql`
(+`_rollback.sql`) · `artifacts/saito-admin/src/app/api/customers/[id]/timeline/route.ts` ·
`HANDOVER.md` · `MASTER_FEATURE_MAP.md`.
