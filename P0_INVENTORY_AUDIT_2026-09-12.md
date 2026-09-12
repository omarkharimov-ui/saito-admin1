# P-0 INVENTORY AUDIT — PAYMENTS DOMAIN (LIVE SUPABASE)

**Date:** 2026-09-12 · **Source:** LIVE database `jbxmlnsicbfkbsatnoej` via service_role (PostgREST API + live row data). **NOT** the repo SQL files (per standing instruction).
**Scope:** Handover §5.2 **P-0** — every payment fn/route/table/trigger + permission matrix + audit/outbox.
**Method:** live OpenAPI schema (171 tables / 344 RPCs), live row counts & value distributions, role-permission catalog, app route-gate source check.

---

## 1. LIVE DB SURFACE (totals)

| Item | Count |
|---|---|
| Tables (+views) exposed to service_role | **171** |
| RPC functions exposed | **344** |
| Live `orders` | 707 (paid 315 · closed 90 · cancelled 295 · confirmed 6 · served 1) |
| Live `shifts` | 94 (all `CLOSED` — E/S 045 invariant holds) |
| Live `outbox_events` | 2,237 (all `completed` — no stuck events) |
| Live `audit_logs_canonical` | 264 rows · `audit_logs` 257 rows |

## 2. PAYMENT DOMAIN — TABLES (live, with row counts)

| Table | Rows | Key columns | Notes |
|---|---|---|---|
| **`order_payments`** (ACTIVE) | **68** | amount, method, payment_method, status, transaction_id, split_group_id, is_partial, is_refund, reference_order_id, idempotency_key, correlation_id, performed_by | Current SSOT write target of `complete_payment_atomic_v2` |
| `payments` (LEGACY) | **2** | order_id, payment_method, amount, status, provider, idempotency_key, split_group_id | Superseded; both rows are Aug-26/27 `is_partial` (1 pending, 1 captured). **Duplicate of order_payments — must be decided: archive or drop (append-only: archive preferred)** |
| `payment_methods` | 9 | key, is_active, allows_split/refund/tip, requires_authorization, min/max_amount | **All 9 active; `requires_authorization=false` everywhere** — no authorization-vs-capture distinction in config |
| `payment_refunds` | **0** | payment_id, amount, status, requires_approval, provider_refund_id, approved_by | **Completely empty** — refund path writes `order_payments.is_refund`, not this table |
| `payment_attempts` | 2 | attempt_number, status, provider_response, provider_error | 1 pending / 1 captured |
| `payment_idempotency_keys` | ~5+ | key, order_id, amount, status, result | Keys format `pos:{order_id}:{client_key}` — all `completed` |
| `cash_drawer_sessions` | 6 | opening/closing/expected_balance, difference, status, register_id, location_id, approved_by | **4 `open` / 2 `closed` — 4 open drawer sessions = P-11/P-8 candidate stuck state** |
| `cash_drawer_logs` | 1 | (new schema) | |
| `cash_drawer_log` | 57 | (legacy schema) | **Second drawer-log table (singular vs plural) — legacy duplicate, same pattern as payments/order_payments** |
| `cash_registers` | 8 cols | name, terminal_id, status, location_id | |
| `cash_reconciliations` | **0** | starting/expected/actual, over_short, status, approved_by | Empty — `create_reconciliation`/`approve_reconciliation` RPCs exist but never used live |
| `shifts` | 94 | starting_cash, expected_cash, actual_cash, difference, auto_closed*, active_role_id, status | All CLOSED ✓ |
| `tip_pools / tip_pool_contributions / tip_distributions / tip_distribution_rules / tipout_configs / tip_shortfalls` | small | | Tip-out domain (P-scope-adjacent, mostly payroll) |
| `invoices / invoice_items` | small | supplier-side (procurement), not POS revenue | **Name collision risk with POS "invoice" — keep out of P scope** |
| `loyalty_transactions / gift_card_ledger / gift_card_transactions` | small | idempotency_key, correlation_id, balance_after | Good patterns to mirror |
| `stock_transactions` | small | ingredient-level (procurement) | |
| `transaction_logs` | small | operation, status, details, snapshot | Generic |

