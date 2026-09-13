# P-6 Refund / Void / Reopen — INVENTORY + DECISION MATRIX (2026-09-13)

> P-5 is 🔒 FROZEN (commit `4acf085`). P-6 scope (ratified model, HANDOVER §5.2-P6):
> **full/partial refund, void, refund-after-close, reopen semantics** — each must map to the
> registry states with audit + outbox, and be atomic across Order ↔ Payment ↔ Inventory ↔
> Audit ↔ Outbox.
> This file is the **inventory** (step 1) + **decision matrix** (step 2). **No DB change
> has been made.** Every number below is a raw live query result (pooler, read-only).

---

## 1. THE refund / void / reopen SURFACE (who does what)

| # | Writer | What it does | Guard (order state) | Inventory | RBAC inside fn | Idempotency | Audit | Outbox |
|---|---|---|---|---|---|---|---|---|
| R1 | `refund_with_inventory` (11-arg, canonical **item-level**) | refunds one `order_items` row (qty+amount), `is_refund` op-row, fate = `waste`/`return_to_stock` | `status IN ('paid','partially_refunded')` (line 51) + item `kitchen_status IN ('ready','completed','served')` (line 62) | ✅ reverses consumption (idempotent `ON CONFLICT DO NOTHING`) | ✅ `p1_actor_allowed_at_location` (line 48) | ✅ P-4 namespace=`refund` (line 81) | ✅ `log_audit('refund_with_inventory')` | ✅ `emit_outbox_event(inventory …)` |
| R2 | `complete_payment_atomic_v2` (14-arg, **order-level refund** via `is_refund:true`) | adds a refund op-row, `recalculate_order_payment_state` re-derives status | `v_refund_total > net_paid → RAISE REFUND_EXCEEDS_PAID` (raw: line "IF v_refund_total > COALESCE(paid_amount,0)-COALESCE(refund_amount,0)+0.01") | — (no item fate) | ✅ (P-1 location) | ✅ P-4 (refund ns) | ✅ | ✅ |
| R3 | `refund_payment_atomic` (6-arg) | inserts a refund row with **`status='success'`** (NOT a payment-registry state) | `validate_actor` only | — | — | — | — | **dead code — no route** (P-5 D-7 flagged; confirmed again here) |
| V1 | `void_items_state_aware` (4-arg) ← `/api/orders/void` (route RBAC `pos.void`) | zeroes `order_items` (`kitchen_status='voided'`), recalcs `orders.total_amount`; if **all** items voided → order `status='cancelled'` | `status IN ('paid','closed','refunded') → reject` (line 27) | — (items zeroed, no stock move) | ❌ (route `pos.void`) | — | ✅ `log_audit('void_items')` | ❌ **no outbox** |
| V2 | `void_payment_atomic_v2` (5-arg) | zeroes/deletes items | `status IN ('active','ready','confirmed')` — **`active`/`ready` are NOT live order statuses** (raw: `orders.status IN ('active') count=0`) | — | ❌ | — | ✅ | ❌ — **effectively dead** (no route calls it; its status check is stale) |
| V3 | `update_payment_status` (4-arg) ← `/api/payments/void` (route RBAC `payments.void`) | updates the **legacy `payments`** table row status (its own transition map) | legacy transition map | — | ❌ (route `payments.void`) | — | ✅ `record_payment_attempt` | — **legacy table only** (`payments` rows = 2) |

**Who sets `status='voided'` on an order (raw):** `dismiss_table_state_aware`,
`void_items_state_aware`, `refund_with_inventory` (both overloads), `void_order_item_atomic`,
`record_item_waste`. Note: `void_items_state_aware` sets the ORDER to **`cancelled`** (all
items gone), and sets the ITEMS to `voided` — an **order-level `status='voided'`** is only
written by `dismiss_table_state_aware` / `void_order_item_atomic`.

### Route → permission (RBAC) map
| Route | Route RBAC | Calls | Fn-internal RBAC? |
|---|---|---|---|
| `/api/orders/refund` (Mode 1 item) | `payments.refund` + `refund.approve` if >50 | `refund_with_inventory` (11-arg) | ✅ |
| `/api/orders/refund` (Mode 2 order) | `payments.refund` + `refund.approve` if >50 | `complete_payment_atomic_v2` (`is_refund:true`) | ✅ |
| `/api/orders/void` | **`pos.void`** | `void_items_state_aware` | ❌ |
| `/api/orders/reopen` | **`requireAuth` ONLY** (+ `requireActiveShift`) | `reopen_order_atomic` | ❌ **NONE** |
| `/api/payments/void` | `payments.void` | `update_payment_status` (legacy `payments`) | ❌ |

