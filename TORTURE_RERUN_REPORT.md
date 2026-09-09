# D-6/D-7 Fix — Full Torture Re-Run Report (Regression Check)

**Date:** 2026-09-09 · **Mode:** TEST ONLY — **NO FIXES APPLIED** (per STOP rule: new defect → document → severity → repro → NO-GO)
**Purpose:** prove the D-6/D-7 payment fix did NOT regress anything else. All prior torture results pre-date the fix (payment section covered the OLD v2 implementation).
**Method:** same 5 levels + D-6/D-7 race matrix, driven through the **real app DB path** (live `complete_payment_atomic_v2` for payment), fixtures in `BEGIN…ROLLBACK` (zero footprint) + genuinely-parallel psql processes for races (committed, cleaned by provenance).

> **PASS = operation executed + DB verified + side-effects (audit/outbox/ledger/kitchen/stock) verified + concurrency/idempotency verified.**

---

## Verdict: ✅ **PASS — D-6/D-7 fix is REGRESSION-SAFE**

- **0 new defects** introduced by the fix.
- **0 post-fix integrity violations** (paid≤total, no orphans, no negative amounts, ledger present for all new payments).
- All previously-PASS flows **still PASS**; all known blockers (D-2, D-8, D-9) **re-confirmed unchanged** (they are next in the approved sequence, not regressions).
- R1–R4 real-parallel races **reproduced the fixed behavior exactly** (no double-charge, idempotent dedupe, ledger sum = captured sum).

---

## R1–R4 payment races — RE-RUN (real parallel psql) vs prior

Fresh orders 9995–9998, fresh keys, barrier-synchronized parallel processes:

| Race | Setup | PRIOR (fix pass) | RE-RUN (this pass) | Match |
|------|-------|------------------|--------------------|-------|
| R1 | 2 terminals, DIFFERENT keys, 9+9 on 9.00 bill | 1 charge + 1 `ORDER_ALREADY_PAID`; paid=9, ledger=1 | 1 charge (B) + 1 `ORDER_ALREADY_PAID` (A); **paid=9.00, ledger=1, ledger_sum=9.00** | ✅ |
| R2 | 3 terminals, DIFFERENT keys, 5+5+5 on 10.00 bill | 2 partials (sum 10) + 1 reject; paid=10 | 2 partials (B:5→confirmed, C:5→paid) + 1 `ORDER_ALREADY_PAID` (A); **paid=10.00, ledger=2, ledger_sum=10.00** | ✅ |
| R3 | 2 terminals, **SAME key** (double-click), 9+9 on 9.00 | 1 charge + 1 `idempotent=true`, same payment_id | **exactly 1 charge** (ledger=1, idemrows=1); both return **identical `payment_id` 4ba31228**; A=`idempotent:false`, B=`idempotent:true,duplicate:true`; **paid=9.00** | ✅ |
| R4 | sequential: commit + retry same key (timeout sim) | 1 charge; retry `idempotent=true` | **exactly 1 charge** (paid=9, ledger=1, idemrows=1); retry returns `idempotent:true,duplicate:true` with **same payment_id d8a6472e + same timestamp** | ✅ |

**User's acceptance criteria — all met:**
```
9 + 9 on 9 bill   → paid = 9      ✅ (R1)
5 + 5 + 5 on 10   → paid = 10     ✅ (R2, ledger_sum = 10.00)
same key          → exactly 1 payment  ✅ (R3)
timeout retry     → exactly 1 payment  ✅ (R4)
ledger sum = captured payment sum      ✅ (R1 9.00/9.00, R2 10.00/10.00)
```
**Audit dedupe on races:** R1=1, R2=2, R3=1, R4=1 payment-audit rows (no double-audit). ✅

---

## L1 — POS Core (live v2 path)

