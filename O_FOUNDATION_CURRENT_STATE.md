# O — ORDERS FOUNDATION + CURRENT-STATE (dependency-impact) AUDIT (2026-09-11)

> **Audit-only. NO code/fix in this document** — frozen workflow:
> `O Foundation/Current-State Audit → business contract gate → (then) fix batch`.
> This is a **dependency-impact** audit: how the **frozen** A / E / S / F changes land on Orders.
> Every claim = REAL DB (`jbxmlnsicbfkbsatnoej`) + repo source (60+ probes).
> **A / E / S / F = FROZEN** (validate_actor, has_permission, authorize, set_session_staff,
> state machine triggers, F-05 pointer, F-10 atomic merge/transfer — consumed read-only).
> "O = 85%"-style guesses discarded; this is the evidence-backed picture.

---

## ARCHITECTURE — current contract (what actually exists & works)

### Entity
| Table | Rows | Role |
|---|---|---|
| **`orders`** | 706 | THE order entity (90+ cols). `location_id` **NOT NULL**, `organization_id` **NOT NULL**; invariant FKs `orders_location_org_invariant`, `orders_station_loc_org_invariant`; `table_number` int (soft ref, not a uuid FK); `idempotency_key`, `version`. |
| `order_items` | — | items; RLS loc-scoped **via parent order**; `trg_validate_order_item_price` (total = unit×qty), `trg_item_money_lock`, `trg_item_state_machine_guard`, `trg_kds_ticket_emit`. |
| `kds_tickets` / `kitchen_tickets` | — | KDS; RLS loc-scoped via parent order; `enforce_kitchen_ticket_order_location`. |
| `order_payments`, `order_events`, `cancelled_orders` | — | RLS ON, loc-scoped. |

**Live data:** 706 orders, **1 distinct location** (`orders_loc_dist=1`, `tables_loc_dist=1`).
7 open orders on 1 table. 68 table-orders reference table numbers with **no matching
`table_floors` row in the same location** (the F-documented orphan set, tables 11–30 — not re-opened here).

### Order state machine — **real, data-driven, and TRIGGER-enforced**
- `state_transitions` has **61 active order rules**, and — unlike the table rules before F-01 —
  the order rules **carry `requires_permission`**: `orders.edit`, `orders.cancel`, `payments.create`,
  `order.void`, `refund.approve`, `payments.void`.
- **`trg_order_state_machine_guard`** (BEFORE UPDATE OF status, fires for **every** caller incl.
  service_role) → `validate_transition('order', old, new)` → RAISE on invalid; sets canonical
  timestamps (`paid_at/closed_at/cancelled_at/refunded_at/reopened_at`); coarse `kitchen_status` sync.
  **This is solid — transition VALIDITY is enforced for all paths.**
- **BUT the trigger enforces VALIDITY ONLY — it never reads/enforces `requires_permission`.**
  See O-01.

### The three order-mutation RPC families (evidence)
| RPC | Called by routes? | set_session_staff | authorize(perm+loc) | location scope | audit+outbox |
|---|---|---|---|---|---|
| **`transition_order_atomic`** (`p_token`…) | **NO — 0 callers (DEAD)** | ✅ | ✅ (+ manager_override) | ✅ (`v_order.location_id`) | ✅ (order_events + audit_logs + operation_logs + outbox) |
| **`transition_order_status`** (`p_order_id`,`p_new_status`,`p_performed_by`…) | **YES — LIVE** (via `/api/rpc/transition_order_status` + `useOrderStateMachine`) | ❌ | ❌ | ❌ (table lookup by `table_number` only) | ✅ logs, ❌ no outbox, ❌ no token identity |
| **raw service-role `PATCH /orders`** (orders/route.ts `action=delete`→cancelled, `addItems`→confirmed) | **YES — LIVE** | ❌ | ❌ | ❌ | ❌ (only trigger timestamps) |

`transition_order_atomic` is the **golden** implementation (exactly the F-01 fix pattern: token →
lock → validate → authorize(location) → override gate → atomic update → audit → outbox). It exists
and is correct — **but nothing calls it.** The live path is the unguarded twin.

---

## FINDINGS (evidence-backed)

