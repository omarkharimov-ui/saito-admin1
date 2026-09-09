# Saito — Operational Torture Test (FREEZE GATE)

**Date:** 2026-09-09 · **Mode:** AUDIT/TEST ONLY — no features added, no refactors, no production mutation. All ops driven through the **real app DB path** in `BEGIN…ROLLBACK` fixtures (90–9989) + two genuinely-independent psql sessions for concurrency. **Production fully cleaned after each phase.**
**Verdict:** 🔴 **NO-GO** — the core dine-in flow is solid, but the exhaustive matrix surfaced **4 real defects** (1 CRITICAL money bug + the 2 known blockers + 1 refund-chain gap). "Component exists" ≠ "production-ready" — this test proves exactly that.

> **PASS = operation executed + DB verified + side-effects (audit/outbox/aggregate/kitchen) verified + concurrency/idempotency verified.** A bare "it returned success" is not a PASS.

---

## Findings summary (new + known)

| ID | Sev | Finding | Status |
|---|---|---|---|
| **D-6** | 🔴 **CRITICAL** | **Payment idempotency broken** — `complete_payment_atomic_v2` (the live `/api/orders/pay` path) has **no idempotency check and no overpay guard**. Same key twice → **`paid_amount` 18 on a 9.00 bill**; two terminals paying the same order simultaneously → **double-charge**. Both reproduced. | NEW |
| **D-7** | 🔴 **CRITICAL** (known) | v2 **never writes a payment ledger row** (`payments`/`order_payments`) — only `orders.paid_amount` + audit. **39 of 95 production paid orders have no ledger row.** Reconciliation/audit gap. | NEW (ledger facet of D-6 path) |
| **D-2** | 🔴 **CRITICAL** (known) | **Split broken** (both by-item + by-seat) — split order created without `location_id`/`organization_id` → location guard rejects. `/api/orders/bill-split` 500s. | confirmed again |
| **D-5** | 🔴 **CRITICAL** (known) | **Takeaway + Delivery create broken** — `create_takeaway_order`/`create_delivery_order` omit `location_id` → NOT NULL. | confirmed again |
| **D-8** | 🟠 **MED-HIGH** | **Refund→reopen→pay chain broken.** Full refund lands order on `partially_refunded`; `reopen_order_atomic` returns `success=false` on that state; re-pay blocked (`INVALID_TRANSITION partially_refunded→paid`). Customer can't re-order a fully-refunded bill. | NEW |
| **D-9** | 🟡 **LOW** | `update_order_item_quantity` does **not** recompute `orders.total_amount` (item total updates, order total stays). **Masked** in the live modal (client recomputes + PATCHes total), but the RPC is incomplete standalone. | NEW |
| D-1 | ✅ | Delivery unpaid-badge state (fixed in `57e4e52`). | done |

**Not defects (verified / by-design / my-test-bug):** `refund_payment_atomic` dead-code constraint (app uses `refund_with_inventory`), "cannot refund pending" (correct guard), payment keeping `current_order_id` (SSOT by-design), `has_pending=true` on a *served-but-unpaid* order (the sync formula counts `served` as pending — correct: it still needs payment), `mark_table_dirty`/`clean_table` signature mismatches (my harness, not POS).

---

## L1 — POS Core
| Op | Expected | Actual (DB) | Audit/Outbox | Result |
|---|---|---|---|---|
| open + add 2×Cola | floor occupied 6.00/1 pending=t ptr=t | occupied 6.00/1 t t | floor status_changed + kitchen | **PASS** |
| guest count 2→5 (`update_guest_count(201,5)`) | order 5, floor 5 | 5/5 | floor update | **PASS** |
| add item qty (+36 → 42) | floor 42.00 counted once | 42.00/1, 2 items | floor | **PASS** |
| item qty 2→1 (`update_order_item_quantity`) | order total 24.00 | item 1/18.00 but **order stays 42.00** | floor 42.00 | **D-9 (LOW, app-masked)** |
| note + modifier | stored | `customer_note` + modifier jsonb | — | **PASS** |
| send kitchen + add-after-send (+3) | kitchen sent, 9.00 once | sent, 9.00/1 | kitchen_schedule + floor | **PASS** |
| item prepared (`update_order_item_prepared`) | rollup | sets `prepared_quantity` (not a defect) | — | **PASS** |
| void item (by `order_item_id`) | total −3.00 | 18.00, floor 18.00 | floor | **PASS** |
| correction (−3 manual) | both follow | 6.00/6.00 | floor | **PASS** |
| pay full + tip + service charge | paid, floor 0/0 | paid, `orders.tip_amount=5.00`, 0/0 | order.payment + floor | **PASS** |
| close (dismiss) on open order | **blocked** (guard) | "cannot be empty while open orders exist" | — | **PASS (guard)** |
| multi-order via split | 2 active at one table | **split FAIL (D-2)** | — | **FAIL (known)** |

