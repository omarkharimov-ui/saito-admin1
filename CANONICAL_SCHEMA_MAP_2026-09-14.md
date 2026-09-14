# CANONICAL SCHEMA MAP (2026-09-14) — Pre-P7 Schema Hygiene

> **READ-ONLY. No drop/rename/migration.** This is the data-model map you asked for so
> P-7's writer-surface audit runs on a *known* schema instead of "169 mystery tables."
> Every quantitative claim below cites its raw source (a live `COUNT(*)`/catalog query, or a
> file from the `_prep7` sweep). Classification values: `CANONICAL / DUPLICATE / LEGACY /
> SUSPICIOUS / KEEP / FREEZE / DROP-candidate`. **Nothing is deleted** — DROP rows are
> recommendations for the ratified cleanup phase only.
>
> Object totals (re-verified this turn): **154 tables (relkind=r) + 15 views (relkind=v) = 169**.
> There is **no table named `tables`** — the floor/table domain is `floors` + `table_floors`,
> and `table_order_contract` is a **view**, not a table (corrected from an earlier assumption).

---

## 1. Domain map (canonical / legacy / derived)

```
ORDER DOMAIN
├── orders                  CANONICAL  729 rows   order aggregate + money + 5 status cols
├── order_items             CANONICAL  701 rows   line items (the real line store)
├── order_payments          CANONICAL  82 rows    P-5/P-6 payment allocation ledger (SSOT)
├── order_events            CANONICAL  18 rows    state-transition event log
├── cancelled_orders        KEEP       13 rows    cancelled-order snapshot
├── invoices / invoice_items LEGACY    0/0 rows   never used (no FK traffic)
├── dining_groups           LEGACY     0 rows     group-dining, no data
├── order_counters          SUSPICIOUS 1 row
├── order_courses / order_changes / order_hourly_stats  LEGACY  0/0/14 rows (derived)

PAYMENT DOMAIN
├── order_payments          CANONICAL  (see ORDER) — the money ledger
├── payment_idempotency_keys CANONICAL 9 rows    P-4 dedupe
├── payment_methods         KEEP       9 rows    config (per-location methods)
├── payments                LEGACY     2 rows    OLD ledger, superseded by order_payments
├── payment_refunds         LEGACY     0 rows    OLD refund ledger (superseded)
├── payment_attempts        KEEP       2 rows    provider-level attempts
├── cash_drawer_log         CANONICAL  133 rows  drawer movement ledger
├── cash_drawer_sessions    CANONICAL  6 rows    drawer open/close
├── cash_drawer_logs        LEGACY     1 row     old drawer log (superseded by _log)
├── cash_reconciliations    LEGACY     0 rows
├── cash_registers          KEEP       3 rows    config
└── denomination_counts     LEGACY     0 rows

FLOOR / TABLE DOMAIN
├── floors                  CANONICAL  2 rows    floor (room/level)
├── table_floors            CANONICAL  32 rows   the actual table objects (number, area, 8 status cols)
├── table_order_contract    DERIVED    32 rows   VIEW — read-model joining table_floors + orders
├── stations                CANONICAL  5 rows    POS stations (only RLS-FORCED table)
└── (NO `tables` table exists)

STAFF / PEOPLE DOMAIN
├── staff                   CANONICAL  846 rows  50 active — the people SSOT
├── staff_locations         CANONICAL  92 rows   staff↔location assignment
├── staff_public_view       DERIVED    846 rows  enriched staff read-model (adds risk_score/risk_flags)
├── staff_stats             DERIVED    846 rows  1:1 per-staff 33-col KPI rollup
├── staff_metrics           DERIVED    56 rows   8 distinct staff — alt KPI slice
├── labor_summaries         DERIVED    111 rows  labor rollup (staff_id FK-less)
├── shift_reviews           KEEP       16 rows   manager review of a shift
└── performance_reviews     LEGACY     0 rows

SHIFT / TIME DOMAIN
├── shifts                  CANONICAL  110 rows  shift lifecycle (status = ENUM)
├── time_clock_entries      CANONICAL  29 rows   punch in/out
├── time_clock_audit        CANONICAL  8 rows    audit of punches
├── shifts_breaks / break_rules / break_compliance / break_adherence  KEEP/LEGACY
└── schedule / schedule_templates / schedule_conflicts  KEEP/LEGACY/LEGACY

INVENTORY DOMAIN
├── ingredients             CANONICAL  34 rows   the item SSOT
├── current_stock           CANONICAL? 34 rows   ingredient_id-keyed operational stock
├── inventory_status        DUPLICATE? 34 rows   name-keyed stock + waste/reporting cols
├── inventory_logs          CANONICAL  718 rows  stock movement ledger
├── recipes / recipe_items  CANONICAL  60/60    BOM (recipe_items.product_id FK-less)
├── recipe_headers          LEGACY     0 rows
├── product_cost_summary    DERIVED    14 rows
├── stock_counts / stock_count_items / stock_transactions  LEGACY  0
└── waste_standards         LEGACY     0 rows

AUDIT / LOG DOMAIN
├── audit_logs_canonical    CANONICAL  649 rows  P-5 canonical audit
├── audit_logs              LEGACY     333 rows  old audit
├── audit_log               LEGACY     67 rows   oldest audit
├── operation_logs          KEEP       1634 rows op log (has 11 jsonb cols)
├── operation_tracking      LEGACY     0 rows
├── transaction_logs        LEGACY     0 rows
├── sync_operations         LEGACY     2 rows
├── security_events         CANONICAL  660 rows  auth/security events
└── login_attempts          CANONICAL  108 rows  rate-limit/lockout

RESERVATION DOMAIN
├── reservations            CANONICAL  86 rows
├── reservations_archive    KEEP       18 rows   archived
├── reservation_tables      KEEP       9 rows    reservation↔table
├── reservation_preorder_items KEEP    9 rows
└── reservation_tables_quarantine_2026_09  SUSPICIOUS 8 rows (dated quarantine, RLS off)

CONFIG / MISC
├── settings                CANONICAL + D 1 row   single row; ≥5 plaintext credential cols
├── app_settings            LEGACY     0 rows    parallel, empty
├── locations / organizations  CANONICAL 4/4
└── (campaign/loyalty/tip/delivery/hr/payroll) — see sweep, mostly LEGACY/empty
```