### 🔴 O-01 — Order `requires_permission` is enforced by NO live path; identity is spoofable
**Evidence:**
- `state_transitions` order rules carry `requires_permission` (orders.cancel = admin/superadmin;
  payments.create = cashier/manager/admin/superadmin; refund.approve; order.void; payments.void).
- `trg_order_state_machine_guard` source: **no** `authorize()` / `has_permission()` / `current_staff_id()`
  call — validity only.
- The only function that enforces the permission is **`transition_order_atomic`** → **0 route callers**
  (grep: no `transition_order_atomic` anywhere in `src`). It is dead code.
- **LIVE** path = `transition_order_status` (source: `validate_transition` → `UPDATE orders SET status`
  → `transition_table_status`; **no** session/permission/location). Reached by
  `app/admin/pos/page.tsx` (`orderStateMachine.transition`) + `OrderDetailSheet.tsx` →
  `/api/rpc/transition_order_status`.
- **Identity spoofing:** `/api/rpc/transition_order_status/route.ts:15` passes
  `p_performed_by: body.p_performed_by || null` (client-supplied), never `auth.user.id`.
  `transition_order_status` writes that value into `audit_logs.performed_by` / `log_order_event`.
**Impact:** any active staff (waiter / host / kitchen / bartender — all pass `requireAuth`) can,
through the live path, drive **any** order to `paid` (fires `fn_record_cash_payment` → cash-drawer
log + releases the table) or `cancelled`, **with a spoofed `performed_by`** and **no permission
check**, even though the registry says cancel is admin/superadmin-only and pay needs `payments.create`.
**Same class as frozen F-01 (fixed) and S-02 IDOR (fixed)** — the permission column is simply not wired
to the live path for orders.

### 🔴 O-02 — Order-mutation RPCs are exposed to the `authenticated` role on PostgREST (raw-RPC bypass)
**Evidence:** `has_function_privilege('authenticated', …)` = **Y** on ~20 order functions:
`transition_order_status`, `transition_order_atomic`, `cancel_table_orders`(×2), `create_order_with_items`,
`create_or_append_order`, `split_order_atomic`, `split_order_by_items_atomic`, `add_order_items`,
`cancel_order_items`, `mark_order_ready/completed/all_served`, `update_order_item_quantity/status`,
`void/waste/comp_order_item_atomic`, `recall_order_items`, `reopen_order`, `assign_order_staff`,
`prepare_order_items`, `get_next_order_number`, `sync_table_order_aggregates`, `accept_order_atomic`,
`calculate_order_total_v3`. `anon` = **N** on all mutating ones (42501 confirmed).
**Impact:** a client holding **any** staff JWT (role `authenticated`) can call
`POST /rest/v1/rpc/transition_order_status` (or `cancel_table_orders`, `create_order_with_items`,
`split_order_*`) **directly**, bypassing the Next.js route's `requireAuth`+CSRF+rate-limit — and those
functions have **no internal permission/location gate** (O-01). The raw-RPC bypass re-audit question for
orders = **YES, reachable.** (DB-level closure = `REVOKE` from `authenticated`, same as S-02/F-01.)

### 🔴 O-03 — QR dine-in order creation is dead (DB-blocked) and lacks route authz
**Evidence:**
- `orders/qr/route.ts` `POST`: **no** `requireAuth()`/`requirePermission()` call in the handler body —
  only an in-memory IP rate-limit. Inserts an order with `table_number` but **no** `location_id`/
  `organization_id` (both NOT NULL).
- Live DB test (BEGIN/ROLLBACK, no residue): INSERTing an order for table 8 with NULL location/org is
  **BLOCKED** by `trg_order_table_location` → *"Order table 8 must belong to same location/organization
  as the order (order location=<NULL> …, table location=f1f83…)".*
- Data: `orders WHERE order_type='qr_order'` = **0 rows**; `order_items` on qr orders = **0**.
**Impact:** the QR customer-order flow (roadmap: QR anon customer access) is **100% non-functional** —
every insert raises at the trigger. It is also the least-guarded route (no permission gate). Fix = part
of O-04 (resolve location from the table/session) + add the intended authz.

### 🔴 O-04 — Order creation/append is NOT location-scoped (the **deferred F-03 boundary**, still open)
**Evidence:**
- `orders/route.ts POST` resolves the order's org/location from
  `table_floors?table_number=eq.X&…&limit=1` — **no `location_id` filter** → in multi-location, picks an
  arbitrary table with that number → order stamped with the wrong location.
