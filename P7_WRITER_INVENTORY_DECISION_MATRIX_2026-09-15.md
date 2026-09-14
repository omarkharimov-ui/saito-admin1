# P-7 CANONICAL WRITER INVENTORY + CONcurrency DECISION MATRIX (2026-09-15, READ-ONLY)

> P-7 step 1-2 (ratified 2026-09-15): inventory + decision matrix **before** any live
> concurrency proof. Zero DB mutation. All evidence: live route map (`.rpc()`/REST/
> PostgREST scan of `artifacts/saito-admin/src`), all 625 fn bodies, `FOR UPDATE`
> lock-order extraction, P-1..P-6 frozen contracts, D-Q4/D-Q6 ratified document-keep.
> Locked invariants for this phase:
>   **INV-DQ4** refund txn = `order_payments` (canonical) + `payments` (compat mirror), one txn.
>   **INV-DQ6** transition txn = `order_events` + `audit_logs_canonical` (SSOT) + `audit_logs` (compat mirror) + `operation_logs` + `outbox_events`, one txn.

## 1. A-class writer surface (7 tables) — who writes what

Live surface = **routes the UI can reach** (verified by route→RPC map, not by "fn exists"):

```
orders                    ← transition_order_atomic (state machine, all P-1 guarded moves)
                            complete_payment_atomic_v2 (→paid, FOR UPDATE orders)
                            add_item_atomic / correct_item_atomic / void_items_state_aware
                            (money columns: total_amount, subtotal, paid_amount)
                            cancel_table_orders / cancel_takeaway_order / cancel_delivery_order
                            reopen_order_atomic (P-6: →new + DELETE order_payments)
                            recalculate_order_payment_state (status + paid_amount + refund_amount)
order_items               ← add_item_atomic, correct_item_atomic, void_items_state_aware,
                            mark_item_ready_atomic, waste_order_item_atomic, kitchen_order_items_action,
                            return_to_stock, split_order_atomic
order_payments            ← complete_payment_atomic_v2 (INSERT captured)
                            refund_with_inventory (INSERT is_refund rows)
                            reopen_order_atomic (DELETE all rows)
floors / table_floors     ← activate_table_atomic, clear_table_atomic, dismiss_table_atomic
                            (FOR UPDATE table_floors ONLY), transition_table_status,
                            sync_table_order_aggregates, merge/transfer family
shifts                    ← open_cash_register / close_cash_register_v2 / clock_in/out_atomic_token
payment_idempotency_keys  ← complete_payment_atomic_v2 + refund_with_inventory (the ONLY
                            two keyed writers — P-4), prune_expired_idempotency_keys (pruner)
outbox_events             ← every writer above via emit_outbox_event (same-txn)
DUAL-LEDGER (D-Q4)        ← payments (mirror INSERT in refund_with_inventory, unique key)
DUAL-AUDIT (D-Q6)         ← audit_logs (mirror INSERT in transition_order_atomic)
```

**NOT in the live writer surface (frozen legacy, P-6 D-5/D-6 / P-5 D-2/D-7):**
`complete_payment_atomic`(10/11), `complete_payment_v4`, `process_order_payment`,
`refund_payment_atomic`, `void_payment_atomic`(3)/`void_payment_atomic_v2`(5),
`update_payment_status` (route `/api/payments/void` = legacy 2-row `payments` admin path),
`dismiss_table_state_aware`/`dismiss_table_v3`/`saito_dismiss_table`, `undo_operation_v4`.
They remain EXECUTE-restricted to postgres — P-7 does not test them (P-5/P-6 froze them).

### Per-writer properties (raw, from fn bodies)

