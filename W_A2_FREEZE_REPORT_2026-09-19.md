# W-A2 FREEZE REPORT — ADD-TO-CHECK + QR PRICE HARDENING (2026-09-19)

**Status:** FROZEN (backend/logic/schema). **UI = HARD STOP** — menu "continue your
check" flow is designed together with the user (permanent rule, HANDOVER §6).
**Plan/decisions:** `W_A2_PLAN.md` (D12–D17). **Gate:** `.w-a2-gate.cjs` (14/14, zero residue).

---

## 1. What shipped

| # | Surface | Change |
|---|---|---|
| D12 | `orders.qr_check_token_hash` (text, partial index) | Add-to-check credential. `randomBytes(32).hex` minted in the create route; **SHA-256 hash stored**, raw token returned once; DB leak cannot authenticate adds. |
| D13 | QR create route + `qr_add_items` | **Server-sourced prices** — client `unit_price` ignored on both paths (frozen G3 create took client price → underpay gap; now same contract as `add_item_atomic`). Missing product → 400, whole request fails. |
| D14 | New RPC `qr_add_items(p_token_hash, p_table_number, p_items, p_idempotency_key)` | service_role-only. `FOR UPDATE` by hash → table match → finalized reject (paid/closed/cancelled/refunded/partially_refunded/voided) → per-item server price + qty 1..99 + per-item idempotency (`key:i`) → INSERT `order_items` (kitchen_status='pending') → incremental total → `{success, order_id, status, items_added, total}`. |
| D16 | Total semantics | **Incremental mirror of frozen `add_item_atomic`** (`total_amount += item totals, version+1, updated_at=now()`) + per-item `log_order_event('item_added', performed_by NULL)`. First draft's `calculate_order_total_v3(id,true,false)` REJECTED on live evidence: `settings` row 1 has `vat_percentage=18.00` — the SSOT call would have re-applied VAT to the whole subtotal while QR create defaults to a raw total (18% jump on every add). Fixed before any use (Rule 7). |
| D17 | QR create route (app layer only) | **Latent production defect fixed:** before the orders INSERT, released floors (`empty`/`cleaning`) are flipped to `occupied` (pointer untouched; `validate_table_order_pointer` allows occupied+NULL pointer — verified). Item-insert-failure rollback restores `empty`. No schema/trigger change — triggers stay FROZEN. |
| — | New route `POST /api/orders/qr/add` | Thin: 15/min IP rate limit, shape validation (1..20 items, uuid, qty 1..99), single RPC call, error map (token→404 no-existence-leak, finalized→409, bad item→400). |
| — | Migration `20260919000002_w_a2_check_token.sql` (+rollback) | Applied to live; re-applied idempotently after the D16 function fix (verified: no `calculate_order_total_v3` call left in the live fn). |

**D17 evidence chain (live, 2026-09-19):**
1. Gate repro: orders INSERT on a `empty` floor → `TABLE_OPEN_ORDERS` 500.
2. Full stack: `trg_orders_sync_table_floors` → `sync_table_order_aggregates` UPDATE
   on the floor row → `table_release_guard` RAISE while `NEW.status IN ('empty','cleaning')`
   and an open order exists (the sync UPDATE keeps the released status; F-05's
   guard-safe pointer logic only protects the pointer, not the aggregate UPDATE).
3. `table_floors` live (non-archived): **27 empty / 4 occupied / 2 reserved** — the
   broken case is the normal first-order case. W-A1's route E2E stayed green only
   because its fixture pre-set the floor `'occupied'`.
4. Fix verified: W2-01 (create on EMPTY table → 200, floor `occupied/<order>`) and
   W2-12 (guest create on EMPTY table) both pass post-fix; F gate 35/35.

**FOLLOW-UPs (documented, not W-A2 scope):**
- QR starts are currently allowed on `reserved`/`out_of_service` floors (pre-existing behavior, unchanged by D17) — product decision for a later wave.
- A failed create (items INSERT failure) now cancels the order AND restores `empty`; a create that succeeds is never rolled back (order stays active) — consistent with the frozen rollback branch.
- `to_char(numeric, '0.00')` renders `#.##` through the pooler in this environment (verified: catalog fn only, no shadowing; `round(x,2)::text` works) — harnesses must avoid the `'0'` pattern.

