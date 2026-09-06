# PLAN v3 — 0.4-H Inventory Boundary / Stock Effects

> **Status:** PLAN ONLY. No migration, no trigger change, no production repair, no stock mutation.
> **v3 changelog:** incorporates audit verdict "PLAN APPROVED WITH CHANGES" — 7 fixes: canonical READY operation contract (H2/H3), M2 Variant B wrapper (replaces comment-only), M1 semantic invariant contract, H4 5 separate semantic operations, H8 mutation matrix, H7 multi-ingredient partial-failure rollback, H10 correction→reversal→replacement E2E + legacy+canonical simultaneous. M3 = SKIP (Option A preserve waste).
> **Supersedes:** v1/v2. Base = real live Supabase `jbxmlnsicbfkbsatnoej`, verified read-only post-2026-07-29.
> **Frozen contracts:** 0.4-A→G order/table/state-machine contracts are NOT reopened unless an explicit conflict is proven.

---

## 0. Why this plan is a re-write (not an increment)

The original H plan assumed H was a **stock-repair project**. **Live verification proves that work is already done** by the 2026-07-29 `fix_21_rpc_consolidation` + `fix_23/25` migrations:

| Original H assumption | Live reality (verified) |
|---|---|
| 2 triggers double-deduct | **Neither exists.** One consolidated `trg_z_inventory_log_effect` → `trg_apply_inventory_effect()` (single UPDATE). |
| 2 stock-mutating functions | **Neither exists.** |
| current_stock ≈ 2× theoretical | **34/34 ingredients in sync**, 0 divergent. |
| `inventory_transactions` table with `UNIQUE(order_item_id)` | **Table does not exist.** |
| No idempotency_key column | **Column exists** + partial unique index `inventory_logs_idempotency_uidx WHERE idempotency_key IS NOT NULL`. |
| No immutability | `trg_inventory_logs_immutable` blocks UPDATE/DELETE. |
| Historical 27 897-unit repair needed | **Already done:** 31 `historical_repair` rows, reconciliation clean. |
| Admin `reverse_stock_deduction_for_items` must be repointed | **Function removed**; replaced by canonical `reverse_stock_for_items` → `_inventory_reverse_item`. |

**Therefore H is no longer a "stock repair project".** H is a **verify + close-gaps + freeze** project: declare the canonical consumption/reversal operation contract, harden the few real remaining gaps, and freeze — without touching the healthy baseline or frozen A→G.

---

## H0 — Live baseline & dependency freeze

### 0.1 Real counts (verified live)
| Object | Live count | Notes |
|---|---|---|
| `inventory_logs` | **709** | the real ledger |
| `stock_transactions` | 0 | unrelated concept; NOT the ledger |
| `inventory_transactions` | — | **does not exist** |
| `recipes` | 60 | flat; `UNIQUE(menu_item_id, ingredient_id)` |
| `recipe_headers` | 0 | dead header design (no version column) |
| `ingredients` | 34 | all in sync |
| `products` | 14 | `is_ready_product` + `direct_ingredient_id` |
| `product_modifiers` | 7 | no ingredient link (H6 greensfield) |
| `item_corrections` | 0 | 0.4-D flow wired but never exercised |
| `outbox_events` | 93 | 0 `inventory.*` events |

### 0.2 `inventory_logs` distribution by type
| type | rows | idempotency_key populated | order_item_id NULL | order_item_id set |
|---|---|---|---|---|
| order_consumption | 615 | **0** | 594 | 21 |
| stock_in | 44 | 0 | 44 | 0 |
| historical_repair | 31 | **31** | 31 | 0 |
| adjustment | 18 | 0 | 18 | 0 |
| waste | 1 | 0 | 1 | 0 |
| reversal | 0 | — | — | — |
| stock_return | 0 | — | — | — |
| order_restore | 0 | — | — | — |

> The 615 `order_consumption` rows are **all pre-upgrade historical** — none carry an idempotency_key, 594 are order-level (NULL `order_item_id`). The upgraded `consume_stock_for_item` (which always sets `order_item_id` + key) has **never produced a row in production yet** (corroborated by 0 inventory outbox events).

### 0.3 Negative-consumption legacy reversals
- 91 rows of `order_consumption` with `quantity < 0` (legacy reversal mechanism, old admin OrderModal path). Immutable historical; the new path uses `type='reversal'` (0 rows yet). Do not touch.

### 0.4 Active triggers on `inventory_logs` (6)
| Trigger | When | Function | Effect |
|---|---|---|---|
| `trg_inventory_log_order_location` | BEFORE INSERT/UPDATE | `enforce_inventory_log_order_location` | sets order/location/org |
| `trg_inventory_logs_immutable` | BEFORE DELETE/UPDATE | `trg_inventory_logs_immutable` | RAISE on UPDATE/DELETE |
| `trg_set_inventory_log_unit_cost` | BEFORE INSERT | `set_inventory_log_unit_cost` | snapshots unit cost |
| `trg_wac_on_stock_in` | AFTER INSERT WHEN type='stock_in' | `apply_wac_on_stock_in` | WAC recalc on stock-in only |
| `trg_z_inventory_log_effect` | AFTER INSERT | `trg_apply_inventory_effect` | **single** stock effect |
| `trg_product_availability_on_stock` | AFTER INSERT/DELETE/UPDATE (stmt) | `update_product_availability` | product availability flag |