| Op | Expected | Actual (DB) | Result |
|----|----------|-------------|--------|
| order → kitchen → serve → **pay (app pattern: amount=bill, tip separate)** | paid, tip, floor 0/0/f, ledger 1 | paid=24.00, tip=5.00, floor 0/0/f, ledger=1, audit=2, outbox=6 | **PASS** |
| partial 5/18 | confirmed, remaining 13, ledger 1 | confirmed, paid=5, remaining=13, ledger=1 | **PASS** |
| multi 5+13 (2 payments) | paid 18, ledger 2 | paid=18, ledger=2 | **PASS** |
| **idempotency same key ×2** | 1 charge, 2nd returns prior | paid=10, ledger=1, 2nd `idempotent=true,duplicate=true` | **PASS** |
| **overpay 15 on 10** | reject, no partial state | `PAYMENT_EXCEEDS_REMAINING` rejected; paid=0, ledger=0 | **PASS** |
| **already-paid re-pay (diff key)** | `ORDER_ALREADY_PAID` (→409) | rejected; paid stays 10.00 | **PASS** |
| refund (served, `refund_with_inventory`) | refunded-ish, refund ledger row | partially_refunded, paid=0, refund=10, ledger_nonref=1 + ledger_ref=1 | **PASS** |
| refund on **pending** item | rejected (documented guard) | `Cannot refund item in state: pending` | **PASS (guard, by-design)** |
| reopen (paid) | back to open, **ledger deleted** | status=new, floor 10.00/1, ledger=0 | **PASS** |
| **D-8 chain**: full refund → reopen → re-pay | (known broken) | full refund → `partially_refunded`; reopen `success=false`; re-pay **BLOCKED** (now by pre-existing `validate_payment_order_balance` ledger trigger "Payment total cannot exceed order total (0.1.42)" — prior run blocked at state machine `INVALID_TRANSITION`) | **D-8 re-confirmed (known, unchanged, next in sequence)** |
| void item (`void_items_state_aware` w/ product_name key) | (baseline-comparative) | identical to pre-fix baseline (total 21.00, voided_items=0 — harness key artifact, present in the GOOD baseline run too; app uses item-id path) | **PASS (no regression)** |
| split (D-2) | expected fail | `split_order_atomic` → location/org guard reject | **D-2 re-confirmed (known, unchanged)** |

**Regression surface check for L1:** `void_item_atomic`, `void_items_state_aware`, `dismiss_table_atomic`, `send_to_kitchen_atomic`, `merge/unmerge/transfer` — **none read `order_payments` or `payment_idempotency_keys`** (verified in pg_proc), so the new ledger rows cannot alter their behavior. ✅

## L2 — Table operations

| Op | Expected | Actual | Result |
|----|----------|--------|--------|
| **merge occ+occ (fresh 6.00+3.00)** | 9.00 counted once | parent=9.00, child.merged_into set, open_sum=9.00 | **PASS** |
| unmerge | restore both | 6.00/3.00 restored, merged_into null | **PASS** |
| transfer (occupied → empty) | bill moves | 0 / 18.00 / order-at-104 | **PASS** |
| dismiss (occupied) | (document) | released to empty with `success:true` — **see Observations O-1** (outside fix surface: dismiss reads no payment tables) | ⚠️ OBSERVED (pre-existing, non-regression) |

## L3 — Inventory + Kitchen

| Op | Expected | Actual | Result |
|----|----------|--------|--------|
| kitchen lifecycle send→ready→served | status rollup | pending→ready→completed | **PASS** |
| **stock consume at ready** (1 roll: 40g AVO + 120g RICE) | negative deltas | AVO 410→370 (−40), RICE 4730→4610 (−120), 5 `inventory_logs` rows | **PASS** |
| **refund return_to_stock** | stock restored | AVO/RICE delta back to **0.000** (410/4730), refund success, order partially_refunded | **PASS** |
| refund **waste** | stock stays consumed | AVO remains −40, waste recorded | **PASS** |
| post-rollback | zero footprint | AVO=410.000, fixtures 0 | **PASS** |

## L4 — Reservation / Aggregate / Reconciler / Realtime / Z-report

