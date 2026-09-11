# F — FLOOR/TABLES FOUNDATION + CURRENT STATE AUDIT (2026-09-11)

> **Audit-only. NO code/fix in this document** — per the frozen workflow:
> `F Foundation/Current-State Audit → business contract gate → (then) fix batch`.
> "F = 85%" was **discarded** as unverified. This is the real, evidence-backed picture.
> Every claim = REAL DB (`jbxmlnsicbfkbsatnoej`) + repo source (40+ probes).
> **A / E / S = FROZEN dependencies** (validate_actor, has_permission, has_location_access,
> session identity) — consumed read-only, not re-audited here.

---

## ARCHITECTURE — current contract (what actually exists & works)

### Entities
| Table | Rows | Role |
|---|---|---|
| **`table_floors`** | 15 | **THE table entity** (51 cols): `table_number`, `status`, `current_order_id`, `order_ids[]`, `merged_into_table`, `reservation_id`, `guest_count`, `capacity`, `version`, `kitchen_status`, `payment_status`, `cleaning_status`, `floor_id`, `location_id`, `organization_id`, `x_pos/y_pos/shape` (floor map) |
| `floors` | 2 | floor within a location (`org+loc` invariant FK). "VIP", "mertebe 1" — both of location `f1f830b3` |
| `seats` | **0** | **DEAD** (0 rows, 0 FKs; only `upsert_seats`/`get_seat_totals` touch it). NOT the table entity |
| `orders.table_number` (int) | 706 | **soft ref** to `table_floors.table_number` (NOT a uuid FK) |
| `table_order_contract` | VIEW | joins `table_floors` + `orders`; exposes `current_order_id`, `current_order_status`, **`open_orders` count** |

### State machine (formal, data-driven)
- `state_transitions` table drives it; `validate_transition('table', old, new)` → `transition_table_status()`.
- **25 active table rules**, **16 statuses** in CHECK: `empty, reserved, seated, ordering, in_kitchen, dining, bill_requested, payment_pending, paid, cleaning, merged, out_of_service, occupied, dirty, ready, served`.
- **Production actually uses only 3**: `empty`(9), `reserved`(5), `occupied`(1). The rest are defined-but-unused (F-07).

### Atomic RPC family (LIVE, called by routes, concurrency-safe)
`activate_table_atomic`, `clear_table_atomic`, `dismiss_table_atomic`, `dismiss_undo_atomic`, `merge_tables_atomic`, `unmerge_tables_atomic`, `transfer_table_atomic`, `release_paid_table_atomic`, `move_reservation_table_atomic`, `merge_reservation_tables_atomic`, `reserve_table_atomic`, `assign_reservation_tables_atomic`, `cancel_reservation_atomic`.
- **`FOR UPDATE`** on the table row(s); **merge/transfer lock BOTH** parent+child → concurrent table ops serialize at DB level. (Strength — unlike E/S.)
- `create_or_append_order` locks table + active order → **0 tables with 2+ open orders** (verified).
- Legacy `saito_*` / `*_v1/v3/v4` fns = **DEAD** (not called by any route).

### Reservation → table
`activate_table_atomic`: `reserved→occupied`, creates an order from `reservation_preorder_items`, locks table **and** reservation (`FOR UPDATE`), writes outbox `table.order_opened`. `process_expired_reservations` on cron `*/15`.

### Isolation / audit / events
- **RLS ON** on `table_floors`/`orders`/`reservations`/`seats`; app-role SELECT/UPDATE = `is_superadmin OR (has_org_access AND has_location_access)`. (A-frozen.)
- **Outbox** triggers: `trg_emit_table_status_event`, `trg_emit_table_order_event` → KDS/realtime.
- **Audit**: `operation_logs` + `audit_logs`. **KDS**: `sync_table_kitchen_status` + `table_order_contract` view.
- Permissions in registry: `orders.create/edit/cancel`, `reservations.manage/view`, `kitchen.view/manage/auth` — **exist but NOT enforced on table ops** (see F-01).