## 2. Verification (all live, 2026-09-19)

| Unit | Result | Evidence |
|---|---|---|
| `.w-a2-gate.cjs` (route-level E2E, real HTTP via :3000) | **14/14, residue 0** | W2-01 create-on-empty+token+pointer · W2-02 D13 create underpay-proof (0.01 sent → 100.00 stored, total 200.00 raw) · W2-03 add 200→350.00 (D16 incremental, version+1, DB price) · W2-04 spine (order_events item_added +1, kds_ticket outbox +≥1) · W2-05 idempotent replay (0 added, totals/version unchanged) · W2-06 wrong token 404 · W2-07 wrong table 404 · W2-08 shape 400s · W2-09 one order per table · W2-10 pay 350 → paid/350.00/1 op · W2-11 add-after-paid 409 · W2-12 guest link + customer unchanged by add · W2-13 financial baselines unchanged · W2-14 teardown 0/0/0/0/0/0/0 |
| Typecheck (`tsc --noEmit`, excl. pre-broken `__tests__` jest-types) | clean | 3 W-A2 type errors found & fixed during implementation |
| **O** (orders surface; qr create route changed) | **38/38** | `.w-a2-audit/reflow/o_reflog.log` |
| **W-A1** (guest channel; qr create route changed) | **18/18** | gate run 2026-09-19 (idempotent, zero residue) |
| **F** (floors/tables; D17 flips floor state) | **35/35** | `.w-a2-audit/reflow/f_reflog.log` |

**Narrowed-reflow justification (Rule 6/11):** W-A2 touched (a) the qr create route,
(b) one new route, (c) one new RPC + additive column/index, (d) `order_items`
INSERTs only via the frozen trigger surface (no trigger changed). Therefore the
gates exercising those surfaces — O, W-A1, F — were re-run. P-1..P-6/K are
untouched surfaces (their frozen gates remain as verified in the W-A1 reflow).
P-7 half-2 + P-8 remain **externally blocked** by Supabase incident 6q5902p2xd9f
(re-run commands unchanged, see W-A1 freeze report §4).

## 3. Security chain (Rule 10)

UI (localStorage checkToken) → route (shape + 15/min IP limit, no staff token —
public guest channel by design, same model as G3 create) → `qr_add_items`
(`FOR UPDATE`, token hash + table match, finalized reject, server price,
per-item idempotency) → `order_items` frozen triggers (money lock, state machine,
KDS outbox, kitchen status sync) → `idx_orders_active_table` (no 2nd order) →
audit (`log_order_event('item_added')`) → no existence leak (wrong token = 404
`Check not found`). RPC EXECUTE = `{postgres, service_role}` only (anon/
authenticated revoked; verified live).

## 4. Outstanding (unchanged from W-A1)

1. `node .p7-gate.cjs && P7_HALF=2 node .p7-gate.cjs` → expect 16 accounted, 0 REAL-RISK.
2. `P8_ALL=1 node .p8-gate.cjs` → expect 2 PASS + 6 EXPECTED-CONFLICT.
   (Both blocked by the vendor-documented Supabase API Gateway degradation.)

## 5. Commit scope (explicit pathspec)

`W_A2_PLAN.md` · `W_A2_FREEZE_REPORT_2026-09-19.md` · `.w-a2-gate.cjs` ·
`.w-a2-result.json` · `.w-a2-audit/` ·
`supabase/migrations/20260919000002_w_a2_check_token.sql` (+`_rollback.sql`) ·
`artifacts/saito-admin/src/app/api/orders/qr/route.ts` ·
`artifacts/saito-admin/src/app/api/orders/qr/add/route.ts` ·
`HANDOVER.md` · `MASTER_FEATURE_MAP.md` · `.f-gate-report.json` (F re-run artifact).