| Writer | FOR-UPDATE lock order | Idempotency key | State via transition? | Audit (canonical/legacy/outbox) |
|---|---|---|---|---|
| `complete_payment_atomic_v2` | **orders** | ✅ (pay:…) | NO — guarded bare UPDATE (P-5 trigger validates →paid) | Y / — / Y |
| `refund_with_inventory` | **orders → order_items** | ✅ (refund:…) | NO — recalc fn + P-5 trigger | Y / **Y (INV-DQ4)** / Y |
| `reopen_order_atomic` | **orders** | NO (P-6: state-guard idempotency) | NO (→new not in registry as paid-move; P-6 authorized) | Y (P-6: log_audit) / Y (log_order_event→audit_logs, INV-DQ6 pattern) / Y (P-6: order outbox) |
| `transition_order_atomic` | **orders → table_floors** | NO | **YES (itself is the machine)** | Y / **Y (INV-DQ6)** / Y |
| `add_item_atomic` | **orders** | NO | NO (money-only) | — / Y / Y |
| `correct_item_atomic` | **orders → order_items** | NO | NO (money-only) | — / — / Y |
| `void_items_state_aware` | **orders → order_items** | NO | NO | — / — / Y |
| `dismiss_table_atomic` | **table_floors** (only) | NO | NO | — / — / Y |
| `cancel_*_order` family | **orders** | NO | NO (guarded bare UPDATE to cancelled) | Y / — / Y |
| `shifts` open/close | **shifts** | NO | NO | Y / — / Y |

**Lock-order conclusion (deadlock analysis):** every writer that locks both `orders` and
`table_floors` takes **orders first** (`transition_order_atomic`; legacy v1 too). No live
writer takes `table_floors → orders`. `dismiss_table_atomic` locks only `table_floors`.
→ **No 2-cycle among the live A-class writers**; the only cross-table ordering is
`orders → table_floors` (single direction). `orders → order_items` likewise single direction.

## 2. Concurrency decision matrix (the P-7 test battery, for ratification)

| # | Pair | Expected (invariant) | Mechanism | Class |
|---|---|---|---|---|
| C-1 | **pay ∥ pay** same order, same amount | 1× success (200), 1× **409** `IDEMPOTENCY_CONFLICT` (or replay-200 if same key); **ONE** `order_payments` row; `paid_amount` = amount exactly; `→paid` once; INV-DQ6 rows ×1 | P-4 key + P-5 trigger | MUST-PASS (mostly P-4-covered; re-assert cross-module) |
| C-2 | **pay ∥ pay** same order, diff amounts | 1× 200, 1× 409/422; no overpay | key (diff) then `ORDER_ALREADY_PAID`/P-5 trigger | MUST-PASS |
| C-3 | **pay ∥ cancel** same order | one wins; if cancel first → pay fails (state guard / P-5); if pay first → cancel blocked (paid not cancellable); no `paid`+`cancelled`. **Verified live path:** cancel UI = `DELETE /api/orders/:id` → `transition_order_atomic(p_new_status='cancelled')` (orders/route.ts:228) — the canonical machine, so both writers lock `orders` first | `orders` FOR UPDATE (both) + registry | MUST-PASS |
| C-4 | **pay ∥ add_item** (money race) | serialize on `orders`; final `total_amount` = original + item, `paid_amount` consistent (P-5 trigger: →paid needs op row) | both lock `orders` first | MUST-PASS |
| C-5 | **pay ∥ new-seat / activate_table** (dirty guard) | seat-activation cannot orphan a paid order; `table_floors` lock disjoint from pay (pay locks orders only) → no deadlock; table state consistent | `table_floors` vs `orders` (no cycle) | MUST-PASS |
| C-6 | **pay ∥ dismiss_table** | dismiss locks `table_floors`; pay locks `orders` → concurrent OK; invariant: a paid order is NOT dropped by dismiss (P-2/F contracts) | disjoint locks | MUST-PASS |
| C-7 | **pay ∥ drawer close** (shifts) | shift close FOR UPDATE `shifts` — disjoint; pay with active shift after close → shift-lock rejection (route-level) | disjoint + route guard | MUST-PASS |
| C-8 | **reopen ∥ pay** on reopened order | reopen → `new` + payments deleted; concurrent pay must land on `new` cleanly (idempotency fresh) OR fail pre-reopen (paid→pay blocked); never `paid`+deleted-ledger | `orders` FOR UPDATE both | MUST-PASS |
| C-9 | **refund ∥ refund** (same/diff key) | same key → 200 replay (idempotent); diff keys → 1× + cap rejection (`REFUND_EXCEEDS_PAID`); INV-DQ4: mirror row count == canonical is_refund count; no over-refund | P-4 key + net-paid cap + row lock (P-6 D-7) | MUST-PASS (P-6-covered, re-assert mirror parity) |
| C-10 | **refund ∥ pay** (additional) | serialize on `orders`; refund cannot exceed paid; pay on partially_refunded recalcs | `orders` first both | MUST-PASS |
| C-11 | **transition ∥ transition** (different target) | one wins the `FOR UPDATE`; second re-reads NEW state → registry rejection if now illegal (stale-state guard); INV-DQ6: exactly ONE transition's audit rows commit | `orders` lock + re-validate after lock | MUST-PASS |
| C-12 | **duplicate RPC** (identical call twice, no key: e.g. add_item, transition) | second call hits changed state → rejected (no double-item, no double-transition, no double-outbox) | state guard after FOR UPDATE | MUST-PASS |
| C-13 | **stale state** (read-then-write gap) | a fn that decides on status BEFORE `FOR UPDATE` must re-read after lock (verify in code: `transition_order_atomic` re-validates; `complete_payment_atomic_v2` re-checks paid) | code audit + adversarial test | MUST-PASS |
| C-14 | **deadlock smoke** (pay ∥ transition ∥ dismiss, 3-way) | no `deadlock detected` (40P01); ordering `orders`-first single-direction prevents cycles | lock-order analysis §1 | SHOULD-PASS (monitor for 40P01) |