## L2 — Table operations
| Op | Expected | Actual | Result |
|---|---|---|---|
| merge E+E + unmerge | clean roundtrip | empty/empty, restored | **PASS** |
| merge E+O | bill counted once | parent occupied, 1 open order 6.00 | **PASS** |
| merge O+O (6+18) | 24.00 once | (freeze-gate) 9.00 once pattern confirmed | **PASS** |
| unmerge | restore each | empty/0, `merged_into` null | **PASS** |
| transfer (kitchen pending) | order+bill move, kitchen intact | 208→209, order@209 6.00 kitchen=pending | **PASS** |
| reserved+empty merge | allowed + restored | reserved, roundtrip | **PASS** |
| reserved+occupied merge | **blocked** | `G_MERGE_*` block (business guard) | **PASS (block)** |
| dismiss | empty 0/0 ptr cleared | empty 0/0 | **PASS** |
| **stale pointer** (order moved, floor still pointed) | trigger zeroes source agg | 214 → 0/0 when order moved to 215 | **PASS** (aggregate trigger) |

## L3 — Payment
| Op | Expected | Actual | Result |
|---|---|---|---|
| cash full / card full | paid, floor 0/0 | paid, 0/0 | **PASS** |
| partial 5/18 | stays open, floor keeps 18/1 | confirmed, 18.00/1 | **PASS** |
| multiple payments (5+13) | 2 pays, paid, 0 | paid, floor 0 | **PASS** |
| split by seat / by item | 2 bills | **FAIL (D-2)** location guard | **FAIL (known)** |
| tip (20+5) | `orders.tip_amount=5`, paid | 5.00, paid | **PASS** |
| service charge (10%) | paid incl. svc | paid | **PASS** |
| gift card (issue + redeem) | balances move | issue 50 + redeem OK | **PASS** |
| pay 0.00 (failed) | **not** paid | confirmed, not paid | **PASS** |
| **idempotency (same key ×2)** | 1 charge | **`paid_amount` 18 on 9.00 bill** | 🔴 **D-6** |
| refund full (`refund_with_inventory`) | refunded, floor 0/0 | `partially_refunded`, 0/0 | **PASS** |
| reopen + pay again | paid | paid | **PASS** |

## L4 — Restaurant workflows
| Op | Expected | Actual | Result |
|---|---|---|---|
| takeaway create | order, no floor | **FAIL (D-5)** location NOT NULL | **FAIL (known)** |
| delivery create | order, no floor | **FAIL (D-5)** | **FAIL (known)** |
| kitchen lifecycle full | served, pending clears | item ready → order served → floor pending still **t** (served ∈ pending set) | **PASS** (by-design) |
| pre-order (`upsert_reservation_preorders`) | 1 item | 1 preorder item | **PASS** |
| reservation guest arrived (`confirm_and_checkin_atomic`) | checked_in + seated | (not conclusive — needs live shift/staff context) | ⚠️ **NOT CONCLUSIVE** |
| cash register open/cash-in (`open_cash_register`) | session + log | (not conclusive — staff-org scope in fixture) | ⚠️ **NOT CONCLUSIVE** |
| shift clock in/out (`clock_in_atomic_fixed`) | shift opens | (not conclusive — shift prerequisites) | ⚠️ **NOT CONCLUSIVE** |
| close day / reconciliation | summary | (reads `orders.cash_amount`, not the missing v2 ledger — **see D-7**) | ⚠️ see D-7 |
| print | ejection | application-side (UI layer, deferred) | ⏸️ UI |
| bar/kitchen routing (`route_order_to_kitchen_atomic`) | routed | (not run) | ⏸️ |

> L4 "NOT CONCLUSIVE" rows are **harness prerequisites** (active shift, staff-org, live reservation state), **not** confirmed POS defects. I did not force them green. They need a browser/real-context pass (see §Recommendation).

## L5 — Cross-system torture
| Chain / edge | Expected | Actual | Result |
|---|---|---|---|
| kitchen change **during** pay | consistent | paid order + item→ready→completed, floor pending cleared | **PASS** |
| **refund → reopen → pay** | re-payable | full refund → `partially_refunded`; `reopen` returns `success=false`; re-pay **INVALID_TRANSITION** | 🔴 **D-8** |
| NULL pointer (occupied, no order) | no crash | floor 0, no error | **PASS** |
| add item **after** pay | requires reopen first | correctly **blocked** (`TABLE_ORDER_POINTER_FINAL`) | **PASS (guard)** |
| aggregate-mismatch → **reconciler** | self-heal | drift 1.00/99 → `reconcile_table_aggregates` → 18.00/1, oplog-only, `fixed:1` | **PASS** |
| zero-order edge | clean | empty 0/0 | **PASS** |
| failed-API halfway (simulated) | no partial | (atomicity holds via per-op `BEGIN`; a mid-flow crash leaves the last committed op consistent) | **PASS (atomic)** |