> `trg_apply_inventory_effect`: one UPDATE per row. `order_consumption`/`waste` → `−quantity`; `reversal`/`stock_return`/`order_restore` → `+quantity`; `stock_in`/`adjustment`/`historical_repair` → `+quantity`. Moves both current_stock and theoretical_stock (except adjustment/historical_repair move only current_stock). **No double-deduction possible** — single trigger, single UPDATE.

### 0.5 Inventory writer dependency matrix (canonical classification)

**Consumption (READY boundary) — see H2/H3 for the canonical OPERATION decision:**
| Function | Caller role | Calls | Classification |
|---|---|---|---|
| `consume_stock_for_item` | inventory primitive | (self: INSERT ledger + outbox) | ✅ **CANONICAL PRIMITIVE** |
| `mark_item_ready_atomic` | admin item-level | → `consume_stock_for_item` | ✅ **CANONICAL READY OPERATION** |
| `mark_order_ready` | KDS order-level | → `consume_stock_for_item` (per-item loop) | ✅ compatibility (KDS) |
| `mark_ready_atomic` | order-level + served | → `consume_stock_for_item` | ⚠️ **DEPRECATED → wrapper (M2 Variant B)** |

**Reversal — all delegate to ONE primitive:**
| Function | Calls | Classification |
|---|---|---|
| `_inventory_reverse_item` | (self: INSERT `type='reversal'` + outbox) | ✅ **CANONICAL reversal primitive** |
| `_inventory_reverse_item_qty` | → partial reversal | ✅ canonical partial-reversal |
| `void_order_item_atomic` | → `_inventory_reverse_item` | ✅ canonical |
| `void_item_atomic` (token) | → `_inventory_reverse_item` IF consumed | ✅ canonical |
| `correct_item_atomic` (0.4-D) | → `inventory.reversal_requested` + `_inventory_reverse_item` | ✅ canonical (frozen 0.4-D) |
| `waste_order_item_atomic` | → `_inventory_reverse_item` | ⚠️ see H4 (Option A preserve) |
| `refund_with_inventory` | → fate-gated (reversal OR waste) | ✅ canonical (see H4) |
| `cancel_order_items` / `cancel_table_orders` / `dismiss_table_session` / `reopen_order_atomic` / `reverse_stock_for_items` | → `_inventory_reverse_item` | ✅ canonical |
| `comp_order_item_atomic` | none | ✅ no inventory effect (intentional) |

### 0.6 current_stock / theoretical_stock mechanism (self-audit corrected)
Stored columns. Writers split into three classes (verified live):

| Class | Writers | Effect |
|---|---|---|
| **Ledger-routed (canonical)** | `trg_apply_inventory_effect` on every `inventory_logs` INSERT | moves current_stock + theoretical_stock per type |
| **Direct DUAL-write** (ledger INSERT **+** direct `UPDATE ingredients`) | `atomic_receive_goods` (cur), `perform_stock_audit` (cur+theo), `apply_stock_count` (theo) | reconcilable — every direct write has a matching ledger row; redundant but consistent |
| **Direct PURE-bypass** (no ledger row) | `update_theoretical_stock` (theo only) | sets the reconciliation TARGET, not derived from ledger |

> current_stock is NOT written by the trigger alone — dual-writers exist. This **validates** the H8 decision (do NOT redefine current_stock = SUM(ledger)): dual-writers would be double-counted. The stored model is the correct SSOT. **34/34 in sync today.**

---

## H1 — Inventory SSOT Contract

**`inventory_logs` IS the canonical ledger. Already in place — freeze as-is.**

- **Canonical ledger:** `inventory_logs`. `stock_transactions` is NOT the ledger.
- **Immutable rules:** `trg_inventory_logs_immutable` blocks UPDATE/DELETE. INSERT-only append. ✅ (Legacy negative/NULL-oi rows are immutable historical.)
- **Idempotency:** `idempotency_key` column + `inventory_logs_idempotency_uidx` partial unique index. Deterministic keys: `consume:{order_item_id}:{ingredient_id}`, `reversal:{order_item_id}:{ingredient_id}:{correlation_id}`. `ON CONFLICT DO NOTHING RETURNING id` dedupes. ✅
- **Quantity/sign semantics:** ledger rows store **positive** quantities; sign derived from `type` by the trigger. New path never writes negative quantities.
- **reference_type/reference_id:** `order` (reference_id=order_id), `manual`, `classification`. `source_type` NULL — candidate for future actor-source tagging.
- **actor/location/org:** `performed_by` (validated via `validate_actor`), `location_id`/`organization_id` enforced.

**H1 action:** NONE. Freeze + document.

---

## H2 — Canonical READY Consumption

> **Audit finding #1:** "3 writers delegate to `consume_stock_for_item`" describes a shared inventory primitive, NOT a single canonical READY **operation**. Delegation ≠ operation contract. This section defines the explicit canonical operation contract.

### 2.1 Exact boundary
READY is the inventory boundary (unchanged, frozen 0.4-A). Consumption fires on `pending|accepted|sent|preparing|cooking → ready`, per item. The trigger boundary is **item-level**.

### 2.2 The canonical operation contract (DECIDED)

```
CANONICAL READY OPERATION:
  mark_item_ready_atomic(p_order_item_id, ...)        ← single canonical entry point
        │  (per-item, item-level transition)
        ▼
  consume_stock_for_item(order_item_id, ...)          ← canonical inventory primitive
        │  (advisory lock + idempotency_key + recipe expansion + outbox)
        ▼
  inventory_logs  (type='order_consumption')          ← immutable ledger
        │
        ▼
  trg_apply_inventory_effect  →  ingredients.current_stock / theoretical_stock
```