**Rollback atomicity (INV-DQ4/DQ6) cross-cutting tests:**
- C-15: force mid-txn failure in refund (e.g. invalid item id late) → **both** `order_payments`
  and `payments` mirror rows absent; outbox absent; order unchanged.
- C-16: force mid-txn failure after transition lock (e.g. bad target state injected) →
  `audit_logs_canonical` + `audit_logs` + `outbox_events` all absent.

## 3. Decision matrix — what P-7 CHANGES vs only VERIFIES

Everything below is expected to **already hold** (P-1..P-6 frozen). P-7's value = **prove it
under concurrency** (parallel, not sequential) + catch the cross-module gaps sequential
gates can't see.

| ID | Area | P-7 action | Expected outcome |
|---|---|---|---|
| P7-1 | Lock ordering (all money/state writers `orders`-first) | **verify only** (code + 3-way smoke) | no 40P01; documented single-direction |
| P7-2 | pay∥pay / pay∥cancel / pay∥add_item / pay∥seat / pay∥dismiss / pay∥drawer | **live parallel proof** (C-1..C-7) | invariants hold; 409s real (P0001, not 40001) |
| P7-3 | transition∥transition + stale-state (C-11,C-12,C-13) | **live parallel proof** | one-wins, stale re-validated, single audit set |
| P7-4 | refund∥refund / refund∥pay + D-Q4 mirror parity (C-9,C-10,C-15) | **live parallel proof** | cap holds, mirror == canonical, rollback atomic |
| P7-5 | reopen∥pay (C-8) | **live parallel proof** | no paid+deleted-ledger ghost |
| P7-6 | Duplicate RPC without keys (C-12) | **live parallel proof** | state-guard rejection |
| P7-7 | D-Q6 dual-audit parity under concurrency (C-16) | **live parallel proof** | canonical and legacy rows commit/fail together |
| P7-8 | Zero NEW drift + zero residue after all parallel runs | verify | P-9 baseline (4 over-refund, etc.) unchanged; no P7_ staff/orders/keys left |

**If any C-test shows a RISK** (e.g. a writer that reads status before `FOR UPDATE` and
doesn't re-validate — C-13): that is a P-7 **fix candidate** → decision matrix entry →
ratify → implement → re-gate. Nothing is changed in this inventory phase.

## 4. Gate design (step 5, pre-planned)

`.p7-gate.cjs`: parallel `Promise.all`/`Promise.allSettled` pairs against live routes
(service + staff tokens, CSRF, active-shift fixtures per P-6 lessons), each pair asserts
the row counts / statuses / 409-ness above; batched fixtures; 4s settle; 3× transport
retry; zero-residue teardown; then full frozen reflow (A + P-1..P-6 + O + F + K-L3/K-L4).

## 5. Explicit NON-goals (ratified boundary)
- No P-9 work: `total_amount` vs `total_price` divergence, `table_floors` state
  proliferation, FK-less relationships, staff rollups, 2 stock models, 3 audit tables,
  `payments` SSOT — all untouched; P-7 only asserts the canonical path runs safely OVER them.
- No DB mutation in this phase. No new states. `git gc` untouched.
