# P-2 STATE CONTRACT — DRAFT FOR RATIFICATION (LIVE EVIDENCE)

**Date:** 2026-09-12 · **Method:** live DB — `pg_get_functiondef`, `pg_trigger`, `state_transitions` dump, live value distributions. **NO CHANGES.**
**Scope:** handover §5.2 P-2 — state registry + status transition rules for the financial/lifecycle domain. P-1 contracts untouched/frozen.

---

## 1. THE REGISTRY (SSOT candidate)

**`public.state_transitions`** — 129 rows, 5 entities:

| entity | rows | status set (from ∪ to) |
|---|---|---|
| **order** | 61 | draft, new, open, confirmed, in_kitchen, partially_ready, ready, preparing, served, payment_pending, paid, partially_refunded, refunded, cancelled, closed, voided |
| **item** | 102 | pending, sent, accepted, preparing, ready, served, completed, cancelled, voided, comped, wasted, recalled, reserved, hot, bar, sushi |
| **table** | 25 | empty, ordering, seated, dining, in_kitchen, ready, bill_requested, payment_pending, paid, cleaning, out_of_service, reserved, merged, occupied |
| **delivery** | 11 | pending, confirmed, preparing, ready, picked_up, in_transit, delivered, completed, paid, cancelled |
| **reservation** | 18 | …, archived, expired (terminal) |

Each row: `requires_role`, `requires_permission`, `requires_manager_override`, `description`, `is_active`.

**Consumers (live):** exactly 2 functions read it — `validate_transition(entity, from, to)` (lookup + rule return) and `get_valid_transitions` (admin/UI helper). Enforced by **trigger guards**:
- `trg_order_state_machine_guard` ON orders.status → `validate_transition('order', …)` — **enforced** ✅
- `trg_item_state_machine_guard` ON order_items.kitchen_status → `validate_transition('item', …)` — **enforced** ✅

The registry also drives canonical timestamps (paid_at/closed_at/cancelled_at/refunded_at/reopened_at) + coarse kitchen_status sync (paid/closed/refunded → kitchen_status='completed').

## 2. FINDINGS

### P2-F1 — `table` entity registry is ORPHANED (dead data)
The 25-row `table` set (`empty/ordering/seated/dining/…/bill_requested/payment_pending/paid/cleaning/merged`) **does not match the live `table_floors.status` model** (`empty/occupied/reserved/dirty/out_of_service/…` — prod: 26 empty / 4 occupied / 2 reserved). No function or trigger ever queries `state_transitions WHERE entity='table'`. Two different table-lifecycle models exist (F-frozen `empty/occupied/reserved(+dirty)` vs this newer design), and the registry one was **never wired**. Either it's an abandoned redesign or a future model — decision needed: **drop the 25 rows** or declare it the target model (big F-reopen, out of P-2 scope).

### P2-F2 — order registry carries LEGACY LABEL PAIRS with 0 live rows
`new`/`open` are dual labels for the same state (rows: `new->confirmed` + `open->confirmed`, `draft->new` + `draft->open`, plus `closed->new`/`closed->open`, reopens from paid→new/open). Live `orders.status` has **0** `new`/`open`/`draft`/`in_kitchen`/`payment_pending`/`partially_refunded`/`refunded`/`voided` rows (only `paid 315 · cancelled 295 · closed 90 · confirmed 7 · ready 1 · served 1`). Every live order state IS in the registry (no orphan values — registry ⊇ live ✅). Canonical label decision pending (F/O froze `empty/occupied` + `confirmed`; the pairs exist for compat).

### P2-F3 — PAYMENT state machine is HARDCODED in `update_payment_status` (dual SSOT)
The payment transition map lives **in the function body**, not the registry:
```
pending → [processing, cancelled]
processing → [authorized, captured, failed, declined, cancelled, unknown]
authorized → [captured, voided, cancelled]
captured → [settled, refunded, partially_refunded]
failed/declined → [pending, processing]
unknown → [captured, failed, cancelled]
refunded/settled/voided → terminal
```
Live `order_payments.status`: **NULL 45 (legacy) · pending 16 · captured 7** — no `failed/voided/refunded` ever produced in prod (external-processor path untested; P-10 greenfield confirmed). **No state-machine guard trigger on `order_payments`** (only `trg_validate_payment_balance` for amounts). So direct `service_role` writes can set ANY status string — the RPC path is guarded, the table is not. Registry-ification decision needed.

