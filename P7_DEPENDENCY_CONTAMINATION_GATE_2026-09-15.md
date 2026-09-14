# P-7 DEPENDENCY-CONTAMINATION GATE — result (2026-09-15, READ-ONLY, 0 DB mutation)

Ratified: P-7 opens with a read-only gate — 6 questions, each answered with
**path-level evidence** (`app → route → RPC → table`, not just `grep=0`). Verdict
rule: any YES → the dependency must be dispositioned before P-7 writer-freeze.

Method (all raw, re-executable):
- App layer: word-boundary grep over `artifacts/saito-admin/src` (`.from()`,
  REST `/rest/v1/<table>`, raw SQL), each hit classified write/read/decision.
- DB layer: **all 625 function bodies** dumped from live (`pg_get_functiondef`) and
  scanned for `INSERT INTO / UPDATE / DELETE FROM / SELECT ... <table>`; triggers on
  writer tables; live row-count deltas vs the P-6 baseline to prove paths are
  *live*, not dead code.

## VERDICT: **4 NO / 2 YES — P-7 writer-freeze is BLOCKED until the 2 YES items are dispositioned.**

| # | Question | Verdict | Path-level evidence |
|---|---|---|---|
| 1 | `orders.total_price` authoritative for P-7 writers? | **NO** | **No app and no fn writes it.** All 625 fn bodies scanned: 0 `INSERT INTO orders ... total_price`, 0 `UPDATE orders SET total_price=`. The writers use `total_amount`: `add_item_atomic` (`SET total_amount = COALESCE(total_amount,0)+v_total`), `correct_item_atomic` (± v_void_total / + v_new_total), `void_items_state_aware`, `transition_order_atomic`. App's 110 `total_price` hits are `order_items.total_price` (line-item column, different table) + display. `orders.total_price` is a **stale second money column, not a writer path** → P-7 invariant: writers touch `total_amount` only (R-1 stays P-9). |
| 2 | `table_floors.payment_status` a decision source? | **NO** | 0 app decision hits (the 8 hits = i18n labels + `lib/posStatus.ts`/`tableStatus.ts` comments stating it is DERIVED, + `/api/payments/void` calling `update_payment_status` on the legacy `payments` table). 0 fns read it in a condition; 0 fns write it. 9 triggers on `table_floors` verified — none set `payment_status`. → P-7 tests must never assert on it. |
| 3 | `staff_stats` authorization/business dependency? | **NO** | 0 app refs. 0 fns SELECT/INSERT/UPDATE/DELETE it. Sole ref: `get_staff_directory_v2` — a read-model join (`LEFT JOIN staff_stats ss ... WHERE ss.period = CURRENT_DATE`) selecting 33 `ss.*` KPI columns for the staff directory **display**; no `authorize`/`has_permission`/`transition` fn reads it. → P-7 authorization cannot be contaminated by it. (Its 1:1-with-staff nature stays P-9.) |
| 4 | Legacy `payments` a writer dependency? | **YES** ⛔ | **Path: `/api/orders/refund` (Mode 1) → `refund_with_inventory(10/11)` → in ONE transaction: `INSERT INTO public.order_payments (canonical)` AND `INSERT INTO public.payments (order_id, amount=-ABS(v_refund), status='refunded', is_refund=true, idempotency_key='refund:…')` — in-fn comment: "Legacy compatibility/reporting mirror (negative refund convention)".** Live proof: P-6 gate (15/15, 2026-09-14, multiple refund tests) ran AFTER the P-6 audit saw `payments=2 rows` — count is **still 2, is_refund=0**, because every P-6 refund is rolled back in its own transaction; the path is real but residue-free. Concurrency note: `payments.idempotency_key` **is UNIQUE** (verified) → a double refund fails the legacy mirror too, so the mirror *adds* a serialization point. **Disposition needed (P-9 class):** keep-as-documented-mirror, or strip from `refund_with_inventory` (behavior change). P-7 must treat the refund txn as writing TWO ledgers. |
| 5 | `inventory_status` an order/payment dependency? | **NO** | 3 app refs, all **reads**: `/api/inventory` (`.select('*')`), `/api/inventory/calibration` (`.select('id,name,current_stock,theoretical_stock,unit')`), `/api/dashboard/stats` (read). No order/payment RPC touches it (0 hits in all 625 bodies). Inventory side: triggers live on `inventory_logs` (6), not `inventory_status`; `current_stock` has none. → No cross-domain dependency. |
| 6 | Legacy audit tables receiving new canonical writes? | **YES** ⛔ | **Path: `transition_order_atomic` (P-1 canonical state writer) → in ONE transaction: `log_order_event` (→`order_events`) + `INSERT INTO audit_logs (table_name='orders', action='order.transition', old_data, new_data)` + `INSERT INTO operation_logs` + `INSERT INTO outbox_events`.** Live proof: `audit_logs` grew **333 → 357** since the P-6 baseline (182 `order.transition` rows in the last 30 days) while `audit_logs_canonical` grew 649 → 738 — both written by the same transitions. Also 13 legacy fns (`cancel_table_orders`, `process_order_payment`, `reopen_order`, `saito_*`, …) still write `audit_log`/`audit_logs` — but those are NOT in the P-7 A-class surface (no P-6-authorized route calls them for pay/refund/reopen; P-6 D-6 already froze `refund_payment_atomic`). The contamination for P-7 is specifically: **a canonical order transition writes a legacy audit table in the same txn** → P-7 "audit isolation" assertions must expect BOTH `audit_logs_canonical` AND legacy `audit_logs` rows, or the legacy INSERT must be dispositioned first. |

## What this means for P-7 (per the ratified rule)

> "Əgər 6-dan hər hansı biri YES çıxsa, P-7 writer freeze-a keçmir; həmin
> dependency əvvəlcə disposition olunur."

**Two YES → P-7 writer-freeze is NOT authorized yet.** Both are *known,
inherited, tested* paths (P-6's 15/15 gate passes with them in place) — they are
not unknown hazards, but the ratified gate says disposition first:

| YES | Disposition options (ratify one) |
|---|---|
| **D-Q4** — `refund_with_inventory` legacy `payments` mirror | (a) **Document-keep**: declare `payments` a *dual-write mirror* in the P-7 contract, P-7 refund tests assert BOTH ledgers + the unique-key serialization; (b) **Strip**: remove the legacy INSERT (behavior change, P-9 class, requires P-6 re-gate). Recommendation: (a) now, (b) in P-9 with the payments→order_payments SSOT decision. |
| **D-Q6** — `transition_order_atomic` legacy `audit_logs` INSERT | (a) **Document-keep**: P-7 audit assertions expect canonical + legacy rows (both in-txn, atomic); (b) **Strip** the legacy INSERT (audit model change, P-9 class, requires P-1 re-gate). Recommendation: (a) now, (b) in P-9 with the 3-audit-table reconciliation. |

P-9 boundary unchanged: R-1 (`total_amount` vs `total_price`, 616/729 divergence)
is **not touched** — the gate instead *confirms* P-7 writers use `total_amount`
exclusively, so P-7 runs safely over the divergence without normalizing it.

**Gate result: 4 NO / 2 YES — P-7 stays PAUSED pending ratification of
D-Q4 + D-Q6 dispositions (expected: both (a) document-keep → immediate P-7
writer-freeze authorization, no DB change).**