**`mark_item_ready_atomic` IS the canonical READY operation.** It is the only entry point that:
- operates at item granularity (matches the trigger boundary),
- wraps each consume in a `BEGIN/EXCEPTION WHEN OTHERS` subtransaction and reverts `kitchen_status` on failure,
- carries actor + audit + `operation_logs`,
- is the route the API layer calls (`/api/orders/mark-ready`).

### 2.3 Inventory primitive (shared, not an operation)
`consume_stock_for_item(p_order_item_id, p_order_id, p_product_id, p_quantity, p_performed_by)` is the **inventory primitive** every READY path routes through. NOT an operation entry point (no kitchen-status transition, no audit log).
- `pg_advisory_xact_lock(hashtext('consume:' || order_item_id))`.
- Legacy guard: `IF EXISTS consumption for order_item_id → RETURN`.
- **Ready product:** 1 ledger row, `quantity = item_quantity`, key `consume:oi:ing`.
- **Recipe product:** loop `recipes WHERE menu_item_id=product_id` (non-AI suggested), per ingredient: `quantity = COALESCE(quantity_brutto, quantity_required) × item_quantity`.
- `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`; emit `inventory.transaction.created` + `inventory.stock_changed`.
- Server-side quantity/pricing source: `order_items.quantity` + `recipes` snapshot (no client-supplied quantity).

### 2.4 Atomicity / concurrency / idempotency
- Atomicity: every caller wraps each consume in a `BEGIN/EXCEPTION WHEN OTHERS` subtransaction (see H7). **Verified** all callers do.
- Concurrency: advisory lock per order_item_id.
- Idempotency: deterministic key + partial unique index + ON CONFLICT + legacy IF EXISTS guard. Re-running READY on an already-consumed item is a no-op.

**H2 action:** DOCUMENT + ENFORCE (via H3/M2). `mark_item_ready_atomic` is declared canonical; the other two dispositioned in H3.

---

## H3 — Legacy Writer Consolidation

> **Audit finding #2:** a COMMENT saying "deprecated" creates no business contract — the DB still executes `mark_ready_atomic()`. This section replaces comment-only deprecation with explicit disposition + enforcement.

### 3.1 Disposition table (DECIDED)

| Entry function | Granularity | Inventory path | Disposition | Enforcement |
|---|---|---|---|---|
| `mark_item_ready_atomic` | item-level | → `consume_stock_for_item` | **CANONICAL** | primary API path; no change |
| `mark_order_ready` | order-level loop (KDS) | → per-item `consume_stock_for_item` | **COMPATIBILITY-ONLY (KDS)** | keep as thin per-item loop; **Invariant:** MUST remain a pure loop over `consume_stock_for_item`, no independent inventory logic. KDS behavior preserved (frozen 0.4-A/B). |
| `mark_ready_atomic` | order-level + `p_complete`→served | → `consume_stock_for_item` only when `p_complete AND unpaid` | **DEPRECATED → compatibility wrapper (Variant B)** | see 3.2 |

### 3.2 `mark_ready_atomic` — Variant B compatibility wrapper (replaces comment-only M2)

**Live finding (verified):** `mark_ready_atomic` has **no independent inventory logic** — its only stock effect is a `PERFORM consume_stock_for_item(...)` loop (line 39), gated on `p_complete AND status != 'paid'`. It is a served-completion wrapper, not a READY operation. Two weaknesses vs canonical:
- consume fires only on the **served** transition (`p_complete=true`), not on READY;
- **no per-item `BEGIN/EXCEPTION`** — a failing ingredient aborts the whole order transaction (whole-order fail).

**Variant B decision:** `mark_ready_atomic` becomes an explicit compatibility wrapper delegating to the canonical item-level engine (plan-only, applied in M2):
- Body reduced to: loop `order_items` → `PERFORM mark_item_ready_atomic(item.id, ...)` per item (the canonical operation), inside a per-item `BEGIN/EXCEPTION` subtransaction, then set order `kitchen_status`.
- It retains NO consume call of its own — all inventory effect flows through `mark_item_ready_atomic` → `consume_stock_for_item`.
- Guarantees: any caller still invoking `mark_ready_atomic()` produces **exactly the same ledger events** as the canonical path, through the same atomic subtransaction structure. The contract is structural, not documentary.

**Why Variant B over Variant A (delete + caller consolidation):** Variant A requires auditing every caller (kitchen, served-completion, payment finalization) before removal — a caller-consolidation project with regression risk on frozen 0.4-A/B flows. Variant B makes the function safe **now** (no divergent inventory path can exist) without touching callers; deletion follows in a later phase after caller audit.

### 3.3 Duplicate-execution already impossible (verified)
1. All three route through `consume_stock_for_item`. After M2, `mark_ready_atomic` routes through `mark_item_ready_atomic` → same path.
2. `consume_stock_for_item` holds advisory lock + IF EXISTS guard + idempotency_key unique index.
3. Live proof: **0 orders appear in both paths**.
4. After M1, even a structural duplicate (oi, ingredient) is rejected at INSERT.

### 3.4 Structural invariant → M1 (with semantic contract, audit finding #2)
No `UNIQUE(order_item_id, ingredient_id) WHERE type='order_consumption'` exists. M1 adds it. NULL-oi historical rows excluded (NULLs distinct in btree) — safe.