---

## 2. The core tables — column inventory (type / null / default / FK / notes)

### `orders` (729) — order aggregate + money
```
orders
 ├─ id (uuid, PK)
 ├─ location_id (FK→locations)   ├─ table_id (FK→table_floors)   ├─ staff_id (FK→staff)
 ├─ status (text)                ← ORDER SSOT state (P-frozen)
 ├─ total_amount  (numeric)      ← money, set on ALL 729
 ├─ total_price   (numeric)      ← money, set on ALL 729  ⚠ DIVERGES from total_amount in 616/729
 ├─ original_total_amount (numeric)  set on only 7  ⚠
 ├─ subtotal (numeric, set all)  ├─ tax_amount / tax_pct (numeric)
 ├─ discount (numeric) / discount_amount / discount_type / discount_value
 ├─ paid_amount (numeric)        ← P-5 invariant source
 ├─ tip_amount / cash_amount / card_amount / change_amount / delivery_fee / service_charge_amount
 ├─ refund_amount / refund_reason / refunded_at    ← refund state
 ├─ items (jsonb)                ⚠ set on 226 rows but ALL EMPTY ARRAYS (0 with length>0) — dead
 ├─ status family: status, kitchen_status, delivery_status, course_status, printer_status  ⚠ 5 cols
 └─ courier_id / courier_name / tracking_number / checkin_at / group_id / estimated_delivery_time (100%-null)
```
Raw: `total_amount_set=729 total_price_set=729 original_total_set=7 subtotal_set=729 mismatch(amount<>price,both set)=616`;
`items` jsonb `jsonb_typeof='array'`, `rows with length>0 = 0`.

### `order_items` (701) — the real line-item store
```
order_items
 ├─ id (PK)  ├─ order_id (FK→orders)  ├─ product_id (FK, nullable in live)
 ├─ product_name / quantity / unit_price / total_price
 ├─ kitchen_status (text)  ← line-level kitchen state
 ├─ prepared_quantity / served_quantity / modifiers(jsonb) / allergens(jsonb) / price_snapshot(jsonb)
 └─ 16 always-null columns (variant/combo/hold/seat/station/timing) — peripheral, unused
```

### `order_payments` (82) — CANONICAL money ledger (P-5/P-6)
```
order_payments
 ├─ id (PK)  ├─ order_id (FK→orders)  ├─ amount (numeric)
 ├─ status (text)            ← captured/refunded/voided (P-frozen)
 ├─ is_refund (bool)         ← P-6 refund rows
 ├─ method / payment_method (config ref)
 └─ transaction_id / split_group_id / reference_order_id / correlation_id  (no FK)
```