Permission holders (raw): `pos.void`=admin,cashier,manager,owner,superadmin ·
`payments.refund`/`payments.void`/`order.void`=admin,manager,owner,superadmin ·
`orders.edit`=admin,cashier,kitchen,manager,owner,superadmin.

### `reopen_order_atomic` (4-arg) — the single most dangerous writer
```
set_config('app.payment_ledger_reopen','on',true)   -- trusted flag
validate_actor(p_performed_by)                        -- identity only, NO RBAC
FOR UPDATE order
IF status NOT IN ('paid','completed','partially_refunded','refunded') reject
for each order_item: _inventory_reverse_item(item,'reopen',…)   -- stock return
DELETE FROM order_payments WHERE order_id=…                    -- FULL PAYMENT REVERSAL
UPDATE orders SET status='new', paid_amount=0, cash/card/tip=0, paid_at=NULL, version+1
INSERT operation_logs ('reopen_order')
-- NO log_audit, NO outbox, NO has_permission, NO location check
```

---

## 2. REGISTRY EDGES (raw `state_transitions`, `entity='order'`)

```
VOID:  new/open/confirmed/draft/payment_pending → voided [order.void / payments.void]
       in_kitchen/preparing/ready/served/partially_ready → voided [order.void + mgr override]
VOID out:  voided → cancelled [orders.cancel]   ·   voided → new [orders.edit + ovr] (undo)
REFUND:  paid → refunded / partially_refunded   [refund.approve + ovr]
         closed → refunded / partially_refunded [refund.approve + ovr]   (refund-after-close)
         partially_refunded → refunded          [refund.approve + ovr]
REFUND out: refunded → cancelled [orders.cancel] · refunded → new [orders.edit+ovr] (reopen)
            partially_refunded → cancelled/closed/confirmed/new/refunded
REOPEN:  paid → new / confirmed [orders.edit + ovr]
         closed → new / open    [orders.edit + ovr]
         refunded → new         [orders.edit + ovr]
         partially_refunded → new [orders.edit]      · cancelled → new [orders.edit + ovr]
```
No self-edges. `draft/new/open → paid` are the only **→paid** edges (P-5 guard enforces a
captured record — consistent). **No `→paid` edge exists from `voided/refunded/closed`** (P-5
holds).

---

## 3. BASELINE DATA INARIANTS (raw — pre-existing, do NOT regress)

| Invariant | Raw count |
|---|---|
| `orders` status `refunded` | **0** |
| `orders` status `partially_refunded` | **0** |
| `orders` status `voided` | **0** |
| `orders` status `completed` / `payment_pending` / `active` | **0 / 0 / 0** (dead/legacy states, unused) |
| `order_payments` rows `is_refund=true` | **0** (refund path **never executed in production**) |
| refunded/partial **without** a refund op-row | **0** |
| `refund_amount > paid_amount` | **4** (legacy — all have `paid_amount=0`; the P-5 D-5 residual) |
| `voided` order with a non-refund payment | **0** |
| `partially_refunded` with stale `paid_amount` | **0** |

**Interpretation:** the refund/void/reopen state space has **zero live production rows** —
these paths have effectively never run in prod (consistent with P-4/P-5: the payment path
is new-era, the refund/void/reopen code exists but is unexercised). P-6 must make the
*forward* contract airtight + prove the invariants, and **not** touch the 4 legacy
`refund_amount>paid` rows (P-9 residual).

---

## 4. CONCURRENT-REFUND & CROSS-MODULE ANALYSIS