**Semantic invariant contract (explicit, freezes M1):**
> A given `(order_item_id, ingredient_id)` may produce **at most one** `order_consumption` ledger event over the item's lifetime. Re-consumption / partial consumption on the SAME original item is NOT supported.
>
> The supported correction model (compatible with frozen 0.4-D):
> - **original item** → at most 1 `order_consumption` per ingredient (M1 enforces structurally);
> - **correction** → original item gets `reversal`/compensation events (append-only, not a second consumption); replacement is a NEW `order_item` with its own consumption.
>
> M1 is **not over-strict**: legitimate future flows (correction replacement, re-add) create new `order_item_id`s, not constrained. Only a true duplicate consumption on the same item is blocked — exactly the intended contract.

### 3.5 API routes (verified)
| Route | RPC called | Status |
|---|---|---|
| `/api/orders/mark-ready` | `mark_item_ready_atomic` | canonical |
| `/api/kitchen/void-comp-waste` | `void_order_item_atomic` / `comp_order_item_atomic` / `waste_order_item_atomic` | canonical |
| `/api/orders/refund` | `refund_with_inventory` + `complete_payment_atomic_v2` | canonical (H4) |
| `kitchen/page.tsx` | `mark_order_ready` | compatibility (KDS) |

No route inserts into `inventory_logs` directly. ✅

---

## H4 — Reversal / Void / Waste / Refund (5 separate semantic operations)

> **Audit finding #5:** H4 must not be "waste-only". void/refund/return/waste/correction are 5 separate semantic operations, each with an explicit contract.

Canonical reversal primitive `_inventory_reverse_item` exists and is wired everywhere. Below are the 5 operations as separate contracts. **No operation mutates historical ledger rows** — all append new rows (immutability enforced).

### 4.1 Operation 1 — Void BEFORE consumption (item not yet ready)
```
contract: item not consumed → no inventory effect
path: void_order_item_atomic → _inventory_reverse_item → SUM(consumed)=0 → no-op
ledger: 0 new rows
current_stock: unchanged
item state: kitchen_status='voided'
```
No stock to return. ✅ correct.

### 4.2 Operation 2 — Void AFTER consumption (item was ready/served)
```
contract: consumed item voided → append reversal, restore stock
path: void_order_item_atomic / void_item_atomic → _inventory_reverse_item
ledger: +1 type='reversal' row per ingredient (+qty), key reversal:{oi}:{ing}:{corr}
current_stock: +qty (via trigger)
theoretical_stock: +qty (via trigger)
item state: kitchen_status='voided'
```
Original `order_consumption` row is NEVER mutated (immutable). ✅

### 4.3 Operation 3 — Refund AFTER consumption (fate-gated, NOT auto-return)
> **Audit finding #5 critical:** Payment refund ≠ automatic inventory return. A refunded steak the customer already ate must NOT return to stock. This is already handled in DB — verified.

```
contract: refund selects an explicit item_fate
path: refund_with_inventory(p_item_fate = 'return_to_stock' | 'waste')
  - return_to_stock → type='reversal' (+stock): ingredient physically returned
  - waste           → type='waste' (stock stays deducted): ingredient consumed/spoiled
  - DEFAULT = 'waste' (refund does NOT auto-return stock)
ledger: +1 row (reversal OR waste) per fate
current_stock: +qty if return_to_stock; unchanged if waste
```
**The `p_item_fate` parameter IS the contract:** operator must explicitly choose return-to-stock. A plain refund keeps stock deducted. ✅ No `current_stock +=` shortcut without explicit fate.

### 4.4 Operation 4 — Return-to-stock
```
contract: ingredient physically returned to inventory (separate from order flow)
path: return_to_stock → type='stock_return'
ledger: +1 type='stock_return' row (+qty)
current_stock: +qty (via trigger)
```
Out of order-consumption scope (inventory ops). ✅

### 4.5 Operation 5 — Waste (frozen, Option A preserve — M3 SKIP)
> **Audit decision:** Option A — preserve current behavior. M3 = SKIP. 0.4-A–G frozen; waste semantics is a separate business-policy decision.

```
contract (PRESERVED as-is): wasted order item reverses stock
path: waste_order_item_atomic → _inventory_reverse_item
ledger: +1 type='reversal' row (+qty)
current_stock: +qty (stock returns)
item state: kitchen_status='wasted'
```
**Documented limitation:** semantically a wasted item's ingredients were physically used — stock arguably should NOT return. But changing this requires explicit business-policy approval + proof no frozen 0.4-A–G contract assumes waste-restores-stock. **Deferred to a future phase.** H4 explicitly documents current behavior; no change in H.

### 4.6 Cancellation
```
contract: cancel order/table → reverse consumed items only
path: cancel_order_items / cancel_table_orders → _inventory_reverse_item
ledger: +reversal rows for consumed items only
```
✅ canonical.

### 4.7 Correction (frozen 0.4-D) — see H5
Correction is a separate operation (item-level correction, not order void). Contract in H5.

**H4 action:** DOCUMENT the 5 contracts. No migration (M3 SKIP). The `refund_with_inventory` fate parameter already enforces refund≠auto-return.

---

## H5 — Correction Integration

**0.4-D `correct_item_atomic` is frozen AND already integrated with inventory.**

Live body (verified):
- Token-based auth, correction types: `quantity | modifiers | price_tax | void_readd`.
- Determines `v_stock_consumed` (was the item produced?).
- If consumed:
  1. Emits `inventory.reversal_requested` outbox event (aggregate `order_item`, status `pending`).
  2. **Synchronously** calls `_inventory_reverse_item(item_id, reason, staff_id, correction_id)` in the same transaction — exactly-once, keyed by correction correlation.
- `item_corrections` table has `UNIQUE(idempotency_key)` (0 rows — never exercised).