**Payment-related RPCs (live, 52 total):**
- **Capture:** `complete_payment_atomic` (11 args — legacy, token-less), `complete_payment_atomic_v2` (14 args — **active**, adds `p_idempotency_key` + `p_cash_received`), `complete_payment_v4` (7 args — different arg shape: total/tax/service — **orphan version, no app caller found**), `process_order_payment` (11 args — legacy)
- **Refund/void/reverse:** `refund_payment_atomic`, `refund_with_inventory` (**active** — used by `/api/orders/refund` Mode 1), `saito_reverse_payment`, `void_payment_atomic` (no reason), `void_payment_atomic_v2` (+reason), `void_order_item_atomic`, `void_items_state_aware` (**active** — 2 app callers)
- **Status/webhook:** `update_payment_status` (p_new_status + provider_response — the P-10 external processor hook)
- **Recalc/reconcile:** `recalculate_order_payment_state`, `payment_reconciliation`, `payment_reports`, `get_z_report`, `create_reconciliation`, `approve_reconciliation`, `dispute_reconciliation`, `get_reconciliation_summary`, `recalculate_cash_session`
- **Drawer:** `open_cash_register`, `close_cash_register`, `close_cash_register_v2`, `reopen_cash_register`, `cash_in_atomic`, `cash_out_atomic`
- **Shift:** `open_shift`, `close_shift`, `close_shift_atomic`, `auto_clockout_staff`, shift review/swap RPCs

## 3. ACTIVE WRITE PATH (live app → live RPC) — verified in source

| Route | Gate | CSRF | Calls |
|---|---|---|---|
| `POST /api/orders/pay` | **`requirePermission('payments.create')`** ✓ | ✓ | `complete_payment_atomic_v2` (+ `auto_apply_campaigns`, open-drawer lookup) |
| `POST /api/orders/refund` | `requirePermission('payments.refund')` + `refund.approve` override check ✓ | ✓ | `refund_with_inventory` (Mode 1) / `complete_payment_atomic_v2` (Mode 2) |
| `POST /api/orders/void` | **`requireAuth()` only** ⚠ + `void.approve` PIN override | ✓ | `void_items_state_aware` |
| `POST /api/orders/complete-payment` | **`requireAuth()` only** ⚠ (legacy route) | ✓ | `complete_payment_atomic` (v1) |
| `POST /api/order-payments` | (legacy) | ? | `complete_payment_atomic` (v1) |
| `POST /api/approvals` | `staff.manage` ✓ | — | approve void/refund via `void.approve`/`refund.approve` |

**⚠ Two routes bypass the permission matrix:** `/api/orders/void` and the legacy `/api/orders/complete-payment` (+ `/api/order-payments`) use `requireAuth()` without a `payments.*`/`pos.void` check — any logged-in user (even `host`/`stock` with zero pay perms) can hit them.

## 4. PERMISSION MATRIX (live `roles` × `role_permissions`, 250 rows, no dupes)

Roles: owner, admin, manager, superadmin, cashier, waiter, host, kitchen, bartender, stock, accountant (11).

| Permission | superadmin | admin | manager | owner | cashier | waiter+ |
|---|---|---|---|---|---|---|
| pos.use | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (partial) |
| pos.payment | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **payments.create** | ✓ | ✓ | ✓ | **✗ MISSING** | ✓ | — |
| payments.refund / payments.void | ✓ | ✓ | ✓ | ✗ | ✗ | — |
| refund.approve / void.approve | ✓ | ✓ | ✓ | ✗ | ✗ | — |
| cash.open / cash.in / cash.out / cash.view | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| cash.close / cash.close.approve / cash.reopen | ✓ | ✓ | ✓ | ✗ | ✗ | — |
| pos.discount / discount.create | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| pos.void / order.void / discount.approve | ✓ | ✓ | ✓ | ✓/— | ✗ | — |
| reports.view / payroll.* | ✓ | ✓ | — | ✓ | ✗ | — |

**🚨 CRITICAL: `owner` holds only 33/65 permissions — it has `pos.use`+`pos.payment` but NOT `payments.create`, `payments.refund`, `payments.void`, `cash.*`, `refund.approve`, `void.approve`.** Since the pay route gates on `payments.create`, **an owner-role staff member is blocked from taking payments at all** (unless `staff_permission_overrides` covers them — override rows exist in schema; needs live check during P-1).

## 5. PAYMENT STATUS VALUES IN LIVE DATA

- `order_payments.status`: **`captured` (7) · `pending` (16) · NULL (45)**.
  - 45 NULL rows = pre-refactor legacy (Jul 30 – Aug 9, `method`/`reference`/`performed_by` also NULL) — schema migration artifact, same era as `payments` legacy rows.
  - 16 `pending` rows are all Aug 25–27 cash/card — **stuck pending payments (P-11 candidate)**: no provider, no completed_at, no recovery action found in app.
- `payments.status`: pending/captured only (2 rows).
- Live observed legal states: `{pending, captured, NULL(legacy)}` — **no `failed`/`refunded`/`voided` values exist in live data** even though the code path suggests them. Registry check (P-2) must define these.
- `payment_refunds` empty → refunds currently expressed as `order_payments` rows with `is_refund=true` (0 rows live yet — **no refund has actually happened in prod**).

## 6. AMOUNT EDGE CASES (live evidence)