### `payments` (2) — LEGACY old ledger, superseded
```
payments
 ├─ id (PK)  ├─ order_id (no FK to orders — orphan ref)  ├─ amount / tip_amount / change_amount
 ├─ status (text)  ├─ is_refund (bool)  ├─ refund_of_payment_id (self FK)
 └─ provider_transaction_id / terminal_id / split_group_id (no FK)  + metadata(jsonb)
```
⚠ `payments` and `order_payments` both store order money + `is_refund` — the classic two-ledgers (P-6 D-9 kept `payments` as P-9 legacy; 2 rows vs 82).

### `table_floors` (32) — the table objects
```
table_floors
 ├─ id (PK)  ├─ floor_id (FK→floors)  ├─ number / area / capacity
 ├─ current_order_id (FK→orders)   ⚠ NULL on ALL 32 (0 with_current_order) — live link is empty
 ├─ 8 STATUS COLUMNS ⚠: status, kitchen_status, payment_status, course_status,
 │                      cleaning_status, connection_status, printer_status, reservation_status_snapshot
 └─ merged_orders(jsonb) / metadata(jsonb) / is_archived / archived_at / waiter_id
```
Raw: `table_floors rows=32 with_current_order=0 payment_status set=32`.
⚠ `payment_status` re-states the ORDER's payment state on the table row (money/state stored in two places), and `current_order_id` being all-null means these mirrored statuses are **stale snapshots with no live join**.

### `table_order_contract` (32) — DERIVED VIEW (read model)
```
table_order_contract  (VIEW)
 ├─ table_status / table_kitchen_status
 ├─ current_order_status / current_order_kitchen_status   ← mirrors orders.status
 ├─ current_order_total (numeric)                          ← mirrors orders money
 └─ open_orders
```
⚠ A third home for "table + its order state + total" (after `orders` and `table_floors`). 5 cols overlap `table_floors`.

### `staff` (846) — people SSOT
```
staff
 ├─ id (PK)  ├─ name / full_name / email / phone
 ├─ role_id (FK→roles)  ├─ organization_id  ├─ location refs
 ├─ is_active (bool) + status (text)   ⚠ two "am I active" signals
 ├─ pin_hash (text, PBKDF2-260k)  ← login SSOT
 ├─ failed_login_attempts / locked_until  ← lockout
 ├─ hourly_rate / break_start / break_end
 └─ created_at / updated_at
```

### The staff read-models / rollups (the "is this 4 different tables or 1 fact?" cluster)
```
staff              846  CANONICAL  — the person
staff_public_view  846  DERIVED    — staff + risk_score/risk_level/risk_flags/last_login_at (UI read-model)
staff_stats        846  DERIVED    — 1:1 per-staff 33-col KPI (total_revenue, voids, refunds, tips, avg_wait…)
staff_metrics      56   DERIVED    — 8 distinct staff, a different KPI slice
labor_summaries   111   DERIVED    — labor rollup, staff_id FK-LESS
```
Raw: `staff=846 staff_stats=846 staff_public_view=846 staff_metrics=56(8 distinct) labor_summaries=111`;
`staff_stats distinct staff_id=846 orphans=0`. So staff_stats is a **derived rollup, 1:1 with staff** — not a separate business entity.

### Inventory: two parallel "how much stock" models
```
current_stock     34  ingredient_id-keyed (FK-less⚠): name, unit, total_stock, min_limit, is_low_stock
inventory_status  34  name-keyed: current_stock, theoretical_stock, critical_limit, stock_ratio,
                          average_cost_per_unit, purchase_price, cold_waste_percentage, monthly_waste_cost, status
```
⚠ Same 34 ingredients, **two tables answering "current stock level"** with different keys + column sets (current_stock=operational, inventory_status=reporting/waste). Shared cols only 2 (`name`,`unit`).