**H5 action:** NONE. The chain `correct_item_atomic → inventory.reversal_requested → _inventory_reverse_item` is complete. Do not modify frozen 0.4-D semantics. **No A–G conflict** — inventory integration is additive (emits event + appends reversal row), non-destructive.

**Gap to verify (H10 — mandatory):** since `item_corrections=0`, the reversal path has never run end-to-end. H10 #C1–C5 must exercise a real correction → reversal → replacement → re-consumption chain.

---

## H6 — Recipe / Ingredient Contract

**Scoped OUT of this phase** (modifier inventory out of scope per requirement).

- **Recipe version/snapshot:** none. `recipe_headers` dead (0 rows, no version). `recipes` flat, read live. Snapshot is implicit (ingredient.unit copied into ledger row at consume time). No versioning in H. Future phase may add `recipe_versions`.
- **UOM behavior:** **identity (no-op)**. No `uom_conversions` table/function. Ledger stores `unit = ingredient.unit`. Documented as identity until a future UOM phase.
- **Ingredient quantity:** `COALESCE(quantity_brutto, quantity_required) × order_item.quantity`. ✅
- **Yield / waste factor:** `hot_waste_percentage` exists (consumption does not currently apply it — `quantity_brutto` expected to already be gross). Document; do not change math.
- **Missing recipe behavior:** no recipe rows + not `is_ready_product` → no ledger row (silent no-consumption). Keep; flag for future.
- **Ready-product / direct ingredient:** `is_ready_product + direct_ingredient_id` → 1 ledger row, `quantity = item_quantity`. ✅
- **Modifier inventory:** no link. **Out of scope** (greensfield, future phase).

---

## H7 — Atomicity / Failure Semantics (incl. multi-ingredient partial failure)

> **Audit finding #6:** test must prove stock-failure rollback, not just RPC-error rollback.

`consume_stock_for_item` has **no internal SAVEPOINT** around its recipe loop (verified: lines 78–101, per-ingredient INSERTs, no inner EXCEPTION). Atomicity depends on the **caller's** `BEGIN/EXCEPTION WHEN OTHERS` subtransaction rolling back the whole consume call on any ingredient failure.

### 7.1 Per-caller atomicity (verified live)
- ✅ `mark_item_ready_atomic` — consume at L59 inside `BEGIN/EXCEPTION` (L57–62); handler reverts `kitchen_status`. Per-item resilient.
- ✅ `mark_order_ready` — consume at L26 inside `BEGIN/EXCEPTION` (L25–28). Per-item resilient.
- ✅ `mark_ready_atomic` — consume at L39, no per-item handler; error aborts whole transaction → rollback. No half-consumption (whole-order fail). After M2, routes through `mark_item_ready_atomic` subtransactions.

### 7.2 Failure matrix
| Failure | Behavior | Status |
|---|---|---|
| insufficient stock | consumption proceeds (no stock-check gate); `current_stock` may go negative. No exception. | ⚠️ documented (POS back-of-house allows negative) |
| missing recipe | no ledger row (silent); item still marked ready | ⚠️ documented (H6) |
| invalid ingredient | recipe loop skips | ✅ |
| concurrent consumption (same item) | advisory lock + IF EXISTS + idempotency unique → exactly one row | ✅ |
| duplicate request (retry) | idempotency_key ON CONFLICT DO NOTHING → no-op | ✅ |
| partial failure (one item in order fails) | per-item subtransaction; failed item rolled back, others proceed | ✅ no half-consumed item |

### 7.3 Multi-ingredient partial-failure rollback test (H10 mandatory, audit #6)
```
Setup:
  Ingredient A = 10, Ingredient B = 0
  Recipe: A=2, B=1  (same product, 2 ingredients)

Action: READY called on item (qty 1)

Expected (stock-failure path):
  - Ingredient B consume raises (or B=0 triggers failure path)
  - BEGIN/EXCEPTION handler catches
  - Ingredient A partial INSERT rolled back (subtransaction)
  - inventory_logs: 0 new order_consumption rows for this item
  - ingredients.current_stock: A unchanged (10), B unchanged (0)
  - order_item.kitchen_status: reverted to previous state
  - stock_failed incremented
  => NO half-consumption: ledger + current_stock + item state all rolled back together
```
**Acceptance:** the rollback must be proven across **all three** layers (ledger rows, current_stock, item status) — not just "RPC returned an error".

**H7 action:** NONE (code-level). Document the no-hard-stock-gate design. The 7.3 test is mandatory in H10.

---

## H8 — Ledger / Stock Read Model (with mutation matrix)

> **Audit finding #3:** H8 must define the quantity layers and a per-operation mutation matrix, else future `UPDATE ingredients SET current_stock` bypasses the ledger.

### 8.1 Quantity layers (DECIDED)
```
inventory_logs            → canonical immutable inventory ledger (append-only)
ingredients.current_stock → operational stock balance (stored, maintained by approved paths)
ingredients.theoretical_stock → separate planning/count target (stored)
```
current_stock is NOT `SUM(inventory_logs)`. It is a **stored operational balance** maintained by approved mutation paths (trigger + dual-writers). theoretical_stock is a **separate calculated/planning value**.

### 8.2 Mutation matrix (per operation — verified live)