| Op | Expected | Actual | Result |
|----|----------|--------|--------|
| reservation → seat → order (with `reservation_tables` link) | checked_in, floor occupied, order | `seated_at`, floor occupied, reservation checked_in, order created | **PASS** (clears a prior "NOT CONCLUSIVE" — it was a harness prerequisite, confirmed here) |
| aggregate matrix (T1–T17, 9901–9907) | no-op proof, drift self-heal, release guard, outbox isolation | T8 no-op (version unchanged), T16b drift 1.00/99 → reconcile → 10/1 (oplog only, outbox=0), T17 release guard fires, T14 outbox=0, real floor 8 touched+restored in-tx | **PASS** |
| **Z-report / close-day (REGRESSION-SAFE check)** | no double-count: revenue from `orders`, cash/card breakdown from `order_payments` (new), fallback to orders only if ledger empty | 2 fixture paid orders (21 card + 18 cash): revenue=39, cash=18, card=21, tips=2, expected_cash=18 — **ledger-driven, NO double count** (revenue and breakdown are separate metrics; fallback correctly bypassed because ledger now exists) | **PASS** |
| v2 mode-2 refund (full, `is_refund:true` via pay path) | refunded, paid 0 | refunded, paid=0, refund=18, refund ledger row | **PASS** (fix's new refund handling works on the live pay RPC) |

**Regression surface check for L4:** the ONLY trigger whose handler reads `order_payments`/`payment_idempotency_keys` is the pre-existing `trg_validate_payment_balance` (overpay layer). No other trigger or report path was altered. ✅

## Data integrity sweep (production, read-only)

| Check | Post-fix delta | Status |
|-------|----------------|--------|
| paid > total, updated after fix | **0** (all 22 violations are legacy Jun–Jul 2026 rows) | ✅ |
| refund > paid / negative amounts | 0 / 0 | ✅ |
| orphan order_payments / order_items / kitchen_schedule | 0 / 0 / 2 (legacy Jun 2026, `order_id` NULL pre-existing) | ✅ |
| **post-fix (≥ 2026-09-09) paid orders missing ledger** | **0** (fix writes ledger; legacy pre-fix residue 26 rows unchanged) | ✅ |
| floor aggregate drift (real 1-18) | 0 | ✅ |
| status=paid with paid_at NULL, updated after fix | 0 (337 legacy) | ✅ |
| refund>0 with odd status, updated after fix | 0 (4 legacy Aug–Sep 1) | ✅ |
| reconciler outbox leakage | 0 | ✅ |

**All legacy anomalies pre-date the fix and were not touched** — they belong to the eventual "Full data-integrity verification" stage of the sequence, not to this regression check.

## Residue / baseline (post re-run, all committed-clean)

```
floors max = 18 (no test rows)          test-range floors/orders = 0
order_payments = 61  (baseline)         payment_idempotency_keys = 1 (baseline)
outbox_events = 189 (baseline)          audit = 52 (baseline)
reservations = 86 (baseline)            inventory AVO = 410.000 (baseline)
real 1-18: 4=49/6g, 5=45/1g, 6/7 reserved, 8=48/4g, 9=7/1g, 10=38/3g, 15=10/1g, 16/17/18 reserved
```
Race orders (9995–9998) + their outbox (21) deleted by provenance. Zero footprint. ✅

---

## Observations (documented per STOP rule — NONE are fix regressions, NONE fixed here)

**O-1 (LOW, pre-existing, non-payment):** `dismiss_table_atomic` on an **occupied** table with an open bill returned `success:true` and released the table to empty (bill left dangling on the floor pointer). Verified dismiss reads **no payment tables**, so this is independent of D-6/D-7. Prior baseline run only dismissed empty tables, so it was never exercised. **Severity: LOW-MED. Repro:** create open order on table N (via direct floor+order insert), `dismiss_table_atomic(N,'x','empty',ACT,TRL)` → `success:true`, floor empty while order still open. *Candidate for the D-8/D-9 pass or a new D-10 ticket — not addressed in this re-run.*

**O-2 (D-8 layer shift, pre-existing):** the re-pay-after-full-refund block now surfaces at the **ledger trigger** (`validate_payment_order_balance`, "0.1.42") instead of the state machine (`INVALID_TRANSITION partially_refunded→paid`) — because v2 now inserts a ledger row before the UPDATE. Both layers independently block it (defense in depth). D-8's fix must account for BOTH: the refund terminal status (`partially_refunded` vs `refunded`), `reopen_order_atomic` on that state, AND the ledger trigger's existing-payments sum (it counts refund rows, so a re-pay on a refunded order needs the refund rows accounted — or the status path changed).

**O-3 (harness, not a defect):** `void_items_state_aware` with `product_name` key voids 0 items; the GOOD pre-fix baseline behaved identically. App void path uses order_item_id (`void_item_atomic`) — unaffected.

---

## Known defects status (unchanged by this pass — they are the NEXT sequence items)

| ID | Sev | Status after re-run |
|----|-----|---------------------|
| D-2 split | CRITICAL (known) | **unchanged** — location/org guard still rejects (re-reproduced) |
| D-5 takeaway/delivery create | CRITICAL (known) | **unchanged** (not re-triggered this pass — no create calls; still open per freeze report) |
| D-8 refund-chain | MED-HIGH (known) | **re-confirmed**, now with O-2 layer detail |
| D-9 qty recompute | LOW (known) | **unchanged** (RPC standalone still no total recompute; app-masked) |
| D-6 / D-7 | CRITICAL | **FIXED** (this pass proves regression-safe) |

## Recommendation

**D-6/D-7 fix is regression-safe → proceed to D-2 + D-5** per the approved sequence (then D-8 — with the O-2 trigger interaction — then D-9, then torture re-run AGAIN, browser/UI, L4+print, full data-integrity, FREEZE, UX).

**STOP.** No fixes applied in this pass. Awaiting dissection + GO on D-2/D-5.