- **Order-level refund (R2)** over-refund guard: `v_refund_total > net_paid → RAISE`. The
  order is `FOR UPDATE`d inside `complete_payment_atomic_v2`, so **two concurrent order-level
  refunds serialize on the row lock** → the second sees the updated `refund_amount` → the
  net-paid cap holds. ✅ (needs a live concurrency test to confirm, like P-4's).
- **Item-level refund (R1)** has NO `refund.approve`/net-paid cap in the fn — it trusts the
  route (`payments.refund`) + the item qty/price. Concurrent item refunds are bounded by the
  item's remaining quantity (reversal is idempotent `ON CONFLICT DO NOTHING`). ✅ structurally.
- **Reopen double-execution**: `reopen_order_atomic` deletes op-rows then sets `status='new'`.
  A **second** reopen on the now-`new` order is rejected by the `status NOT IN (paid,
  partially_refunded, refunded,…)` check → **naturally idempotent** (no double reversal).
  Inventory reversal is idempotent (`net_to_reverse = consumption − existing_reversals`,
  `ON CONFLICT DO NOTHING`). ✅ structurally (needs a live test).
- **Reopen after partial refund**: `partially_refunded → new` is a legal registry edge;
  `reopen_order_atomic` reverses inventory for all items + deletes the (partial) refund rows
  too (`DELETE FROM order_payments WHERE order_id`) → **both the payment AND the refund are
  reversed** (full clean slate). Correct, but must be asserted in the gate.
- **Void ↔ refund**: `void_items_state_aware` rejects `paid/closed/refunded` (line 27) → a
  voided item on a paid order is impossible. ✅

---

## 5. DECISION MATRIX — **STOP: ratify before any DB change**

| ID | Finding (§) | Options | **Recommendation** |
|---|---|---|---|
| **D-1** ⛔ | **`/api/orders/reopen` has NO RBAC** (route = `requireAuth` only; `reopen_order_atomic` has no `has_permission`/location). Any staff with an **active shift** (cashier, kitchen, waiter) can trigger a **full payment reversal** (`DELETE FROM order_payments`). Registry says `paid→new`/`refunded→new` need `orders.edit` + **manager override**. | (a) Route: `requirePermission('orders.edit')` + manager-override check (mirror the registry). (b) Fn: add `has_permission` inside `reopen_order_atomic` (SSOT). (c) Both. | **(c) Both**: route `requirePermission('orders.edit')` + a **manager-override gate** (reuse the P-1 `MANAGER_OVERRIDE_REQUIRED` pattern) for `paid/refunded/partially_refunded` reopens; AND a `has_permission` check inside the RPC so a bare PostgREST call is also gated. This is the single highest-value P-6 fix (unauthorized full money reversal). |
| **D-2** | `reopen_order_atomic` emits **`operation_logs` only — no `log_audit`, no outbox** (§1). A financial full-reversal with no canonical audit + no client resync. | (a) Add `log_audit('reopen_order', …)` (before/after) + `emit_outbox_event('order', …)`. (b) Keep as-is. | **(a)**: add `log_audit` (mirroring the refund RPC) + an `order` outbox event so the POS resyncs. Financial mutation with no audit = the exact gap P-9 is meant to close, but reopen is live now — fix it in P-6. |
| **D-3** | `reopen_order_atomic` **`DELETE FROM order_payments`** via the trusted `app.payment_ledger_reopen` flag — the sanctioned P-3 path, but it's a hard delete of the ledger (financial immutability ground rule: "corrections are append-only"). | (a) Keep the delete (it's the ratified P-3 trusted-reversal path; the full reversal is the intent of a reopen). (b) Switch to soft-void (new reversal rows) — **out of P-6 scope, would touch P-3/P-9**. | **(a) Keep** — it is the **already-ratified P-3 trusted full-reversal path** (not a P-6 regression). D-1+D-2 make it *authorized + audited + synced*; the delete-vs-append model is a **P-9 reconciliation decision**, flagged but NOT changed here. |
| **D-4** ⚠️ | `void_items_state_aware` emits **no outbox** (§1 V1) — a void (order→cancelled / total change) is not broadcast to other clients. | (a) Add `emit_outbox_event('order', …)` on the void path. (b) Keep (audit-only). | **(a) Add outbox** on the order-total/status change in `void_items_state_aware` (mirrors the refund RPC). Small, consistent with ground rule "every mutation → outbox". |
| **D-5** ⚠️ | `void_payment_atomic_v2` guards on **stale statuses** `('active','ready','confirmed')` — `active`/`ready` are not live order states (raw count 0) → the guard is effectively **no-op** (would void any non-matching status? actually it *requires* one of those, so it can't void a `confirmed`-only correctly set — it's **dead**). | (a) Leave dead (no route). (b) REVOKE EXECUTE (freeze-dead, like P-5 D-2) to prevent a bare-PostgREST call. | **(b) REVOKE EXECUTE** (postgres keeps it) — frozen-dead, same class as P-5 D-2. No live route, stale guard = liability. |
| **D-6** | `refund_payment_atomic` inserts `status='success'` (not a payment-registry state) — dead code, no route. | (a) Leave. (b) REVOKE EXECUTE (freeze-dead). | **(b) REVOKE EXECUTE** (frozen-dead; flagged P-5 D-7 → now closed). |
| **D-7** ✅ | Concurrent order-level refund: net-paid cap + row-lock serialize it (§4). **No change needed** — verify with a live concurrency test in the gate. | — | **Verify only** (2× concurrent same-order refund → exactly-once cap, no over-refund). |
| **D-8** ✅ | Reopen idempotency + double-reversal guard (§4) — structurally sound. | — | **Verify only** (double reopen rejected; inventory not double-reversed; partial-refund reopen clears both rows). |
| **D-9** | `/api/payments/void` → `update_payment_status` on the **legacy `payments`** table (2 rows). | (a) Leave (legacy, P-9). (b) Note. | **(a) Leave** — legacy table, P-9 disposition; not a P-6 financial path. Flag only. |