| Operation | Ledger row (`inventory_logs`) | current_stock writer | theoretical_stock writer |
|---|---|---|---|
| **Sale consumption** (order_consumption) | `consume_stock_for_item` INSERT, type=`order_consumption` | `trg_apply_inventory_effect` (−qty) | `trg_apply_inventory_effect` (−qty) |
| **Reversal** (void/refund-return/cancel) | `_inventory_reverse_item` INSERT, type=`reversal` | `trg_apply_inventory_effect` (+qty) | `trg_apply_inventory_effect` (+qty) |
| **Refund→waste** | `refund_with_inventory` INSERT, type=`waste` | `trg_apply_inventory_effect` (−qty, stays deducted) | `trg_apply_inventory_effect` (−qty) |
| **Return-to-stock** | `return_to_stock` INSERT, type=`stock_return` | `trg_apply_inventory_effect` (+qty) | `trg_apply_inventory_effect` (+qty) |
| **Waste (item)** | `waste_order_item_atomic` → `_inventory_reverse_item`, type=`reversal` (Option A preserved) | `trg_apply_inventory_effect` (+qty) | `trg_apply_inventory_effect` (+qty) |
| **Purchase / stock-in** | `process_stock_in`/`atomic_receive_goods` INSERT, type=`stock_in` | `trg_apply_inventory_effect` (+qty) **AND** `atomic_receive_goods` direct UPDATE (dual-write) | `trg_apply_inventory_effect` (+qty) |
| **Stock audit** | `perform_stock_audit` INSERT, type=`adjustment` | `trg_apply_inventory_effect` (+qty, current only) **AND** direct UPDATE (dual-write) | `perform_stock_audit` direct UPDATE (dual-write) |
| **Stock count** | `apply_stock_count` INSERT, type=`adjustment` | `trg_apply_inventory_effect` (current only) | `apply_stock_count` direct UPDATE (theo) (dual-write) |
| **Theoretical set** | none | — | `update_theoretical_stock` direct UPDATE (pure-bypass) |
| **Historical repair** | INSERT, type=`historical_repair` | `trg_apply_inventory_effect` (current only) | — (theo is the reconciliation target) |

### 8.3 SSOT contract rules (freeze)
1. **Order-consumption + reversal flow (H scope):** current_stock/theoretical_stock are written **only** by `trg_apply_inventory_effect` via ledger INSERT. No direct UPDATE in this flow. ✅
2. **Stock-in/audit/count:** dual-write (ledger + direct UPDATE) — redundant but consistent. These are **approved** mutation paths, NOT bypasses. Documented; preserved.
3. **Pure-bypass** (`update_theoretical_stock`): sets the reconciliation TARGET (theoretical), never current_stock. Approved.
4. **Forbidden (contract):** any NEW writer doing `UPDATE ingredients SET current_stock` without a matching ledger row is a contract violation. M1 + the mutation matrix make this auditable.
5. **Do NOT** redefine `current_stock = SUM(signed ledger)` — proven wrong: dual-writers would double-count.

### 8.4 Reconciliation report (read-only, no mutation)
A verification SQL computing `expected = SUM(signed effect by type)` per ingredient and comparing to `current_stock`. Acceptance tool for H12, not a repair. (Today: 0 drift.)

**H8 action:** DOCUMENT the matrix + rules. No migration. Baseline preserved.

---

## H9 — Audit / Outbox / Security

**Outbox wired but unexercised for inventory. Verify on first real consumption.**

- `emit_outbox_event(aggregate_type, aggregate_id, event_type, payload, metadata)` is **real** (INSERT). ✅
- `consume_stock_for_item` emits `inventory.transaction.created` + `inventory.stock_changed`. `_inventory_reverse_item` emits the same for reversals. `correct_item_atomic` emits `inventory.reversal_requested`. ✅
- **0 `inventory.*` events exist** → upgraded emit path never ran in production. **H10 must trigger one real consume + one reversal** and confirm events land (`status='pending'`).
- Event catalog (freeze): `inventory.transaction.created` (aggregate=inventory), `inventory.stock_changed`, `inventory.reversal_requested` (aggregate=order_item).
- Actor/org/location: `performed_by` validated; `location_id`/`organization_id` enforced. Permission checks in token-based variants (`authorize()` in `void_item_atomic`, `correct_item_atomic`). Non-token variants rely on API-layer auth — **verify API routes enforce staff/permission** (H11).
- Service-role protection: RPCs `SECURITY DEFINER`; RLS blocks direct table writes (verify H11).

**H9 action:** NONE (code-level). Operational: confirm first real inventory events appear post-freeze.

---

## H10 — Concurrency / Idempotency / Correction E2E (expanded)

> **Audit findings #4/#7:** mandatory correction→reversal→replacement→re-consumption E2E; legacy+canonical simultaneous zero-double-consumption proof. Tests run on **staging/fixture**, never live.

