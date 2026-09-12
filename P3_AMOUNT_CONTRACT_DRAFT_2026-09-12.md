# P-3 AMOUNT / ATOMICITY / RECONCILIATION CONTRACT — DRAFT FOR RATIFICATION (LIVE EVIDENCE)

**Date:** 2026-09-12 · **Method:** live DB (function bodies, triggers, RLS, read-only aggregate battery). **NO CHANGES.** P-1/P-2 contracts untouched.
**Scope:** handover §5.2 P-3 — amount edge cases / payment financial semantics: lock patterns, order↔payment↔drawer consistency, append-only/immutability, impossible states, concurrent double-accounting, correction model, txn atomicity.

---

## 1. LOCK PATTERNS (atomicity core) — SOUND ✅

All 16 payment financial fns use `SELECT * INTO … FOR UPDATE` on the primary row **first**, in-fn transaction:
- `complete_payment_atomic_v2` → **`orders` FOR UPDATE** (single-row lock; idempotency table dedup; invariants in-fn)
- `refund_with_inventory` → **`orders` + `order_items` FOR UPDATE**
- `void_payment_atomic_v2`, `process_order_payment`, `saito_reverse_payment` → `orders FOR UPDATE`
- `close_cash_register` → `shifts FOR UPDATE`; `update_payment_status` → `payments FOR UPDATE`
- `clear_table_atomic`, `release_paid_table_atomic`, `reopen_order_atomic`, `close_shift_atomic` → their primary rows

Concurrent pay on the same order **serializes on the order row lock** → `ORDER_ALREADY_PAID` on the second. Plus table-level idempotency: `payment_idempotency_keys` dedup → `duplicate=true`, **no double row** (P-1 gate P1-07 proves: 2nd same-key call → 1 row). **No double-accounting path found.**

## 2. RECONCILIATION STATE (live) — HISTORICAL GAP, CURRENT PATH CLEAN