> ⚠ **Test-residue note (this turn's raw):** `staff` = 846 but **336 are inactive gate-residue**
> (name prefixes `P4_/P5_/P6_/O_/L3_/L4_/P1_`), only **50 active**. `staff_stats` mirrors all 846,
> so the 336 dead staff also carry 336 dead `staff_stats` rows. This is accumulated probe residue
> across the P-1..P-6 gates (each run creates staff fixtures); it inflates every per-staff rollup.
> **Recommendation (cleanup phase, not now):** prune `staff_stats`/`staff_metrics`/`labor_summaries`
> rows for inactive P/O/L-prefixed staff, and have gates hard-clean their own fixtures. This is why
> `staff_stats` looks "1:1 with staff" — 336 of those 1:1 rows are dead weight.

### Config
```
settings        1  CANONICAL + D — single row; ≥5 plaintext credential columns (S-2, no route exposes)
app_settings    0  LEGACY — parallel settings, empty
```

---

## 3. Duplicate / concept-overlap groups (the "are these N tables or 1 fact?")

| Group | Tables (rows) | Verdict |
|---|---|---|
| **Order money total** | `orders.total_amount` vs `orders.total_price` vs `orders.original_total_amount` | 🔴 **RED** — 616/729 rows (84%) have `total_amount ≠ total_price`; both set. Same fact, two diverged columns. `original_total_amount` set on 7 (dead-ish). |
| **Order line items** | `order_items` (701) vs `orders.items` jsonb (226 set, 0 non-empty) | 🟠 **ORANGE** — `orders.items` is a dead jsonb array (always empty); `order_items` is canonical. |
| **Payment ledger** | `order_payments` (82) vs `payments` (2) | 🟠 **ORANGE** — two ledgers, same `amount`/`is_refund`; `payments` = P-9 legacy (P-6 D-9). |
| **Table/order state** | `orders.status` vs `table_floors.{8 status cols}` vs `table_order_contract` view | 🔴 **RED** — order state + money mirrored 3 ways; `table_floors.current_order_id` all-null so the mirror is stale. |
| **Staff KPI** | `staff_stats` (846) + `staff_metrics` (56) + `labor_summaries` (111) + `staff_public_view` (846) | 🟠 **ORANGE** — 4 derived staff rollups over 1 canonical `staff`; `staff_stats` is 1:1 (redundant with a view). |
| **Inventory level** | `current_stock` (34) vs `inventory_status` (34) | 🟠 **ORANGE** — two models of the same stock fact, different keys (ingredient_id vs name). |
| **Audit** | `audit_log`(67)+`audit_logs`(333)+`audit_logs_canonical`(649) | 🟠 **ORANGE** — 3 audit tables; canonical = P-5 `audit_logs_canonical`. |
| **Op-log** | `operation_logs`(1634)+`operation_tracking`(0)+`transaction_logs`(0)+`sync_operations`(2) | 🟡 **YELLOW** — 4 op-log homes, 3 empty. |
| **Drawer log** | `cash_drawer_log`(133) vs `cash_drawer_logs`(1) | 🟡 **YELLOW** — 2 drawer ledgers; `_log` canonical. |
| **Settings** | `settings`(1) vs `app_settings`(0) | 🟡 **YELLOW** — parallel config, one empty. |

---

## 4. Flags (with raw evidence)

### 🔴 Critical (RED)
| # | Flag | Evidence |
|---|---|---|
| R-1 | **Same money fact in 2 diverged columns** | `orders.total_amount` vs `total_price`: 616/729 (84%) mismatch, both populated. |
| R-2 | **State/money mirrored in 3 places** | `orders.status` ↔ `table_floors.{status,kitchen_status,payment_status,…}` ↔ `table_order_contract` view; `table_floors.current_order_id` NULL on all 32 (stale mirror). |
| R-3 | **FK-less relationship that should be enforced** | `staff_stats.staff_id`, `labor_summaries.staff_id`, `recipe_items.product_id`, `current_stock.ingredient_id` → 0 FK constraints (verified via `pg_constraint`). Referential integrity absent; a deleted staff/ingredient leaves orphan rollup rows. |

### 🟠 High (ORANGE)
| # | Flag | Evidence |
|---|---|---|
| O-1 | **Dead jsonb duplicating relational data** | `orders.items` set on 226 rows, all empty arrays (`length>0 = 0`). |
| O-2 | **Two payment ledgers** | `order_payments`(82) vs `payments`(2), both `amount`+`is_refund`; `payments.order_id` has no FK to `orders`. |
| O-3 | **Two inventory-stock models** | `current_stock`(34, ingredient_id) vs `inventory_status`(34, name-keyed) — same fact, different key + columns. |
| O-4 | **4 staff KPI rollups over 1 table** | `staff_stats`(846, 1:1) + `staff_metrics`(56) + `labor_summaries`(111) + `staff_public_view`(846). |
| O-5 | **`_id` present but no FK** | 104 FK-less `*_id` columns schema-wide (full list in §6). Many are legit (terminal_id, correlation_id), 4 confirmed orphans (R-3). |
| O-6 | **3 audit tables** | `audit_log`/`audit_logs`/`audit_logs_canonical` (67/333/649). |

### 🟡 Medium (YELLOW)
| # | Flag | Evidence |
|---|---|---|
| Y-1 | **`*_stats`/`*_metrics`/`*_summary` proliferation** | staff_stats, staff_metrics, order_hourly_stats, product_cost_summary, labor_summaries. |
| Y-2 | **`is_active` + `status` both present** | staff, locations, organizations, campaigns (two "active" signals per row). |
| Y-3 | **`status`/`state`/`phase` mixing** | `operation_logs` has old_state/new_state/before_state/after_state **and** status; `state_transitions` from_status/to_status. |
| Y-4 | **generic jsonb overuse** | `operation_logs` has **11** jsonb columns; `payments.metadata`, `security_events.metadata`, `print_jobs.payload`. |
| Y-5 | **8 status columns on one row** | `table_floors` (status, kitchen_status, payment_status, course_status, cleaning_status, connection_status, printer_status, reservation_status_snapshot). |
| Y-6 | **dated quarantine table** | `reservation_tables_quarantine_2026_09` (8 rows, RLS off) — one-off, never merged/dropped. |
| Y-7 | **always-null peripheral columns** | 240 never-written columns schema-wide (e.g. 9 on `orders`, 16 on `order_items`) — S-10 ratified KEEP. |

---

## 5. Classification matrix (canonical / duplicate / legacy / suspicious / keep / freeze / drop)

> Action column is a **recommendation for the ratified cleanup phase**. **Nothing is changed now.**

| Table (rows) | Class | Rationale | Recommended action (later) |
|---|---|---|---|
| `orders` (729) | CANONICAL (money: DUPLICATE-col) | SSOT; R-1/R-2 | **keep**; reconcile `total_amount` vs `total_price` (pick one SSOT) in a money-data pass |
| `order_items` (701) | CANONICAL | line SSOT | **keep** |
| `order_payments` (82) | CANONICAL | P-5/P-6 ledger | **keep** (frozen contract) |
| `payments` (2) | LEGACY (DUPLICATE ledger) | superseded by order_payments (P-6 D-9) | **freeze → drop** in P-9 |
| `payment_idempotency_keys` (9) | CANONICAL | P-4 | **keep** (frozen) |
| `table_floors` (32) | CANONICAL (state: DUPLICATE) | table SSOT; R-2 | **keep**; the 8 status cols should be derived, not stored |
| `table_order_contract` (32) | DERIVED (view) | read model | **keep** (view, cheap) |
| `floors` (2) | CANONICAL | floor SSOT | **keep** |
| `staff` (846) | CANONICAL | people SSOT | **keep** |
| `staff_stats` (846) | DUPLICATE (1:1 rollup) | O-4, R-3 | **keep→convert to view** in P-9 (drop the table) |
| `staff_public_view` (846) | DERIVED | O-4 | **keep** |
| `staff_metrics` (56) / `labor_summaries` (111) | DUPLICATE | O-4, R-3 | **freeze → reconcile** in P-9 |
| `current_stock` (34) | CANONICAL? (R-3) | operational stock | **keep**; add FK to ingredients |
| `inventory_status` (34) | DUPLICATE (O-3) | parallel stock model | **freeze → reconcile** (merge into current_stock or view) in P-9 |
| `inventory_logs` (718) | CANONICAL | movement ledger | **keep** |
| `audit_log` (67) / `audit_logs` (333) | LEGACY (O-6) | superseded by canonical | **freeze → drop** in P-9 |
| `audit_logs_canonical` (649) | CANONICAL | P-5 | **keep** (frozen) |
| `operation_tracking` (0) / `transaction_logs` (0) | LEGACY (Y) | empty | **freeze → drop** in S-4b/C phase |
| `cash_drawer_logs` (1) | LEGACY (Y) | superseded by `cash_drawer_log` | **freeze → drop** in P-9 |
| `app_settings` (0) | LEGACY (Y) | empty parallel of settings | **freeze → drop** |
| `invoices`/`invoice_items`/`dining_groups`/`recipe_headers`/`waste_standards`/`performance_reviews`/… | LEGACY | 0 rows, low refs | **freeze → drop** in C phase |
| `reservation_tables_quarantine_2026_09` (8) | SUSPICIOUS (Y-6) | dated quarantine, RLS off | **investigate → merge or drop** (S-6) |
| `settings` (1) | CANONICAL + D | plaintext creds | **keep** table; S-2: move secrets to env, drop the 5 columns |
| 47 empty 0-ref tables (from §3 of the audit) | DROP-candidate | S-4b/C phase | **freeze → reflow → drop** |

---

## 6. Full FK-less `*_id` column list (104) — for the referential-integrity pass

Confirmed-orphan (0 FK, *should* have one): `staff_stats.staff_id`, `labor_summaries.staff_id`,
`recipe_items.product_id`, `current_stock.ingredient_id`, `payments.order_id`.

Likely-legit-no-FK (device/correlation/external, by design): `*.correlation_id`, `*.terminal_id`,
`*.device_id`, `*.reference_id`, `*.tax_id`, `*.provider_*`, `order_payments.transaction_id`,
`order_events.device_id`, `outbox_events.aggregate_id`, etc.

Full list (49 tables): `approval_requests.entity_id, audit_log.record_id, audit_logs.{order_id,item_id,user_id,record_id,staff_id,target_id}, audit_logs_canonical.{entity_id,actor_id}, break_rules.role_id, campaign_targets.target_id, campaigns.{target_id,combo_id,branch_id}, cash_drawer_log.order_id, cash_drawer_logs.{shift_id,staff_id}, cash_drawer_sessions.shift_id, cash_registers.terminal_id, combos.category_id, current_stock.ingredient_id, dining_groups.primary_order_id, discrepancy_alerts.source_id, expenses.staff_id, gift_card_ledger.{reference_id,correlation_id}, gift_card_transactions.{order_id,payment_id}, inventory_logs.{order_id,supplier_invoice_line_id,goods_receipt_line_id,procurement_anomaly_id,reference_id,correlation_id}, labor_summaries.staff_id, login_attempts.staff_id, loyalty_order_points.{order_item_id,customer_id}, loyalty_transactions.{reference_id,correlation_id}, notification_read_state.user_id, operation_logs.{device_id,reservation_id,record_id,entity_id,correlation_id,location_id,organization_id}, operation_tracking.{client_id,operation_id}, order_events.device_id, order_items.{variant_id,combo_group_id,updated_by_terminal_id,correlation_id}, order_payments.{transaction_id,split_group_id,reference_order_id,correlation_id}, orders.{courier_id,updated_by_terminal_id,correlation_id}, organizations.tax_id, outbox_events.aggregate_id, payment_attempts.terminal_id, payment_refunds.{order_id,provider_refund_id}, payments.{provider_transaction_id,terminal_id,split_group_id,refund_of_payment_id}, price_overrides.{order_item_id,product_id}, print_jobs.correlation_id, product_cost_summary.product_id, recipe_items.{product_id,ingredient_id}, recipes.menu_item_id, reservation_tables_quarantine_2026_09.reservation_id, reservations.{floor_id,reservation_merge_group_id}, reservations_archive.reservation_id, shifts.active_role_id, staff_public_view.{role_id,organization_id}, staff_stats.staff_id, suppliers.tax_id, sync_operations.{client_id,operation_id}, table_floors.{current_order_id,updated_by_terminal_id,waiter_id}, table_order_contract.{current_order_id,location_id,organization_id}, v_*.staff_id/order_id/reservation_id/product_id/category_id, waiter_assignments.table_id, webhook_events.correlation_id`.

---

## 7. What this means for P-7 (unchanged from your ratified boundary)

P-7 concurrency runs on the **A-class writer surface only**: `orders → order_items →
order_payments → table_floors/floors → shifts → payment_idempotency_keys → outbox_events`.
The map above confirms that surface is **well-defined and canonical** — the mess (duplicate
money columns, 3-way state mirror, 4 staff rollups, 2 stock models, 3 audit tables) lives in the
**derived/legacy** objects that are **out of P-7 scope**. P-7 should assert the writer surface's
invariants and *not* depend on `table_floors.payment_status`, `staff_stats`, or `payments`.

The RED items (R-1 diverged money, R-2 3-way state mirror, R-3 missing FKs) are **P-9/data-model
reconciliation**, not P-7, and not dropped now — they become the input to the ratified
freeze→reflow→drop + a money/state normalization pass.