---

## FINDINGS (evidence-backed)

### 🟠 F-01 — No permission / role / manager-override on table operations (authz gap)
**Evidence:**
- `state_transitions` (25 table rules): **0** have `requires_permission`, **0** `requires_role`, **0** `requires_manager_override` (all NULL).
- `transition_table_status` reads `requires_role`/`requires_permission`/`requires_manager_override` from the rule but **never enforces** them (enforces_perm = **false**).
- Routes (`/orders/dismiss`, `/pos/tables`, `/orders/clear-table`, `/reservations/*`) use **`requireAuth` (session) + CSRF only — NO `requirePermission`**.
- `validate_actor(p_performed_by)` (A-frozen) only checks **staff exists + is_active** — **not role/permission**.
**Impact:** any active staff (e.g. **waiter**) can **dismiss** (which **cancels the order = money**), **merge/transfer/clear/activate** any table. The registry clearly *intended* gating (`orders.cancel` = admin/superadmin-only) but it isn't wired. **Same class as the S-02 IDOR, but for table ops.**

### 🟠 F-02 — Cross-location table operations not blocked (location isolation in RPCs)
**Evidence:**
- `dismiss_table_atomic`, `activate_table_atomic`, `clear_table_atomic`: **no org/location check** against the actor (loc_isolation = **false**); only `validate_actor` (exists+active).
- `table_number` is **globally unique** → a single int resolves across locations, so a waiter at Location A can dismiss/activate **Location B's** table.
- merge/transfer/unmerge **do** reference `organization_id` (loc_isolation = true) — partial.
**Mechanism:** RLS is ON for app-role table reads, but the table-op RPCs are **SECURITY DEFINER (service role) → bypass RLS** → the isolation that RLS provides is **not applied to the mutating RPCs**. (F-02 is the RPC-side twin of F-01.)

### 🟠 F-03 — Global `UNIQUE(table_number)` = single-location design (scale blocker)
**Evidence:** `table_floors_table_number_key UNIQUE (table_number)` — **not** `(location_id, table_number)`. Two locations **cannot both have "table 5"**.
**Impact:** Today only 1 location has tables, so not broken — but it **hard-blocks multi-location**, which is the platform's stated goal (same theme as S-05). Changing it is a **foundational identity-model decision**, not a patch.

### 🟡 F-04 — 68 orphan orders (table_number with no `table_floors` row)
**Evidence:** orders reference tables **11,12,13,19,24,27,28,29,30** which have **no** `table_floors` row (only 1–10, 14–18 exist). Dates **2026-03 → 2026-09-01**. **All `still_open = 0`** (all paid/closed).
**Impact:** these are **historical** (floor likely renumbered/tables removed). Financial history intact, but it shows **table rows were hard-deleted with no archive** → orphans accumulate. Data-management decision (F-04 below).

### 🟡 F-05 — 3 stale `current_order_id` pointers (→ cancelled orders)
**Evidence:** tables **17(reserved), 8(occupied), 6(reserved)** have `current_order_id` → a **cancelled** order. Table **8** is the notable one: `status=occupied`, pointer→cancelled, but **`open_orders_now=1`** (a real open order exists). So `table_order_contract.current_order_status` shows the **stale cancelled** pointer while `open_orders=1` → the floor map can show an inconsistent "current order".
**Mechanism:** cancel/dismiss leaves `current_order_id` set. `clear_stale_table_order_pointer` is a trigger that only fires when an order **moves table** — it does **NOT** fire on **cancel**, and there is **no cron** for it.

### ⚪ F-06 — `seats` table is DEAD; seat-level assignment not implemented
**Evidence:** 0 rows, 0 FKs. The actual "guest" model is **`guest_count`** (an integer on `orders` + `table_floors`), **not** per-seat. So "seat/table assignment" (your audit item) = **guest count only**; per-seat is not built.