- Append path: `orders?table_number=eq.X&status=not.in.(final)&order=created_at.asc&limit=1` — **global**,
  not location-scoped → can append to another location's open order.
- `create_or_append_order` / `create_order_with_items`: `SELECT … FROM orders WHERE table_number=p_table_number`
  and `… FROM table_floors WHERE table_number=p_table_number FOR UPDATE` — **no location predicate**.
  They do not set `location_id`/`organization_id` (rely on the table trigger).
- `walkin_atomic`: resolves `v_table … WHERE table_number=p_table_number FOR UPDATE` (global) then uses
  `v_table.location_id/organization_id` — safer, but the **table lookup is still global** (ambiguous in multi-loc).
**Impact:** latent today (1 location has tables) but this is exactly the F-03 deferral called out in the
F freeze. It must be closed in O: every order-creation/append path scoped to the session's **active location**.

### 🟠 O-05 — Order cancel = raw service-role `PATCH`, TOCTOU, no `orders.cancel` permission
**Evidence:** `orders/route.ts` `action=delete`: reads status (blocks only `paid/cancelled/refunded`),
then `PATCH {status:'cancelled', cancelled_at}` — **no `FOR UPDATE` lock** between check and write,
**no `orders.cancel` permission** (only `requireAuth` + a `kitchen`-role restriction).
**Impact:** any staff can cancel any non-paid order (registry: cancel is admin/superadmin-only); a
concurrent cancel-vs-pay can race (no row lock). Should route through a permissioned atomic RPC.

### 🟠 O-06 — O writers set `table_floors.status` via raw service-role `PATCH`, bypassing the table state machine
**Evidence (O-owned writers that set table status directly):**
- `mark_order_ready` (RPC) → `UPDATE table_floors SET status='ready'`
- `walkin_atomic` → `status='reserved'` / `'occupied'`
- `orders/route.ts` → `status='occupied'` (create + append + guest_count paths)
- `orders/qr` → `status='occupied'`
- `bill-request/route.ts` → `status='payment_pending'`
- `table_floors` has **0 state-machine triggers** (verified). `transition_table_status` is only invoked
  explicitly by `transition_order_status`; raw `PATCH` skips it entirely.
- `occupied` is a machine state but **`empty → occupied` is NOT a valid transition** (table machine
  has `empty→ordering/seated/reserved/out_of_service` only). Production relies on the **absence** of a
  table state-machine trigger to set `occupied`.
**Impact (F-boundary, NOT re-opening F):** the "formal data-driven table state machine" is bypassed by
all of O's own writers; the *effective* table guards are only `table_release_guard` (no release while
open orders / active pointer) and `table_archived_immutable`/`table_archive_guard` (F-04). This is an
O-impacts-F observation. **Recommendation: keep F frozen; do not add a table state-machine trigger in O**
(it would re-open F). Confirm in the gate.

### 🟡 O-07 — F-04 archived-table guard is bypassed on the NULL-location INSERT path
**Evidence:** `order_table_archive_guard` (BEFORE INSERT on orders) checks
`SELECT is_archived … WHERE table_number=NEW.table_number AND location_id=NEW.location_id`.
When an order is inserted with **NULL** `location_id` (the O-04/O-03 no-location path),
`location_id = NULL` never matches → the archived check is **skipped**.
**Impact:** latent; an order could be created against an archived table if the location were left NULL.
Resolves automatically once O-04 stamps the real location on insert.

### 🟡 O-08 — Cross-location **read** isolation gap on order list routes
**Evidence:** `/api/orders` GET and `/api/kitchen/orders` GET fetch with the service role and **no
`location_id` filter** (and no `requirePermission`). `/api/kitchen/orders` has **no route-level auth at all**
(only the global session middleware).
**Impact:** any staff sees **all** locations' orders/tables (single-location today → latent; the F-03 read
twin for orders). `/pos/tables` is already location-scoped (F-03) — the plain `/orders` + `/kitchen/orders`
lists are not.

### 🟢 O-09 — Positive (verified solid, keep as-is)
- **Order state-machine VALIDITY** enforced by trigger for all callers (incl. service-role) — the exact
  gap F-01 had is NOT present for order *validity*.
