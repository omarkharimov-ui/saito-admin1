# D-6 + D-7 Payment Fix — Implementation & Torture Report

**Status:** ✅ CLOSED (D-6 + D-7)
**Date:** 2026-09-09
**Scope:** `complete_payment_atomic_v2` (live POS pay path) only
**Not changed:** state machine, RLS, auth, merge/transfer/pointer/reservation contracts, v1 (dead code), `refund_with_inventory`, `validate_payment_order_balance` trigger, any other trigger

---

## 1. Defects fixed

| ID | Severity | Root cause | Fix |
|----|----------|-----------|-----|
| D-6 | CRITICAL | No idempotency dedupe, no overpay guard, no already-paid guard. Double-click + 2-terminal race → `paid_amount` 2× | DB-enforced: idempotency dedupe via `payment_idempotency_keys` (return prior result); overpay guard (payment > remaining → reject); already-paid guard (non-refund on fully-paid order → reject, mapped to HTTP 409); refund guard (refund > net-paid → reject) |
| D-7 | CRITICAL | v2 writes `orders.paid_amount` but no `order_payments` ledger row. 65/95 production paid orders lack ledger. | Atomic `INSERT INTO order_payments` inside v2 (same txn as `UPDATE orders`), one row per payment element with `is_refund`/`is_partial`/`method`/`amount` |

## 2. Guard order (race-safe, deliberate)

```
1. FOR UPDATE (order row lock — serialization point)
2. Idempotency dedupe (same key → return prior result, no new charge)
3. Parse payments (split non-refund vs refund)
4. Refund guard      (refund ≤ net paid)
5. Already-paid      (non-refund on fully-paid → ORDER_ALREADY_PAID)
6. Overpay guard     (non-refund > remaining → PAYMENT_EXCEEDS_REMAINING)
7. Compute + ledger INSERT + order UPDATE + idempotency store + audit
```

**Why 5 before 6:** A full re-pay of a paid order surfaces `ORDER_ALREADY_PAID` (route maps to HTTP 409, UI can show a clear message). A partial overpay (paid < total but payment > remaining) surfaces `PAYMENT_EXCEEDS_REMAINING`. Both reject atomically, no partial state.

**Why idempotency AFTER FOR UPDATE:** Two concurrent same-key calls both lock the same row; the first commits, the second re-checks the idempotency table (now populated) and returns the prior result without writing a second ledger row. This is the double-click / retry path.

**Why refund before overpay:** A refund on a paid order must not be blocked by the overpay guard. `v_non_refund_total = 0` for a pure refund, so it bypasses guards 5 and 6 naturally.

## 3. Ledger row shape

For each element in `p_payments`:
```sql
INSERT INTO order_payments (
  order_id, payment_method, method, amount, status,
  is_refund, is_partial, created_by, reference, split_group_id, currency
) VALUES (
  p_order_id,
  v_method,                -- e.g. 'cash', 'card'
  v_method,                -- same as payment_method
  v_amount,                -- numeric
  'captured',              -- terminal status (no 'pending' rows for live payments)
  v_is_refund,             -- boolean
  COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
  p_performed_by,
  p_idempotency_key,       -- reference column (nullable)
  (v_payment->>'split_group_id')::UUID,
  COALESCE((v_payment->>'currency')::TEXT, 'AZN')
)
```

`validate_payment_order_balance` (BEFORE INSERT trigger, already existed) adds a second overpay layer: it rejects any non-refund `order_payments` insert where `SUM(non-refund) > total_amount`. This is independent of v2's own guard — defense in depth.

## 4. Idempotency key model

- Client generates `pos:{orderId}:{uuid}` per order per browser session (see `payKeyFor` in `src/app/admin/pos/page.tsx:105`).
- **Double-click** → same key (ref is stable in `useRef`), 2nd call returns prior result.
- **Timeout retry** → same key (client retries with the same ref), server returns prior result.
- **Two terminals** → different keys (different browsers), overpay/already-paid guards catch the race.
- **Key stored** in `payment_idempotency_keys` (key PK, order_id, amount, status, result jsonb) in the same transaction as the charge. Rollback = no key, no charge.

## 5. Smoke test (single rolled-back transaction)

10 cases, all in one `BEGIN…ROLLBACK` DO block (no `psql --single-transaction`, in-file ROLLBACK only). Each case fault-isolated.

| # | Case | Result |
|---|------|--------|
| T1 | Single full payment (9.00) | ✅ status=paid, paid=9.00, ledger=1 |
| T2 | Same idempotency key (2nd call) | ✅ idempotent=true, paid=9.00 (unchanged), ledger=1 (unchanged) |
| T3 | Different key on fully-paid order | ✅ REJECTED `ORDER_ALREADY_PAID` |
| T4 | Overpay (8.00 on 5.00 bill) | ✅ REJECTED `PAYMENT_EXCEEDS_REMAINING`, no partial state (paid=0, ledger=0) |
| T5a | Partial 7.00 on 20.00 | ✅ status=confirmed, paid=7.00, ledger=1 |
| T5b | Exact remaining 13.00 (after 7.00) | ✅ status=paid, paid=20.00, is_fully_paid=true |
| T6 | Full refund 10.00 on paid 10.00 | ✅ status=refunded, paid=0, refund=10.00, refund ledger=1 |
| T7 | Partial refund 5.00 on paid 20.00 | ✅ status=partially_refunded, paid=15.00, refund=5.00 |
| T8 | Over-refund 15.00 on net-paid 10.00 | ✅ REJECTED `REFUND_EXCEEDS_PAID`, no state change |
| T9 | Payment 50.00 + tip 5.00 + cash_received 55.00 | ✅ status=paid, tip=5.00, cash_received=55.00 |
| T10 | Different-key re-pay on fully-paid 15.00 | ✅ REJECTED `ORDER_ALREADY_PAID` |

