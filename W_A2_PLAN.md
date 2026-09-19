# W-A2 PLAN — ADD-TO-CHECK (active QR order) + D13 PRICE HARDENING

**Wave:** A2 (user-ratified execution order 2026-09-19, item #1)
**Boundary opened:** D11 premise ("no add-to-check in W-A1") — ratified by user execution order.
**Method:** 12-rule technical-manager loop (INSPECT → RECONCILE → RISKS → DECIDE → …).

## 1. Evidence (directly inspected, 2026-09-19)

- `qr/route.ts` (206 lines, W-A1 state): table lookup (server-trusted loc/org) → optional
  `guest_link_customer` → orders INSERT (status=confirmed, order_type=qr_order) →
  order_items INSERT **with client `unit_price`** (lines 153–155) →
  `calculate_order_total_v3` (SSOT total) → table_floors PATCH (occupied, total).
- `add_item_atomic` (frozen, P-7): `set_session_staff` → `FOR UPDATE` on order →
  finalized reject (`paid/closed/cancelled`) → `authorize(orders.create, location)` →
  idempotency dedupe on `order_items.idempotency_key` → **server-sourced product price**
  (`PRODUCT_NOT_FOUND` on missing).
- `qr/status/route.ts` (W-A1): **tokenless** table-number read (IP rate-limited) — no
  customer-held credential exists today.
- `idx_orders_active_table`: UNIQUE(table_number) WHERE active-status — stays.
- Item-level kitchen/outbox events fire on `order_items` INSERT via DB triggers
  (path-agnostic — add path inherits them).

## 2. Decision log

| # | Decision | Rationale / evidence |
|---|---|---|
| D12 | **check_token** for add-to-check: crypto-random 32B hex, **SHA-256 hash stored** in `orders.qr_check_token_hash`, raw token returned **once** in the create response; menu UI keeps it in localStorage. Add route: `POST /api/orders/qr/add { table_number, check_token, items[] }` → hash lookup + table match. | No credential exists today (status route tokenless). Table-number-only add = anyone who knows the number can load someone's check (direct monetary harm). Hash storage = DB leak doesn't authenticate. Rotation: NOT in W-A2 (FOLLOW-UP) — token is valid while the order is active; order payment/cancel leaves it dangling (lookup fails on finalized). |
| D13 | **Server-sourced price for ALL QR items** (create + add): product lookup in DB; `unit_price` := `products.price`; missing product → 400 `PRODUCT_NOT_FOUND` (client price ignored entirely). | FROZEN G3 contract takes client `unit_price` (route lines 153–155) while `add_item_atomic` (staff path) uses server price — the SSOT comment ("recompute total server-side") shows the intent was server pricing; item-level client price is a monetary defect (underpay attack). Strictly strengthens the frozen intent; legitimate menu UI already sends real menu prices (no behavior change for honest clients). |
| D14 | Add path = **new RPC `qr_add_items(p_token_hash, p_items jsonb, p_idempotency_key)`** (service_role-only), NOT a route-level REST loop. | Race correctness (Rule 11): pay-in-flight vs add must serialize on the order row (`FOR UPDATE`), finalized re-check under lock, per-item server price + idempotency inside one transaction. Route stays thin (shape validation + rate limit + single RPC call). Mirrors `add_item_atomic` invariants minus staff auth, plus token auth. |
| D15 | **Frozen boundary impact:** `idx_orders_active_table` unchanged (add creates no order); `add_item_atomic` unchanged (sibling RPC); G3 create response extended additively (`checkToken` field — existing clients ignore); state machine unchanged; menu UI flow = **HARD STOP (user-collaborative)**. | Rule 3/6: minimal additive surface; no compatibility hacks inside frozen code (qr route change is D13 price + D12 token minting only). |
| D16 | **Add-path total = incremental mirror of frozen `add_item_atomic`** (`total_amount += item totals, version+1, updated_at=now()`), per-item `log_order_event('item_added', performed_by NULL)`. First draft used `calculate_order_total_v3(id,true,false)` — **rejected on live evidence (2026-09-19):** `settings` row 1 has `vat_percentage=18.00`, so the SSOT call re-applied VAT to the whole subtotal while the QR create default is a raw total (`applyVat` = create-time opt-in, never persisted) — every add would jump the check total by 18%. `add_item_atomic` (frozen) does the incremental `UPDATE orders SET total_amount = COALESCE(total_amount,0)+v_total` — the add path must mirror it, not invent. | Rule 7: new evidence overrode the draft decision BEFORE any use. Live function re-applied via idempotent migration re-run; gate asserts exact totals (200 → +150 → 350, replay 350). |
| D17 | **Pre-insert floor flip (latent production defect fix):** before the orders INSERT, if the floor row is `'empty'`/`'cleaning'` the route now PATCHes it to `'occupied'` (pointer untouched); the item-insert-failure rollback restores `'empty'`. **Evidence (live, 2026-09-19):** orders INSERT → `trg_orders_sync_table_floors` → `sync_table_order_aggregates` UPDATE on the floor row → `table_release_guard` RAISEs `TABLE_OPEN_ORDERS` while `NEW.status IN ('empty','cleaning')` and an open order exists → the FIRST QR order on any free table 500s. `table_floors` live statuses: **27 empty / 4 occupied / 2 reserved** (non-archived) — i.e. the broken case is the normal one. W-A1's route E2E stayed green only because its fixture pre-set the floor `'occupied'`. `validate_table_order_pointer` allows occupied + NULL pointer (verified), so the flip is guard-safe. | Rule 7/10: frozen-surface production break discovered during W-A2 gate; fixed at the app layer (no schema change, no trigger change — triggers stay FROZEN). FOLLOW-UP (not W-A2): whether QR may start on `'reserved'`/`'out_of_service'` floors (current behavior unchanged). |

## 3. Scope (exactly what changes)

1. `supabase/migrations/20260920000001_w_a2_check_token.sql` (+rollback):
   `ALTER TABLE orders ADD COLUMN qr_check_token_hash text;`
   `CREATE INDEX idx_orders_qr_check_token ON orders(qr_check_token_hash) WHERE qr_check_token_hash IS NOT NULL;`
2. RPC `qr_add_items` (same migration): FOR UPDATE by hash → finalized reject →
   per-item: product lookup (server price, PRODUCT_NOT_FOUND), qty>0, idempotency dedupe
   (per-item key = `${p_idempotency_key}:${n}`), INSERT order_items (kitchen_status=pending,
   same columns as QR create) → `calculate_order_total_v3(p_apply_vat=true, p_apply_service=false)`
   → return `{success, total, items_added, order_id, status}`. Grants: service_role only.
3. `qr/route.ts`: mint token (crypto.randomBytes(32).hex → sha256 → store in orders INSERT),
   D13 server-price fetch (products by id, before items INSERT), response += `checkToken`.
4. New `src/app/api/orders/qr/add/route.ts`: shape validation (1..N items, product_id uuid,
   qty 1..99), D6-style IP+token rate limit (15/min), single RPC call, error mapping
   (QR_CHECK_TOKEN_INVALID → 404 `Check not found` — no existence leak,
   ORDER_FINALIZED → 409, PRODUCT_NOT_FOUND → 400).
5. `.w-a2-gate.cjs` (teardown contract, zero-residue): token mint/lookup, wrong-token 404,
   token+wrong-table 404, add-to-active success + total recalc + server price (client price
   ignored — proof: send 0.01, item gets DB price), idempotent replay (1 item, duplicate=true),
   add-after-paid 409 (finalized), kitchen event present, no 2nd order (index intact),
   customer unchanged, residue=0.
6. Menu UI: "continue your check" — **HARD STOP with user** (after backend freeze).

## 4. Verification plan

- `.w-a2-gate.cjs` GREEN (residue 0).
- Route E2E add (real HTTP) incl. underpay-attempt proof.
- Narrowed reflow: **O** (QR surface) + **W-A1** (guest channel) + **F** (order state
  machine/floors). P-5/P-6 only if `order_items` trigger surface changes (it does not —
  additive column + sibling RPC). P-7 half-2/P-8 remain vendor-blocked (unchanged).
- Then freeze report + commit + **UI hard stop**.