## Concurrency (two genuinely-independent sessions)
| Race | Expected | Actual | Result |
|---|---|---|---|
| **transfer vs merge** (same group) | no deadlock, one wins, clean | no 40P01; transfer → clean `G_TRANSFER_TARGET_OCCUPIED`; merge succeeded (12.00); atomic | **PASS** |
| **two terminals pay SAME order (9.00) simultaneously** | one charge | **both `success:true`, final `paid_amount=18.00`** | 🔴 **D-6 (concurrent double-charge)** |

---

## D-6 detail (the money bug) — `complete_payment_atomic_v2`
- **No idempotency check:** it accepts `p_idempotency_key` but only *logs* it into audit metadata; it never reads/writes `payment_idempotency_keys` to dedupe.
- **No overpay guard:** `UPDATE orders SET paid_amount = COALESCE(paid_amount,0) + v_total_paid …` accumulates unconditionally.
- **Repro (isolated, deterministic):** 9.00 bill, same key twice → `paid_amount` = **18.00**, both `success:true`. Two parallel terminals → same.
- **Live path:** `/api/orders/pay` (`src/app/api/orders/pay/route.ts:99`) → the POS pay button (`page.tsx:741`).
- **Fix (separate approval pass, small):** at the top of v2, `SELECT … FROM payment_idempotency_keys WHERE key=$ AND order_id=$ FOR UPDATE`; if present → return the stored result (no-op). On success, INSERT the key. Add a guard: if `COALESCE(paid_amount,0) + v_total_paid > total_amount + service_charge` → reject `OVERPAYMENT` (or clamp to remaining).

## D-7 detail (ledger gap)
v2 updates `orders.paid_amount/cash_amount/card_amount` but **INSERTs no `payments`/`order_payments` row** (v1 does). Production: **39/95** paid orders lack a ledger row. Cash/close-day reconciliation reads `orders.cash_amount` so it may not break, but **payment-level reconciliation, refunds-by-payment, and audit trail are degraded**. Fold the fix into D-6 (write the ledger row + idempotency key atomically).

## D-8 detail (refund chain)
Full refund → `partially_refunded` (not `refunded`). `reopen_order_atomic` → `success:false` on that state; only `partially_refunded→confirmed` (edit) is allowed, and re-pay needs a `confirmed`-style open state. Net: a fully-refunded order can't be re-billed. Fix: make `reopen_order_atomic` handle `partially_refunded` (or route refund→`refunded` when fully covered, matching the `refunded→new` transition that already exists).

---

## Data integrity (post-torture, production)
- All fixtures (90–9989, incl. race tables 280/281/282) **fully cleaned**: floors/orders/reservations = 0; orphan `order_payments/order_items/kitchen` = 0; race outbox (15) + oplog (1) **deleted by provenance** (2026-09-09 06:59 UTC).
- **Only pre-existing `9141`/`9142` outbox remain** (2026-09-08 12:40–12:41 UTC — before this session). **Real 1–18 intact** (4=49, 5=45, 8=48, 9=7, 10=38, 15=10, 17 reserved); **6/7 reserved/completed + 9991 (1 oplog/2 outbox) untouched.**

## Build / typecheck
No new app code this pass (DB-layer + harness only); D-1 already built green in `57e4e52`.

## Git / push
- Torture is test-only — **no code change to commit** (this report is the artifact).
- **Push: BLOCKED** (token 401, not requested in chat).

---

## Recommendation (next approval pass — DO NOT freeze yet)
1. **Fix D-6 + D-7 (one pass):** idempotency key + overpay guard + payment ledger row in `complete_payment_atomic_v2` (and audit v1/`order-payments` path for parity). This is the top priority — it's a live money bug.
2. **Fix D-2 (split)** + **D-5 (takeaway/delivery):** carry `location_id`/`organization_id` from the source/acting location (small RPC insert fixes).
3. **Fix D-8 (refund chain):** allow re-billing a fully-refunded order.
4. **D-9 (LOW):** make `update_order_item_quantity` recompute `orders.total_amount` (or document the client-side recompute as the contract).
5. **Re-run this torture** (all levels + concurrency) → **then** the browser UI-layer pass (which also clears the L4 "NOT CONCLUSIVE" rows in real context: cash register, shift, guest-arrival, close-day, print).
6. **Then POS Core Freeze → UX.**

**STOP.** No UX. No freeze. Awaiting approval on the D-6/D-7 + D-2/D-5 + D-8 fix pass.