**Post-ROLLBACK:** `order_payments=61`, `payment_idempotency_keys=1`, no test orders in 900-range. Production untouched.

## 6. Real-parallel race test (independent psql processes)

Each racer = separate `psql` process (own autocommit txn) = one real client request. Barrier-synchronized via a GO file: all racers block, then fire simultaneously.

| Race | Setup | Result |
|------|-------|--------|
| R1 | 2 terminals, DIFFERENT keys, 9.00+9.00 (bill 9.00) | ✅ paid=9.00 (NOT 18), 1 ledger row; one `success:true`, one `ORDER_ALREADY_PAID` |
| R2 | 3 terminals, DIFFERENT keys, 5.00×3=15.00 (bill 10.00) | ✅ paid=10.00 (NOT 15), 2 ledger rows (sum=10.00); 2 `success:true` (partial), 1 `ORDER_ALREADY_PAID` |
| R3 | 2 terminals, **SAME key** (double-click), 9.00+9.00 (bill 9.00) | ✅ paid=9.00, 1 ledger row, 1 idempotency row; one `success:true`, one `idempotent:true` with identical `payment_id` and `timestamp` |
| R4 | Sequential: first commit + retry with same key (simulated timeout) | ✅ paid=9.00 (NOT 18), 1 ledger row, 1 idempotency row; retry returned `idempotent:true` prior result |

Side-effects (committed race orders, verified before cleanup):
- Audit: R1=1, R2=2, R3=1 (deduped), R4=1 (retry deduped) ✅
- Ledger: 5 rows total (R1=1, R2=2, R3=1, R4=1) ✅
- Idempotency: 5 rows ✅
- Floor rows: 0 (no ghost floors) ✅
- Outbox: 15 events (from `trg_orders_sync_table_floors` on each order update) ✅

Cleanup: all 4 committed race orders + ledger + idempotency + audit deleted by provenance. Post-cleanup: `order_payments=61`, `payment_idempotency_keys=1` (baseline restored).

## 7. Final matrix (single rolled-back transaction)

| Case | paid | refund | ledger | remaining | status | audit | outbox |
|------|------|--------|--------|-----------|--------|-------|--------|
| C1 1 payment | 10.00 | 0 | 1 | 0.00 | paid | 1 | 3 |
| C2 2× same key | 10.00 | 0 | 1 | 0.00 | paid | 1 | (dedupe) |
| C4 partial+partial | 20.00 | 0 | 2 | 0.00 | paid | — | — |
| C5 exact remaining | 15.00 | 0 | 2 | 0.00 | paid | — | — |
| C6 overpay | REJECTED | — | 0 | — | confirmed | 0 | 0 |
| C10 payment+tip | 40.00 | 0 | 1 | 0.00 | paid | — | — |
| C11 payment+discount | 100.00 | 0 | 1 | 0.00 | paid | — | — |
| C12 already-paid | REJECTED | — | 0 | — | paid | 0 | 0 |
| C13 refunded order | 0.00 | 10.00 | 1 (refund) | 0.00 | refunded | 1 | — |

Race cases C3/C7/C8/C9 covered by the live parallel run (§6).

## 8. Known limitations (honest notes)

- **Service charge:** v2 has no dedicated `p_service_charge` parameter. The contract exposes `p_discount_amount`/`p_discount_type` (fixed/percent). A service charge in the app is folded into `total_amount` client-side before the pay call. C11 above tests the discount parameter, not a separate service-charge column. If a service charge must be a distinct DB field, that's a new contract change (not part of D-6/D-7 minimal scope).
- **v1 (complete_payment_atomic):** 10- and 11-arg overloads are dead code — no app route calls them (verified via grep). Left untouched per "don't change frozen contracts / don't invent scope."
- **Refund Mode 2 (full refund via v2):** `complete_payment_atomic_v2` with `is_refund:true` in `p_payments` is called by `/api/orders/refund` (mode 2). The fix handles this path correctly (refund guard, negative contribution to `paid_amount`, `refund_amount` increment, refund ledger row). The app's RefundView prefers Mode 1 (`refund_with_inventory`) for item-level refunds; Mode 2 is the full-order refund.
- **`trg_record_cash_payment`:** fires on `paid_amount` transition to a new total when `payment_method='cash'`. For a double-charge attempt, the trigger would fire once (first transition to `paid`), not twice — but the overpay/already-paid guards now prevent the second charge from happening in the first place.

## 9. Production verification

- Real tables 1-18: unchanged from pre-fix snapshot (4=49.00/6, 5=45.00/1, 8=48.00/4, 9=7.00/1, 10=38.00/3, 15=10.00/1, 6/7/16/17/18 reserved, rest empty).
- Test residue in my session window (≥ 2026-09-08): **0** orders, **0** reservations, **0** ledger rows, **0** idempotency rows.
- Pre-existing test residue (Aug 14-15 "E2E" cancelled orders, "Final/Verify" reservations): untouched (out of scope).
- Ledger baseline: `order_payments=61`, `payment_idempotency_keys=1` (unchanged from pre-fix).

## 10. Files

- `artifacts/saito-admin/supabase/migrations/20260908000005_payment_idempotency_overpay_ledger.sql` (new)
- No app code changes (the pay route at `src/app/api/orders/pay/route.ts` already handles `ORDER_ALREADY_PAID` → 409 and `ORDER_NOT_FOUND` → 404; those handlers were dead before, now live)

## 11. Next per the approved sequence

D-6/D-7 ✅ → **Torture re-run** (full matrix including non-payment ops) → D-2/D-5 → D-8 → D-9 → Torture re-run → Browser/UI pass → L4 + print → Full data-integrity → **POS CORE FREEZE** → UX