### ⚪ F-07 — 16 statuses defined, 3 in use
Production runs `empty/reserved/occupied`; the rich lifecycle (`seated→ordering→in_kitchen→dining→bill_requested→payment_pending→paid→cleaning`, `out_of_service`/`merged`) is **defined in the state machine but unused**. The effective floor semantics today are the 3; `out_of_service` = "blocked" exists. Worth confirming which the UI actually drives before "freezing" the lifecycle.

---

## STRENGTHS (current contract that WORKS — do not regress)
- Formal **data-driven** state machine (extensible, not hardcoded transitions).
- **Concurrency-safe** atomic RPCs: `FOR UPDATE` on table(s); merge/transfer lock both; `create_or_append_order` prevents 2 open orders on a table (verified 0).
- **RLS ON** + org/location scoping for app-role reads.
- **Outbox** (status + order events) → KDS/realtime.
- **Reservation→table** activate (creates order from preorder, dual lock).
- Expired-reservation cron, audit logs, `table_order_contract` view (computes `open_orders` accurately even if the pointer is stale).
- **Dependencies on A/E/S** are clean and read-only.

> Net: F is **more complete than E/S was** (no fundamental crash). The gaps are **authz (F-01), location isolation (F-02), scale (F-03)** and **data hygiene (F-04/F-05/F-06)**. Concurrency is a strength.

---

## 🎯 BUSINESS CONTRACT DECISIONS (return to user — NOT to be invented)

Per the frozen rule, these are **business decisions** that must be made before any fix batch:

1. **F-01 — Permission model for table ops.** Which ops require which permission + manager override?
   - Proposal to confirm: **view** = `reservations.view`/`orders.view` (any active floor staff); **activate/reserve/seat/guest_count** = `orders.create`; **clear/dismiss/cancel** (cancels order + money) = **manager** (`reservations.manage` or `orders.cancel`); **merge/transfer/split** = **manager**. Enforce at BOTH the RPC (definer) **and** keep the state-machine `requires_permission` populated (currently all NULL).

2. **F-02 — Location isolation on table RPCs.** Confirm: **YES** — every table op must scope to the actor's **active location/org** (the definer RPCs must check `has_location_access` / match the table's `location_id`), closing the cross-location gap.

3. **F-03 — Multi-location table identity.** **Single vs multi-location** tables.
   - If **multi-location** (aligns with the whole platform): `table_number` must become **`UNIQUE(location_id, table_number)`** and all ops/view/refs scope by location. This is a **foundational** change.
   - If **single-location** for now: document it as an accepted limit.

4. **F-04 — Deleted tables / orphan orders.** Were tables 11–30 intentionally removed? Should table **deletion be archived (not hard-deleted)** so order history keeps a referent? (Currently hard-delete → 68 historical orphans.)

5. **F-05 — Stale `current_order_id`.** Contract: should **cancel/dismiss clear the pointer**, and/or add a **scheduled cleanup** + make the floor map prefer the **live open order** over the stored pointer?

6. **F-06 — `seats` table + seat model.** **Remove** the dead `seats` table, or **implement** per-seat assignment? Current model = `guest_count` (a number). Is per-seat required for the business?

---

## NEXT (after user freezes these contracts)
`Fix batch (F-01/F-02 first as blockers → F-03 if multi-location → F-04/F-05 data → F-06)`
→ **live DB proof** (cross-location denied, waiter-cannot-dismiss, merge/transfer isolation)
→ **concurrency battery** (2× merge, 2× activate, 2× order-append, reserve/activate race)
→ **residue audit** (orphan/stale pointer = 0 new)
→ **A/E/S regression** (39/39 + E/S 54/54 must stay green)
→ **re-audit** → 🔒 **F FROZEN**

> **A / E / S remain 🔒 FROZEN.** F consumes their identity/authz/location contract read-only.