### A — Consumption
A1. same item READY twice (retry) → no-op second, no double deduction
A2. same item simultaneous READY ×2 → exactly one `order_consumption` row, one stock effect
A3. same order through legacy `mark_order_ready` + canonical `mark_item_ready_atomic` concurrently → per-item idempotency, **zero double-consumption** (audit #7 mandatory)
A4. two different items same order concurrent → both consume independently
A5. two ingredients same recipe concurrent consume → both rows, distinct keys
A6. missing recipe → no ledger row (documented)
A7. insufficient stock → proceeds, current_stock may go negative (documented)
A8. invalid ingredient → skipped, no row

### B — Reversal
B1. void before consumption → no reversal row, no stock change (H4.1)
B2. void after consumption → +reversal row, +stock (H4.2)
B3. refund after consumption (fate=waste default) → +waste row, stock stays deducted (H4.3)
B4. refund after consumption (fate=return_to_stock) → +reversal row, +stock (H4.3)
B5. duplicate reversal (retry) → `reversal:{oi}:{ing}:{corr}` unique → no double restore
B6. reversal racing with consumption → ordering under advisory lock; no-op if not yet consumed

### C — Correction (audit #4 mandatory E2E)
```
C1. READY item (Chicken ×2) → consumes 400g (ledger: order_consumption −400)
C2. correct_item_atomic (Chicken ×1) → inventory.reversal_requested + reversal +200g
C3. replacement item (Chicken ×1, NEW order_item_id) → READY → consumes 200g
C4. duplicate correction → idempotency → no double reversal
C5. correction racing with READY → advisory lock ordering

Final ledger for the original+replacement:
  original   −400
  reversal   +200
  replacement −200
  = −400   (matches Chicken ×2 then corrected to ×1+×1 = net ×2)
Final current_stock: consistent with −400.
```
**Acceptance:** outbox events present at each step (`inventory.transaction.created`, `inventory.reversal_requested`, `inventory.stock_changed`); `item_corrections` row created; reconciliation 0 drift.

### D — Per-test assertions (every test checks all layers)
For each test, assert simultaneously:
- `inventory_logs` count + quantity (no phantom rows)
- `ingredients.current_stock` (matches expected)
- `order_item.kitchen_status` (matches expected)
- `outbox_events` (event present, `status='pending'`)
- `operation_logs` / `audit_logs` (actor recorded)
- reconciliation = 0 drift

**Acceptance:** 0 duplicate ledger rows; 0 double stock effect; outbox events present for every new consume/reversal; correction chain end-to-end green.

---

## H11 — Legacy Regression

Regression test all frozen 0.4-A→G flows end-to-end (staging):
- **0.4-A order lifecycle:** create → confirm → kitchen → ready → served → paid/closed.
- **0.4-B item lifecycle:** add → accept → ready → void / waste / comp → correction.
- **0.4-C KDS:** ticket accept, mark ready (order-level), batch ready.
- **0.4-D correction:** `correct_item_atomic` all 4 types; verify inventory reversal on consumed items (H10 C).
- **0.4-E table kitchen state:** transfer, merge/unmerge, dismiss, kitchen_changed.
- **0.4-F payment/finalization:** `process_order_payment`, `complete_payment_atomic_v2`, refund (`refund_with_inventory` both fates).
- **0.4-G transfer/merge/dismiss:** `dismiss_table_session`, `reopen_order_atomic`, `cancel_table_orders` → `_inventory_reverse_item`.

**Inventory invariants after each flow:** reconciliation = 0 drift; no negative `order_consumption` rows from new path; all new reversals `type='reversal'`.

---

## H12 — Production Safety / Freeze

### 12.1 Migration order (plan-only, H is PLAN ONLY until reviewed)

| # | Filename | Purpose | DB objects | Risk |
|---|---|---|---|---|
| **V0** | (no migration) | Baseline verification script — read-only assertions | none | none |
| **M1** | `H01_inventory_consume_unique.sql` | Structural exactly-one-consumption invariant (semantic contract in H3.4) | 1 partial unique index `inventory_logs_consume_uidx` | low — NULL-oi historical excluded |
| **M2** | `H02_mark_ready_atomic_wrapper.sql` | **DEFERRED — frozen-contract conflict proven (execution halted by user decision 2026-07-29).** See M2 conflict note below. | — | — |
| **M3** | — | **SKIP** (Option A preserve waste; deferred to future business-policy phase) | none | — |

> **No data-repair migration.** No trigger change. No current_stock mutation. No historical backfill.

### 12.2 Pre/post counts (acceptance gates)
- Pre: inventory_logs=709, ingredients in sync=34/34, outbox inventory events=0, reversal rows=0, item_corrections=0.
- Post M1: index created; 709 rows still valid (no conflict).
- Post M2: `mark_ready_atomic` produces identical ledger events to `mark_item_ready_atomic`; H11 regression green.
- Post freeze + first real flow: inventory events>0, reversal rows>0 (if exercised), reconciliation=0 drift.

### 12.3 Zero production mutation rule
- No `UPDATE`/`DELETE` on `inventory_logs` (immutable trigger enforces).
- No `current_stock`/`theoretical_stock` direct writes by H migrations.
- No historical row backfill.
- Only **new** ledger events from normal operations post-freeze.

### 12.4 Rollback strategy
- M1 (index): `DROP INDEX IF EXISTS inventory_logs_consume_uidx;` — fully reversible.
- M2 (wrapper): restore previous `mark_ready_atomic` body from migration down-script.
- M3: N/A (skipped).

### 12.5 Test fixture isolation
H10/H11 run on **staging DB copy** or fixture, never live `jbxmlnsicbfkbsatnoej`. Live touched only by reviewed M1/M2 in a low-traffic window.

### 12.6 Final verification
- Reconciliation = 0 drift (all 34).
- `SELECT count(*) FROM inventory_logs WHERE type='order_consumption' AND order_item_id IS NOT NULL AND idempotency_key IS NULL` = 0 for new rows (legacy excluded by timestamp).
- Outbox `inventory.*` events appear for new operations.
- No frozen A→G flow regression (H11).

---

## Final Deliverable — Migration-by-migration plan

### V0 — Baseline verification (NO migration, read-only script)
- **Purpose:** lock the healthy post-2026-07-29 state as the H baseline.
- **DB objects changed:** none.
- **RPCs/triggers affected:** none.
- **API routes affected:** none.
- **Invariants asserted:** 34/34 in sync; 0 double-deduction triggers; single `trg_apply_inventory_effect`; `inventory_logs_idempotency_uidx` present; `inventory_transactions` absent; `reverse_stock_deduction_for_items` absent.
- **E2E tests:** none.
- **Rollback:** N/A.
- **Dependencies on 0.4-A–G:** none.
- **NOT changed:** everything.

### M1 — `H01_inventory_consume_unique.sql`
- **Purpose:** make exactly-one-consumption-per-(item,ingredient) **structural** (semantic contract in H3.4: original item max 1 order_consumption/ingredient; correction = reversal + new-item consumption).
- **DB objects changed:** `CREATE UNIQUE INDEX inventory_logs_consume_uidx ON inventory_logs (order_item_id, ingredient_id) WHERE type='order_consumption' AND order_item_id IS NOT NULL;`
- **RPCs/triggers affected:** none directly. `consume_stock_for_item` already uses `ON CONFLICT DO NOTHING`; index gives the procedural guard a structural backstop.
- **API routes affected:** none.
- **Invariants:** at most one `order_consumption` row per (order_item_id, ingredient_id). Correction/replacement use new order_item_ids → unconstrained.
- **E2E tests:** H10 A1, A2, A3 (duplicate consumption rejected/merged); C-chain (correction creates new item, not blocked).
- **Rollback:** `DROP INDEX inventory_logs_consume_uidx;`
- **Dependencies on 0.4-A–G:** none (additive constraint on inventory only).
- **NOT changed:** consume function body, triggers, current_stock, historical rows.

### M2 — `H02_mark_ready_atomic_wrapper.sql` — DEFERRED (frozen-contract conflict proven)

> **Execution status:** NOT APPLIED. Halted by user decision after a proven conflict was surfaced.
>
> **Conflict (verified live, line-level):** `mark_ready_atomic` body line 32 gates consumption on `IF p_complete AND v_order.status != 'paid'` — i.e. consumption happens ONLY on the served (`p_complete=true`) transition, NOT on plain ready. On `p_complete=false` it does NOT consume (only sets `kitchen_status='ready'`). Meanwhile `mark_item_ready_atomic` consumes on EVERY call and sets item status to `'ready'` (not `'served'`).
>
> Naive Variant B delegation would therefore:
> 1. **`p_complete=false` path:** add consumption where there is currently none → NEW side-effect → violates protective condition #1.
> 2. **`p_complete=true` path:** set items to `'ready'` instead of `'served'` → breaks frozen 0.4-A served semantics → violates "0.4-A–G reopen ❌ NO".
>
> **Mitigating fact:** deep-search of the entire codebase found **ZERO callers** of `mark_ready_atomic` (only macOS SDK `nw_framer_mark_ready` matches). The function is effectively dead/defensive code; the divergent-path risk it poses is not actively triggerable.
>
> **Decision (user, 2026-07-29):** Defer M2. Do NOT rewrite `mark_ready_atomic`. H halts here with M1 applied only. M2 (and any wrapper/delete) is a future-phase item requiring an explicit caller audit + business approval, because it touches frozen 0.4-A served-completion semantics.
>
> **NOT changed:** `mark_ready_atomic` body (preserved exactly), `mark_item_ready_atomic`, `mark_order_ready`, `consume_stock_for_item`, triggers, API routes.

### M3 — SKIP (Option A preserve waste)
- **Decision:** waste semantics unchanged in H. Deferred to a future business-policy phase requiring explicit approval + A–G conflict proof.
- **NOT changed:** `waste_order_item_atomic`, waste inventory behavior.

---

## Explicit NOT-changed list (freeze contract)
1. ❌ No double-deduction repair (already fixed).
2. ❌ No historical 27 897-unit repair (already done).
3. ❌ No `inventory_transactions` migration (does not exist).
4. ❌ No `UNIQUE(order_item_id)` on phantom table (does not exist).
5. ❌ No `current_stock` corruption repair (34/34 in sync).
6. ❌ No new immutability trigger (already present).
7. ❌ No new idempotency_key column/index (already present + partial unique).
8. ❌ No `current_stock = SUM(...)` view replacement (stored model preserved; dual-writers proven).
9. ❌ No recipe versioning / UOM conversion / modifier inventory (out of scope — H6 future).
10. ❌ No mutation of historical ledger rows (594 NULL-oi, 91 negative — immutable).
11. ❌ No frozen 0.4-A→G contract reopened (void/refund/return/waste/correction semantics unchanged; waste Option A preserve).
12. ❌ No backfill of `order_item_id` onto historical NULL-oi rows.
13. ❌ No waste semantics change (M3 SKIP).

---

## Freeze Gate (decisions to confirm before any migration)
1. Accept H = **verify+freeze**, not repair. ✅
2. Accept `current_stock`/`theoretical_stock` stay stored (not a view). ✅
3. Accept `mark_item_ready_atomic` as the **canonical READY operation**; `mark_order_ready` compatibility (KDS); `mark_ready_atomic` Variant B wrapper. ✅
4. Apply **M1** consume-unique index (semantic contract H3.4)? ✅ / skip
5. Apply **M2** Variant B wrapper on `mark_ready_atomic`? ✅ / skip
6. Waste semantics: **Option A (preserve)** [DECIDED — M3 SKIP].
7. Confirm H10/H11 run on staging/fixture only, never live. ✅
8. Confirm `mark_ready_atomic` caller audit + future deletion is a LATER phase (not H). ✅

> **Final gate:** H remains **PLAN ONLY** until reviewed. No SQL migration, no trigger change, no production repair, no stock mutation.