- **F-05 pointer recompute is location-aware:** `sync_table_order_aggregates` selects the live pointer with
  `o.location_id = v_cur.location_id` and is guard-safe vs `table_release_guard`. Correct.
- **F-10 atomic merge/transfer/unmerge** are location-scoped + `floor.manage` (frozen) — consistent with
  the orders contract.
- **Payment core** (`complete_payment_atomic_v2`, `/orders/pay`) = `payments.create` + CSRF + rate-limit +
  idempotency + refund/overpay guards (frozen D-6/D-7) — well-guarded.
- **Item integrity:** price-snapshot trigger, money-lock trigger, item state-machine guard, KDS emit trigger,
  inventory reversal on cancel/reopen (`_inventory_reverse_item`) — all present and firing.
- **Outbox / audit / loyalty spine:** `trg_order_loyalty_spine`, `order_events`, `outbox_events`
  (`aggregate_type='order'`) keyed on status change — consistent.

---

## REACHABILITY SWEEP — "is any old O implementation still reachable?" (answer: **YES, 3 paths**)
| Path | Reachable now? | Why |
|---|---|---|
| `transition_order_status` (no perm, spoofable identity, no loc) | **YES** | `authenticated` EXECUTE + live route + `useOrderStateMachine` (POS) |
| Raw `PATCH /orders` status (cancel→, addItems→confirmed) via service role | **YES** | orders/route.ts (14 raw order refs), no permission on delete |
| Direct PostgREST `rpc/<order-fn>` with a staff JWT | **YES** | O-02 grants |
| `transition_order_atomic` (golden) | reachable but **unused** | 0 callers |
| `create_or_append_order` / `create_order_with_items` / `walkin_atomic` | reachable | not location-scoped (O-04) |

---

## BUSINESS CONTRACT GATE (decisions needed — do NOT invent)

**G1 (O-01) — Wire permission + real identity + location into the LIVE transition path.**
The golden `transition_order_atomic` already implements token→authorize(location)→override→audit→outbox.
  - **(a) recommended:** point the live path (`/api/rpc/transition_order_status` + `useOrderStateMachine`)
    at `transition_order_atomic` (add `p_token` = session, derive identity from `current_staff_id()`),
    and **deprecate** `transition_order_status`.
  - (b) add session+permission+location checks inside `transition_order_status` in place.
  → Confirm (a).

**G2 (O-02) — DB-level raw-RPC closure.** `REVOKE EXECUTE` from `authenticated` on all order-mutation
RPCs (keep `service_role`/`postgres` only), so direct PostgREST calls with a staff JWT fail — mirroring
S-02/F-01. → Confirm.

**G3 (O-03) — QR dine-in ordering.** Currently dead (O-03) + unguarded.
  - **(a)** fix it in O (resolve location from table/session + add the intended customer authz), or
  - **(b)** treat it as the Wave-A "QR anon customer access" feature and **defer** out of O.
  → Confirm (a or b).

**G4 (O-04) — Close the F-03 deferred boundary.** Scope every order-creation/append path
(`orders/route.ts` POST, `create_or_append_order`, `create_order_with_items`, `walkin_atomic`)
to the session's **active location** (server-trusted; client `location_id`/`table_number` never the sole source).
  → Confirm.

**G5 (O-05) — Order cancel.** Route cancel through a **permissioned atomic RPC** (`orders.cancel`)
with a row lock, instead of raw `PATCH` in orders/route.ts. → Confirm.

**G6 (O-06) — Table state machine boundary.** Keep **F frozen**: do NOT add a `table_floors`
state-machine trigger in O. O's raw `table_floors.status` sets stay as-is, protected only by the existing
F-04 guards (release_guard + archived). → Confirm we do **not** re-open F.

**G7 (O-08) — Order list reads.** Scope `/api/orders` GET + `/api/kitchen/orders` GET to the active
location + add the read permission. → Confirm.

**Fix order (once gated):** G2 (DB revoke, smallest blast radius) → G1 (live path → atomic RPC) →
G5 (cancel RPC) → G4 (location scoping, closes F-03 deferral + fixes O-07) → G3 (QR) → G7 (reads).
G6 = no change (documented).

---
*No code changed during this audit. A / E / S / F remain 🔒 FROZEN.*