### P2-F4 — `orders.kitchen_status` = DERIVED, 9-value vocabulary, NOT the item registry
`sync_table_kitchen_status` aggregates from items + sets its own coarse values: `pending(388) · completed(108) · ready(68) · cancelled(59) · reserved(42) · null(31) · cooking(9) · partially_ready(2) · preparing(2)`. **`cooking` is not in the item registry** (0 rows) — it's only referenced in the aggregation FILTER (`preparing|cooking` = "in production") and in app UI (`TableCard`, `CartPanel`). `reserved` on orders.ks is a reservation-hold marker, not a kitchen state. The `cooking`→`preparing` alias question (which is canonical?) is open; the UI already treats them as equivalent (`preparing || cooking`).

### P2-F5 — `table_floors` has NO state-machine guard (by F design, but noted)
No trigger validates `table_floors.status` transitions against ANY registry. Protection = guard triggers only: `trg_table_release_guard` (paid tables need release), `trg_table_archive_guard` (F-04), `trg_validate_table_order_pointer`, `trg_table_archived_immutable`. The F-frozen model (`empty/occupied/reserved/dirty`) is enforced procedurally, not registry-style. (F is frozen — recorded as contract fact, not a P-2 change.)

### P2-F6 — `cash_drawer_sessions` / `shifts` have NO state machine at all
- drawer: only `trg_cash_drawer_staff_org` (org check). States live: **open 4 / closed 2** — the 4 stuck `open` sessions (P-11 territory) are unprotected by any transition rule; `close_cash_register(v1/v2)` + `reopen_cash_register` are the only writers.
- shifts: `trg_shift_no_overlap` + `trg_shift_active_staff` + org check. States live: **CLOSED 98** (0 open — 045 invariant holds). `shift_status` is a PG enum (so invalid strings are rejected at DB level — the one state column with real type enforcement).
- `approval_requests`: pending 29 / approved 9 — no state guard, no registry.

### P2-F7 — `refund` order-state transitions exist in the registry but the live refund path may never exercise them
Registry: `paid->refunded`, `paid->partially_refunded`, `partially_refunded->refunded`, `closed->refunded` (all `refund.approve` + manager override). But live: **0 orders in refunded/partially_refunded**; `refund_with_inventory` writes a refund `order_payment` row (`is_refund=true`) — whether it ALSO transitions `orders.status` needs verification in P-2 implementation (if it doesn't, the registry rows are aspirational and reconciliation uses amounts, not status).

## 3. PROPOSED FROZEN STATE CONTRACT (for ratification)

1. **`state_transitions` = the ONLY transition SSOT** for `order` and `item` entities (already enforced via guards — freeze as-is; any future state/rule change = registry row, not code).
2. **Payment states:** ratify the `update_payment_status` map as the **frozen payment state machine**; decision: (a) migrate the map INTO `state_transitions` (entity='payment', + a guard trigger on order_payments.status) for single-SSOT, or (b) keep hardcoded-in-RPC but declare the map frozen + add the guard trigger (table-level enforcement). **Recommend (a)** — consistency with order/item, and it closes the "direct write any status" gap (P2-F3).
3. **`table` entity rows (25):** decision — **drop** (orphaned, mismatched model, 0 consumers) vs declare target model (out of P scope). **Recommend: drop in P-2 cleanup** (document in F notes that the F-model is procedural).
4. **`orders.kitchen_status` derived vocabulary:** freeze the 9-value set + `cooking≡preparing` alias rule (UI already does); document that it is AGGREGATE, not item-level (item states stay in the `item` registry).
5. **NULL legacy `order_payments.status` (45 rows):** frozen as legacy (Jul 30–Aug 9 era); NOT to be backfilled without a ratified decision (same rule as the 20/25 reconciliation gap).
6. **Drawer/shift/approval:** declare their state sets frozen-by-enum/procedure (shift already enum-enforced); drawer state-machine = explicit P-8 scope (don't build it in P-2).
7. **Reopen rules:** registry already encodes them (cancelled/new, closed/new|open, paid/new, refunded→new, voided→new, all `orders.edit` + manager override) + `reopened_at` timestamp in the guard — freeze as the canonical reopen contract.

## 4. EVIDENCE REPRODUCERS
- `SELECT * FROM state_transitions ORDER BY entity, from_status, to_status;` (129 rows)
- `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('validate_transition','trg_order_state_machine_guard','trg_item_state_machine_guard','update_payment_status','sync_table_kitchen_status');`
- `SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ... WHERE c.relname IN ('orders','order_items','table_floors','order_payments','cash_drawer_sessions','shifts');`
- Live value distributions: `orders.status` (6 values), `orders.kitchen_status` (9), `order_items.kitchen_status` (8), `table_floors.status` (3), `order_payments.status` (3 incl NULL), drawer (2), shift (1), approval (2).

**Status: DRAFT — awaiting ratification of §3 items 2/3/7 before any migration.**