| Check | Live result | Reading |
|---|---|---|
| Paid/closed/partial/refunded orders | **406** | |
| …with a payment record | **65** | |
| **PAID_WITHOUT_RECORD** | **342** | **ALL pre-2026-09-09** (last: 2026-09-01). Sep9+ = **0** → gap is a **closed historical era** (legacy v1/pay-path didn't write `order_payments`); current v2 path is consistent |
| paid_amount ≠ SUM(payment rows) | **42** | All pre-Sep9 legacy (e.g. paid 141 vs total 9, paid 3.52 rec 0). Sep9+ = **0** |
| **Sep9+ 6 paid orders** | all `paid = total = rec_sum` **exact** (incl. 24.78 cash, card 100) | **current reconciliation is CLEAN** |
| overpaid (paid > total, paid) | 8 (all legacy June–July) | v2 has `PAYMENT_EXCEEDS_REMAINING` guard + remaining/underpay logic → **current path cannot overpay** |
| underpaid-close (0 < paid < total) | **1** Sep9+ (23 paid / 40 total, cash) | legal? registry has `paid→closed`; underpayment handling = open question (Q2) |
| split_groups / is_partial | **0 / 0** | split/partial-payment columns exist but never used in prod (P-2/P-10 greenfield) |
| negative/zero amounts | **0** (order_payments + payments) | `amount > 0` CHECK on order_payments |
| duplicate idempotency keys | **0** | dedup table working |
| currency mismatch order↔payment | n/a (orders has no currency col) | |

## 3. DRAWER LINKAGE (payment ↔ drawer) — WORKS, WITH A LATENT AMBIGUITY

- `v2` **never touches the drawer** — linkage is a **trigger**: `trg_record_cash_payment` (AFTER UPDATE OF status ON orders, WHEN `new.status='paid' AND payment_method='cash'`) → `fn_record_cash_payment()`.
- **Latent weakness (P3-F2):** it picks the drawer with `WHERE status='open' ORDER BY opened_at DESC LIMIT 1` — **no location/shift/org scoping**. Live: **4 open sessions** (2 with shift, 2 without; all loc=true). Today single-location → resolves fine; multi-location → a cash payment could log into the wrong drawer. Silent skip (no log, no error) if no open session.
- Drawer reconciliation is clean: both **closed** sessions `difference=0.00` (350→350; 0→0). The 4 stuck `open` sessions (P-0 P-11) remain a P-8 hygiene item.
- Card payments: no drawer linkage (correct — card ≠ cash float).

## 4. APPEND-ONLY / IMMUTABILITY (financial rows) — PARTIAL

- `order_payments` triggers: **only** `trg_payment_state_machine_guard` (P-2) + `trg_validate_payment_balance` (amount invariants). **NO immutability trigger** → `amount`/`method`/`is_refund` can still be UPDATEd by service_role (status is now P-2-guarded). RLS is ON (authenticated-role path), but SECURITY DEFINER fns + service_role bypass RLS.
- Contrast: `inventory_logs` **is** immutable (P-9 frozen reference pattern) — financial rows are **not** yet held to the same bar.
- **Correction model in the code is already append-only** (no UPDATE-of-amount): refund = new `is_refund` row; reverse = `saito_reverse_payment` (marks payment, not amount-edit); `orders.paid_amount` is recomputed by 6 fns (`complete_payment_atomic_v2`, `recalculate_order_payment_state`, `saito_reverse_payment`, `process_order_payment`, `complete_payment_v4`, `reopen_order`) — i.e. order.paid_amount is a **derived aggregate**, not a manually-editable ledger.

## 5. AUDIT / OUTBOX (financial trail)

- **`audit_logs_canonical` is the richest financial ledger**: actions `payment`, `refund`, `cash_register_opened`, `cash_close`, `cash_in`, `shift_closed_via_drawer` — present in prod.
- `audit_logs` (legacy): `payment`, `cash_register_open`.
- Outbox: v2 does **not** emit; emission is centralized in `g_table_audit` (helper). Payment events reach outbox via the order/table state triggers.
- `payment_attempts`: **2 rows total** (card attempt tracking = greenfield, consistent with P-10).

## 6. FINDINGS (for decision)

| # | Finding | Class |
|---|---|---|
| **P3-F1** | **Historical reconciliation gap: 342 paid-without-record + 42 amount-mismatch orders, ALL pre-Sep9** (closed era; current path clean & verified). Backfill = **separate ratified data decision** (same rule as the NULL payments). Do NOT "fix" silently. | data-integrity (deferred) |
| **P3-F2** | **Cash→drawer trigger is unscoped** (latest open session, no location/shift/org filter) + silent-skip. Latent today (single location, but 4 open sessions already). | latent (P-8 territory) |
| **P3-F3** | **`order_payments` amount/record immutability not enforced** (only status is P-2-guarded). Financial rows should be append-only like `inventory_logs`; corrections already modeled as new rows, so an immutability trigger has no current-path cost. | candidate P-3/P-9 hardening |
| **P3-F4** | **Underpaid-close is legal today** (1 live: 23/40). `paid→closed` exists; no underpayment policy (refund the diff? block close? tip explanation?). | open business rule (Q2) |
| **P3-F5** | Split/partial payments (`is_partial`, `split_group_id`) = **0 use** — greenfield (P-2/P-10), registry columns ready. | note |
| **P3-F6** | Concurrency/atomicity **sound**: row-lock-first + in-fn invariants + idempotency dedup + append-only correction + canonical audit ledger. No double-accounting path. | ✅ contract fact (freeze) |

## 7. PROPOSED FROZEN AMOUNT/ATOMICITY CONTRACT (for ratification)

1. **Freeze as-is (sound):** lock-first atomicity, in-fn amount invariants (`amount>0`, `PAYMENT_EXCEEDS_REMAINING`, balance checks), idempotency dedup, append-only correction model, derived `orders.paid_amount`, `audit_logs_canonical` as financial ledger.
2. **P3-F1 (342+42 historical gap):** declare **legacy, out of P-3 scope**; backfill only by a separately ratified data decision (evidence frozen here, no mutation).
3. **P3-F3 (immutability):** decision — add an `order_payments` immutability trigger (amount/method/is_refund/order_id immutable post-insert; status via P-2 guard) matching the `inventory_logs` pattern, **or** defer to P-9. **Recommend: do it in P-3** (it's the financial-append-only guarantee the handover asks for, and corrections are already new-row so zero current-path cost).
4. **P3-F4 (underpayment):** decision needed — is underpaid-close (pay < total) allowed? Options: (a) allow as-is (document), (b) require `close_table` to explain/block, (c) auto-record the uncollected remainder. **Not a P-3 code change without ratification.**
5. **P3-F2 (cash-drawer scoping):** defer to **P-8** (drawer module) — document here, don't touch in P-3.
6. Split/partial (P3-F5): no action (greenfield P-2/P-10).

## 8. EVIDENCE REPRODUCERS
- `SELECT p.proname,p.pronargs FROM pg_proc p … WHERE pg_get_functiondef(p.oid) LIKE '%FOR UPDATE%'` (16 fns)
- v2 body: `SELECT * INTO v_order FROM orders WHERE id=p_order_id FOR UPDATE; INSERT INTO order_payments; INSERT INTO payment_idempotency_keys; UPDATE orders;` (no drawer, no direct audit/outbox)
- Triggers: `order_payments` = `trg_payment_state_machine_guard` + `trg_validate_payment_balance`; `orders` UPDATE = `trg_orders_sync_table_floors` + `trg_sync_table_kitchen_status`; `trg_record_cash_payment` (AFTER UPDATE OF status → fn_record_cash_payment)
- Reconciliation battery: R1 406/65/342 · R2 42 · R4 8 · R5 0 · R6 69 · R7 0 (all pre-Sep9 except R4-legacy); Sep9+ 6 orders exact.
- Drawer: open=4 (2+shift/2 no-shift), closed diff=0.00×2.
- `amount>0` CHECK; `inventory_logs` immutable=ON; `audit_logs_canonical` actions enumerated.

**Status: DRAFT — awaiting ratification of §7 items 3 & 4 (immutability trigger scope + underpayment rule) before any migration.**