- **Split:** `split_group_id` populated only in per-item-allocation flow; `payment_methods` all allow split. `orders` has `split_count`/`is_split` (sample: `split_count=1, is_split=false` — off-by-one convention to verify in P-3).
- **Overpayment/change:** `orders.cash_received` + `change_amount` columns exist (samples mostly null/0). `complete_payment_atomic_v2` takes `p_cash_received` — change math is client-computed in route → **P-5 must verify server-side clamp**.
- **Partial:** `is_partial=true` present in both `payments` (legacy 2 rows) and order_payments mechanism; `recalculate_order_payment_state` exists for underpayment → open-balance model.
- **Idempotency:** `payment_idempotency_keys` with `pos:{order}:{key}` format — client-supplied key; v2 RPC takes `p_idempotency_key` ✓. L4 2×pay result stands as baseline; route accepts `idempotency_key` from body (P-4: verify collision semantics = "return original" vs "error").

## 7. AUDIT / OUTBOX / IMMUTABILITY (live)

- **Audit:** `audit_logs_canonical` (264) — actions seen: `payment` (17), `cash_register_opened` (26), `cash_close` (22), `cash_in` (11), `shift_closed_via_drawer` (22), `void_items` (6), `discount` (6), `manager_approval` (1). `audit_logs` (257) — `payment` (19), `order.transition` (82), `cancel` (59), `status_change` (37).
- **Outbox:** 2,237 events, **100% completed**, aggregates: table 1293, staff 462, inventory 237, kds_ticket 147, location 49, order 33, session 9, order_item 7. **No payment-specific aggregate_type observed** — payment events ride on `order` (33). P-9: decide if `payments` needs its own aggregate.
- **Immutability:** `inventory_logs` has immutable trigger (known). **No equivalent observed for `order_payments`/`payments`** — UPDATE/DELETE are exposed (get,post,delete,patch on all payment tables under service_role). P-9 must add the immutable-trigger pattern + `updated_at` already exists (evidence something updates it).

## 8. RECONCILIATION GAP (biggest data-integrity finding)

Spot-check of **25 recent `paid`/`closed` orders**:
- **20/25 have ZERO `order_payments` rows** while `orders.paid_amount` is set.
- 1/25 has payment sum ≠ `paid_amount`.

Interpretation: the majority of paid orders (legacy era, pre-`order_payments` adoption) recorded money on `orders.paid_amount` **without any payment record** — violates ground rule #1 "payment ↔ order: no paid-without-record". This is the pre-existing gap P-5/P-9 reconciliation must baseline (not regress; do NOT backfill without a ratified decision).

## 9. P-0 VERDICT → INPUTS FOR P-1..P-12

1. **Active SSOT pair:** `order_payments` + `complete_payment_atomic_v2` (+ idempotency keys). Everything else is legacy/orphan:
   - Legacy tables to disposition: `payments` (2), `cash_drawer_log` (57).
   - Orphan RPCs (no app caller found): `complete_payment_v4`, `process_order_payment`, `refund_payment_atomic`, `void_payment_atomic` (v1), `complete_payment_atomic` (only via legacy routes).
2. **P-1 (authorization) blockers:** owner-missing `payments.create`; `/api/orders/void` + legacy pay routes on `requireAuth()` only; verify `staff_permission_overrides` live rows for owner staff.
3. **P-2 (states):** live set is `{pending, captured, NULL}` — registry must formally define + reject hidden states (`dirty` lesson).
4. **P-3 (amounts):** split/overpay/change math partially client-side; `requires_authorization=false` for all methods.
5. **P-7 (concurrency):** 16 stuck `pending` + 4 open `cash_drawer_sessions` = live residue to probe against.
6. **P-8 (drawer):** 4 OPEN drawer sessions in prod; `close_cash_register` v1/v2 both present.
7. **P-9 (immutability/audit):** no immutable trigger on payment tables; payment outbox rides `order` aggregate; reconciliation gap (20/25 paid-without-record, legacy).
8. **P-10 (external processor):** no `provider`/`provider_transaction_id` values populated live, no `failed` states, `payment_attempts` nearly empty — external processor path is scaffolded, never used → P-10 is mostly greenfield with `update_payment_status` as the webhook-shaped entry.

## 10. ARTIFACTS

- `.audit-raw.json` — full live schema dump (171 tables + 344 RPCs w/ args)
- `.openapi-live.json` — raw live PostgREST OpenAPI (1.17 MB)
- `.audit-live-data.json` / `.audit-perms.json` — live row distributions & permission catalog
- Parse scripts: `.audit-parse*.cjs`, `.audit-livedata.cjs`, `.audit-perms.cjs`

*All findings from LIVE DB at 2026-09-12. Re-run anytime: fetch OpenAPI at `/rest/v1/` with service_role + the queries above.*