**Out of scope (explicit):** no ledger delete-vs-append model change (D-3→P-9), no cash
drawer (P-8), no processor/webhook (P-10), no backfill of the 4 legacy `refund>paid` rows
(P-9). **No ERRCODE='40001'** (P-4 lesson — any new `RAISE` uses P0001/default). **No new
order states** (no hidden 4th-state; `dirty`'s lesson).

---

## 6. PROPOSED GATE BATTERY (after ratification) — `.p6-gate.cjs`
1. **Refund requires paid**: refund a `confirmed` (unpaid) order → rejected (R1 line-51 / route 400).
2. **Item-level refund (Mode 1)**: paid order → refund 1 item → 1 `is_refund` op-row, order `partially_refunded`, item reversed (stock), audit + outbox present.
3. **Order-level refund (Mode 2)**: paid → refund part → `partially_refunded`; refund rest → `refunded`.
4. **Over-refund block**: refund > net-paid → `REFUND_EXCEEDS_PAID` (R2 cap), zero mutation.
5. **Concurrent order-level refund** (D-7): 2× same order in parallel → no over-refund (cap holds under the row lock).
6. **Void un-paid order**: `void_items_state_aware` on a `confirmed` order → items zeroed, order → `cancelled`, audit present; voiding a **paid** order → rejected (V1 line-27).
7. **Void outbox** (D-4): after a void that changes the order, an order outbox event exists.
8. **Reopen RBAC** (D-1): a **cashier** (no `orders.edit`-override / no manager) calling reopen on a paid order → **403** (route) AND a bare `reopen_order_atomic` RPC → `has_permission` reject (D-1b).
9. **Reopen (authorized)** (D-1/D-2): a **manager** reopens a paid order → `status='new'`, all op-rows gone, inventory reversed, **`log_audit` + outbox present** (D-2), **exactly one** reversal (not double).
10. **Reopen idempotency** (D-8): second reopen on the now-`new` order → rejected (no double reversal, no orphan stock).
11. **Reopen after partial refund**: partial-refunded order → reopen → both the payment and the refund rows cleared, inventory net-consistent, `status='new'`.
12. **Frozen-dead** (D-5/D-6): `void_payment_atomic_v2` + `refund_payment_atomic` EXECUTE = postgres only.
13. **Zero NEW drift**: baseline (`refunded=0/partial=0/voided=0/refund_rows=0`, the 4 legacy `refund>paid`) **unchanged** after a full refund/void/reopen cycle.
14. **Zero residue** (P6_ staff inactive, probe orders/op-rows/keys gone, table reset).

**Frozen ecosystem reflow (all re-run):** P-1 29/29 · P-2 13/13 · P-3 25/25 · P-4 19/19 ·
**P-5 10/10** · O 38/38 · F 35/35 · K L3 8/8 · K L4 16/16. (Watch O-gate trigger kill-hazard:
re-check `trg_orders_sync_table_floors`/`trg_order_table_location` = O after the O-gate.)
