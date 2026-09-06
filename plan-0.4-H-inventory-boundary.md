# PLAN — 0.4-H Inventory Boundary / Stock Effects

> **Status:** DRAFT for freeze. No production migration has been applied.
> **Base:** live Supabase project `jbxmlnsicbfkbsatnoej` (region eu-central-1), audited read-only.
> **Asset under change:** canonical inventory boundary. Frozen 0.4-A→G state-machine contracts are NOT reopened.

---

## 1. Scope & Goal

Canonicalize **when and how order operations affect inventory**, establishing **one** inventory boundary,
**one** writer, and **one** idempotency/event model — without reopening frozen 0.4-A→G order/table/state contracts.

Confirmed production fact drives the design:

```text
READY is already the effective inventory boundary
(2 active consumption writers, 2 stock-mutating triggers)
```

0.4-H does NOT introduce a new PREPARING/SERVED boundary. It makes READY consumption canonical.

---

## 2. Live Audit Evidence (real DB, read-only)

### 2.1 Ledger reality
| Object | Live state |
|---|---|
| `inventory_logs` | **678 rows — the real ledger.** enum type: stock_in 44, waste 1, adjustment 18, order_consumption 615 |
| `inventory_transactions` | **0 rows.** Legacy/parallel. `UNIQUE(order_item_id)` lives here; nothing writes real stock from it |
| `recipes` | 60 rows flat; `recipe_headers` **0 rows** (dead header design) |
| `items_corrections` | 0 rows (correction flow never exercised in live data) |
| `outbox_events` | 93 events (`order.*`, `location.*`, `table.*`, `kds.ticket.*`) — **0 inventory.\* events** |
| `ingredients` | 34 rows: current_stock, theoretical_stock, average_cost_per_unit, min/critical_limit, supplier_id |
| `products` | 14 rows; `is_ready_product` + `direct_ingredient_id` + `has_active_recipe` |
| modifier ingestion | **none** — `product_modifiers` has no ingredient link (H6 is greenfield) |

### 2.2 Consumption writers (only two)
| Path | RPC | Ledger target | order_item_id |
|---|---|---|---|
| KDS + admin useOrders | `mark_order_ready` | `inventory_logs` | **NULL (order-level)** |
| `/api/orders/mark-ready` | `mark_item_ready_atomic` → `consume_stock_for_item` | `inventory_logs` | item uuid |

Historical footprint: **order-level 376 rows / 61 orders**, **item-level 21 rows / 14 orders**.
**0 orders** were consumed by both writers; **0 exact duplicate** `(order_item_id, ingredient_id)` groups.
=> The live inconsistency is **not** duplicate writer rows; it is the **trigger-level double mutation** below.

### 2.3 Stock mutation triggers on `inventory_logs` (AFTER INSERT, ROW)
```text
trg_inventory_logs_after_insert → deduct_stock_on_consumption()   order_consumption → current_stock −q
trg_update_stock_on_log         → update_stock_on_log()           order_consumption/waste/adjustment → current_stock −q
trg_theoretical_stock           → update_theoretical_stock()      theoretical_stock ∓q
trg_wac_on_stock_in             → apply_wac_on_stock_in()         stock_in only → WAC, never current_stock
```
**Both row triggers mutate `current_stock` for the same insert ⇒ double deduction.**
Data proof: on consumed ingredients `current_stock ≈ 2 × theoretical_stock`
(Qızardılmış soğan 399 960 vs 199 980; Marul 3 800 vs 1 900; coca cola 330 ml 306 vs 144).
Gross ledger/report reconciliation diverges (e.g. avocado ledger −184 000 vs current 0).

Additional latent defect: `update_stock_on_log` treats `stock_return`/`order_restore` via its `ELSE`
branch **as a decrement** (opposite of intended), and `process_stock_in` adds stock **twice**
(direct UPDATE + trigger). All resolve to the same root cause: **multiple mutation paths**.

### 2.4 Reversal / void reality
| Function | Wired from | Today's inventory behavior |
|---|---|---|
| `mark_item_ready_atomic` | `/api/orders/mark-ready` | consume; on stock error reverts item status (half-state avoided) |
| `mark_order_ready` | KDS + admin | order-level consume; no order_item_id; independent guard |
| `void_order_item_atomic` | kitchen route | reversal written to **empty `inventory_transactions`** ⇒ real stock NOT restored; sets `cancelled` |
| `waste_order_item_atomic` | kitchen route | same empty-ledger reversal |
| `comp_order_item_atomic` | kitchen route | no inventory effect |
| `void_items_state_aware` | `/api/orders/void`, approvals | blocks READY/SERVED items; no inventory touch (semantically OK for un-consumed) |
| `void_item_atomic` | not wired | emits `order_item.voided` outbox; **no reversal** |
| `correct_item_atomic` | **not wired** | 0.4-D frozen: emits `inventory.reversal_requested` ONLY when consumed |
| `reverse_stock_deduction_for_items` | admin OrderModal | **mutates historical ledger rows** to negative qty + writes `ingredients.current_stock` directly |
| `refund_with_inventory` / `return_to_stock` | /api/orders/refund, /return-to-stock | write `stock_return` logs which (as of 2.3) decrement stock |
| `record_item_waste` | /api/orders/waste | cancelled_orders + void item; **no inventory log** |

Residue confirmed in live data: 52 negative `order_consumption` rows (−2 935 units) with `order_item_id IS NULL`
(origin not attributable to any current wired writer — to be classified in repair step H10).

### 2.5 SSOT conflicts with frozen contracts
- 0.4-G touched `inventory_transactions` only in doc/comments; the atomic table ops (`transfer_table_atomic`
  etc.) do **not** touch inventory. These frozen contracts stay untouched.
- Two void functions disagree on terminal state (`cancelled` vs `voided`) and inventory effect.
- `state_transitions` registry (0.4-D) expects `ready→voided` with `order.void`+override; wired kitchen RPCs
  bypass it.

---

## 3. Guiding Principles (frozen decisions)

1. `inventory_logs` is the **single immutable canonical inventory ledger**. Nothing else mutates stock.
2. One and only one **stock mutation path**. `ingredients.current_stock`/`theoretical_stock` are read-models fed by that path.
3. READY is the consumption boundary. No new PREPARING/SERVED boundary in H.
4. Reversals are **new ledger events**, never edits/deletes of history.
5. Historical rows are **never updated**. Repair is new immutable `historical_repair` ledger events.
6. Idempotency keys + correlation live on the ledger.
7. Every canonical mutation preserves actor, organization, location, correlation, idempotency, audit, outbox.
8. No behavioral change to 0.4-A→G frozen RPCs/contracts; internal inventory delegation only.

---

## H1 — Canonical Inventory Ledger + Event Contract

### 1.1 Table changes (additive only)
```sql
ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS unit             text,           -- UOM snapshot (gram/ml/piece)
  ADD COLUMN IF NOT EXISTS correlation_id   uuid,           -- links reversal→original, correction→original
  ADD COLUMN IF NOT EXISTS idempotency_key  text,           -- uniqueness for retry/concurrency
  ADD COLUMN IF NOT EXISTS performed_by     uuid;           -- actor (mirrors other tables)
ALTER TYPE public.inventory_log_type ADD VALUE IF NOT EXISTS 'reversal';
ALTER TYPE public.inventory_log_type ADD VALUE IF NOT EXISTS 'historical_repair';
CREATE UNIQUE INDEX IF NOT EXISTS inventory_logs_idempotency_uidx
  ON public.inventory_logs (idempotency_key) WHERE idempotency_key IS NOT NULL;
```
`organization_id`, `location_id`, `order_id`, `order_item_id`, `ingredient_id`, `quantity`,
`reference_type/reference_id`, `notes` already exist — reused as-is.

### 1.2 Immutability
```sql
CREATE FUNCTION public.trg_inventory_logs_immutable() RETURNS trigger ... ;
CREATE TRIGGER trg_inventory_logs_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventory_logs_immutable();
```
Hard block for every caller (including service_role). Repair is INSERT-only.
All current UPDATE/DELETE callers must be eliminated in the same migration (see H8/H10, Legacy Disposition).

### 1.3 Canonical event semantics (replaces free-text `reason`)
| ledger type | semantics | stock effect | emitted events |
|---|---|---|---|
| `stock_in` | purchase/procurement inflow | +q (WAC recompute) | transaction.created, stock_changed |
| `order_consumption` | READY-boundary consume (q already factor-scaled per ingredient) | −q | transaction.created, stock_changed |
| `reversal` | void/correction/refund/return of consumed scope | +q | transaction.created, stock_changed, (reversal.requested→applied) |
| `waste` | recorded kitchen/sales waste | −q | transaction.created, stock_changed |
| `adjustment` | stock count / audit delta (variance signed) | ±variance, read-model then set per audit | transaction.created, stock_changed |
| `stock_return` | returned-to-stock non-order path | +q | transaction.created, stock_changed |
| `historical_repair` | H10 computed correction | documented delta | transaction.created |

Structured columns: `organization_id`, `location_id`, `ingredient_id`, `order_id`, `order_item_id`,
`quantity`, `unit`, `type`, `reference_type/reference_id`, `performed_by`, `correlation_id`,
`idempotency_key`, `metadata`-equivalent (`notes`), `created_at`.

### 1.4 Migration note
This migration is additive schema + trigger: safe to apply in the controlled sequence before
any writer rewrite (see execution order in §17).

---

## H2 — Canonical READY Consumption

Boundary stays **item.kitchen_status = 'ready'**.

### 2.1 One canonical writer
`consume_stock_for_item(p_order_item_id, p_order_id, p_product_id, p_quantity)`
is **REWRITTEN** to be the exclusive consumption writer:

- computes deterministic idempotency keys:
  - ready product: `consume:{order_item_id}:{direct_ingredient_id}`
  - recipe product: `consume:{order_item_id}:{ingredient_id}` per ingredient
- `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` (H4)
- resolves recipe from `recipes` where `is_ai_suggested = false` (existing behavior kept)
- ready product resolves `products.direct_ingredient_id`
- always populates `unit`, `correlation_id`, `performed_by`
- emits `inventory.*` outbox events (H11) in the same transaction

### 2.2 `mark_order_ready` — REWRITE internals, same signature/return
- REMOVE its manual order-level INSERT into `inventory_logs` (the 376-row legacy shape).
- Instead iterate items in the `ready` transition set and invoke the canonical writer per item
  inside the **same transaction** (delegation, not duplication).
- Keep its status/table/order_source side-effects verbatim (frozen KDS behavior).
- Return shape gains `consumed_items`, `consumption_failed` counters (additive).

### 2.3 `mark_item_ready_atomic` — KEEP + harden
- KEEP current READY transition + per-item rollback on failure.
- ADD advisory lock on `order_item_id` for concurrent calls (H4).
- Keep reporting `stock_failed` count; never leave half-state (existing behavior preserved).

Result: KDS (mark_order_ready) and admin (mark_item_ready_atomic) both flow through the SAME
item-level canonical writer ⇒ one writer, one idempotency model.

---

## H3 — Recipe / Direct Product Consumption Math

### Recipe product
```text
order_item (qty)
  → product → recipes[is_ai_suggested=false] → ingredient
  → ingredient consumption = COALESCE(quantity_brutto, quantity_required) × order_item.quantity
  → ledger row per (order_item, ingredient) with unit = ingredient.unit
```
### Ready product
```text
order_item (qty)
  → product.direct_ingredient_id
  → ingredient consumption = order_item.quantity
  → ledger row with unit = ingredient.unit
```
- UOM: snapshot `ingredient.unit` into `inventory_logs.unit`. Conversion is identity unless a future
  `uom_conversions` table is added; no modifier inventory is invented in H (H6 = future contract gap).
- Does NOT touch legacy `inventory_transactions`.
- Recipe table is kept (no rename to `recipe_items`).

---

## H4 — Idempotency + Inventory Uniqueness

### 4.1 Invariant
`UNIQUE(order_item_id)` is insufficient (multi-ingredient recipes). Canonical invariant:
```text
UNIQUE (idempotency_key)  where idempotency_key IS NOT NULL
```
with deterministic keys (H2.1). A recipe item yields **n distinct keys** (one per ingredient);
a ready product yields **1 key**. Exactly-one-effect per logical ingredient effect is enforced by the unique index.

### 4.2 Concurrency safety
- Insert path: `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`; if no row returned → already consumed → no stock effect.
- `pg_advisory_xact_lock(hashtext('consume:'||order_item_id))` around consumption to serialize concurrent same-item calls.
- Correction/void reversal idempotency: reuse `item_corrections.idempotency_key` (kept UNIQUE) + reversal key
  `reversal:{source}:{corr_or_void_id}:{original ledg id}`.

### 4.3 Legacy constraint
`inventory_transactions_order_item_id_key` is dropped together with the table (Legacy Disposition §16).

---

## H5 — Stock Mutation (Double-Deduction Fix) + Single Mutation Path

### 5.1 Target architecture — ONE mutation path
Replace all current stock mutation with a **single AFTER INSERT row-trigger** on `inventory_logs`:

```sql
-- internal, unlisted to PostgREST
CREATE FUNCTION public.trg_apply_inventory_effect() RETURNS trigger ...;
CREATE TRIGGER trg_inventory_log_effect
  AFTER INSERT ON public.inventory_logs FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_inventory_effect();
```

Dropped in the same migration:
```text
trg_inventory_logs_after_insert (deduct_stock_on_consumption)   -- REMOVE
trg_update_stock_on_log        (update_stock_on_log)            -- REMOVE
trg_theoretical_stock          (update_theoretical_stock)       -- REMOVE (merged into the effect fn)
trg_set_inventory_log_unit_cost (set_inventory_log_unit_cost)   -- REMOVE (writer sets unit/unit_cost)
trg_wac_on_stock_in            (apply_wac_on_stock_in)          -- KEEP (WAC, does not touch current_stock)
```
The effect trigger applies the **exact** matrix below. Explicit `UPDATE ingredients.current_stock`
inside `process_stock_in`, `perform_stock_audit`, `apply_stock_count`, `reverse_stock_deduction_for_items`
is **removed** — the ledger trigger is the only mutator (audit/stock-count set the read-model to the
counted actual in the same transaction via a dedicated statement, NOT through the trigger path).

### 5.2 Canonical effect matrix
| Event | current_stock | theoretical_stock | WAC (average_cost_per_unit) |
|---|---|---|---|
| `stock_in` | +q | +q | recompute weighted avg |
| `order_consumption` | −q | −q | unchanged |
| `reversal` | +q | +q | unchanged |
| `stock_return` / `order_restore` | +q | +q | unchanged |
| `waste` | −q | −q | unchanged |
| `adjustment` | signed variance | read-model set to counted actual by audit/stock-count fn | unchanged |

`GREATEST(0, …)` clamping removed from the consumption path to make repair math exact
(replace with a non-negative invariant enforced at write time when qty > stock → H7 stock-failure path).

### 5.3 Verification
After this migration, a `SELECT` recomputes `current/theoretical` per ingredient from the ledger and must
match stored values for **new** writes. (Historical divergence is repaired in H10.)

---

## H6 — Void / Reversal

Canonical rule:
```text
NOT CONSUMED (kitchen_status before 'ready') → void → NO inventory reversal
CONSUMED (ready/served/completed)            → void → EXACTLY ONE reversal (new ledger 'reversal' row)
```

### 6.1 Shared internal helper (functional, not exposed to PostgREST unless needed)
```text
_inventory_reverse_item(p_order_item_id, p_reason, p_correlation_id, p_performed_by)
```
- reads original `order_consumption` rows for the item (immutable — read-only)
- if none → returns `no_consumption` (no reversal written)
- if present → inserts one `reversal` ledger row per (item, ingredient) with `quantity = -original.q`,
  `correlation_id = p_correlation_id`, `idempotency_key = reversal:{item}:{ingredient}:{correlation}`
- emits `inventory.transaction.created`, `inventory.stock_changed`, `inventory.reversal.requested` (H11)

### 6.2 Void functions
- `void_order_item_atomic` — **REWRITE**: stop writing to `inventory_transactions`; call helper;
  set kitchen_status `'voided'` (align registry); keep operation_logs audit; keep same signature.
- `void_items_state_aware` — **KEEP**: it already blocks consumed items (ready/served) and touches no
  inventory → consistent with "not consumed ⇒ no reversal". No change.
- `void_item_atomic` — **REWRITE (small)**: on consumed items, emit reversal via helper instead of
  nothing; keep outbox `order_item.voided`.

---

## H7 — Correction Integration (0.4-D frozen, preserved)

`correct_item_atomic` is **KEPT unchanged** as the frozen 0.4-D contract:
- `v_stock_consumed` already decides whether `inventory.reversal_requested` is emitted (item was ready/served/completed).
- replacement starts `pending`, consumed only at its own READY via the canonical writer ⇒ no double consumption.

H adds the **consumer** of that event:
```text
outbox event inventory.reversal_requested  → _inventory_reverse_item(...)  → reversal ledger rows
```
- original not consumed → no reversal (event not emitted by frozen function) ✓
- original consumed → exactly one reversal + replacement consumption at READY ✓
- duplicate corrections deduped by `item_corrections UNIQUE(idempotency_key)` ✓
- original history never mutated ✓

No outbox worker is introduced; the reversal is applied **within the same transaction** that runs
`correct_item_atomic` (event + effect are atomic).

---

## H8 — Refund / Waste / Return Classification

| RPC | Disposition | Change |
|---|---|---|
| `refund_with_inventory` | REWRITE | `return_to_stock` fate → `reversal` ledger rows (via helper); `waste` fate → `waste` ledger rows; remove `stock_return` decrement bug; keep payment/recalc logic verbatim |
| `return_to_stock` | REWRITE | write `reversal`/`stock_return` through canonical path (fixes wrong decrement); same signature |
| `waste_order_item_atomic` | REWRITE | reversal→new ledger rows; drop `inventory_transactions` writes; state `'wasted'` |
| `comp_order_item_atomic` | KEEP | no inventory (confirmed correct — comp is a price concession, stock already consumed at READY) |
| `record_item_waste` | REWRITE (additive) | add `waste` ledger rows when item was consumed (currently none) |
| `reverse_stock_deduction` | DEPRECATE → REMOVE | writes to dead `inventory_transactions` |
| `reverse_stock_deduction_for_items` | REMOVE | mutates history + writes stock directly; admin OrderModal repointed to canonical void/waste paths |

No behavior is changed until the contract is frozen (§Freeze Gate).

---

## H9 — Inventory Read-Model (current_stock / theoretical_stock)

- **Decision: keep stored columns** `ingredients.current_stock` and `theoretical_stock` as the read-model,
  fed by the **single** ledger-effect trigger (H5). No view, no second SSOT.
- App (supabaseClient types, `update_product_availability`, thresholds, UI) keeps reading `ingredients.*`.
- A reconciliation report (read-only SQL/Script) recomputes stock from the ledger and reports drift;
  it is the acceptance tool for H10 repair.

---

## H10 — Historical Double-Deduction Repair

### 10.1 Forensic baseline (live, pre-repair)
| metric | live value |
|---|---|
| order-level consumption rows (order_item_id NULL) | 376 rows / 61 orders |
| item-level consumption rows | 21 rows / 14 orders |
| orders with both writers | 0 |
| exact duplicate (order_item_id, ingredient_id) groups | 0 |
| negative `order_consumption` residue (order-level) | 52 rows, −2 935 units, origin unclassified |
| positive order_consumption units | 47 865 |
| double-deduction evidence | current ≈ 2× theoretical on consumed ingredients |

> Note: earlier assumed figures (17 orders / 301 duplicate rows / 27 897 over-deducted) DO NOT match the
> live DB. This plan commits to the live figures above and to a fresh per-ingredient reconciliation at repair time.

### 10.2 Classification pass (read-only, pre-scripted)
For every `order_consumption` row with `order_id`, classify:
`single` | `double` (two ledger events for one logical effect) | `reversal_residue` (negative) | `unattributed`.
Recipe multi-ingredient rows remain separate events per ingredient (NOT duplicates).

### 10.3 Repair model
- Historical rows untouched.
- New `historical_repair` ledger rows: one per ingredient with `quantity = (derived_expected - read_model)`
  computed by reconciliation, each with `correlation_id`, `performed_by`, `notes` referencing the
  classification query run ID.
- Run inside one transaction guarded by baseline snapshot (below).

### 10.4 Acceptance
`reconciliation report == 0 drift` for all 34 ingredients; `orders/items/inventory baseline unchanged` except
the documented repair ledger rows.

---

## H11 — Audit / Outbox / Security

- Reuse existing `outbox_events` (no new event system). Canonical inventory events:
  - `inventory.transaction.created`
  - `inventory.stock_changed`
  - `inventory.reversal.requested`
  - aggregate_type `'inventory'`, aggregate_id = ingredient_id (or order_item for item-scoped), metadata = correlation.
- Emitted in the **same transaction** as the ledger insert (atomic).
- Audit: existing `audit_logs`/`operation_logs` writes retained; every canonical RPC runs `validate_actor`
  and records performer; service role path is only reachable through SECURITY DEFINER RPCs with explicit actor validation — not via raw REST.
- `inventory_logs` remains immutable (H1.2); `update_product_availability` trigger continues to run (read single mutation path).

---

## H12 — Regression + E2E + Freeze

### 12.1 Scenario matrix (must pass)
- normal consumption (recipe + ready product)
- duplicate consumption (retry/reconnect) — no double effect
- concurrent consumption (advisory lock) — deterministic
- void before consumption (pending/sent/preparing) → no reversal
- void after consumption (ready/served) → exactly one reversal
- correction before consumption → no reversal, replacement consumes
- correction after consumption → one reversal + replacement consumption
- refund (both fates) / waste / return
- insufficient stock → item stays non-ready, no half-state (H7)
- multi-ingredient recipe → n ledger rows, ids unique, no double
- ready product direct ingredient
- location isolation & org isolation
- audit + outbox rows present, test residue = 0 (H12.3)

### 12.2 Legacy regression (must still pass behaviorally)
`mark_order_ready`, `mark_item_ready_atomic`, `consume_stock_for_item`, `void_items_state_aware`,
`void_order_item_atomic`, `comp_order_item_atomic`, `waste_order_item_atomic`, `correct_item_atomic`,
`refund_with_inventory`, `return_to_stock`, `record_item_waste` — plus 0.4-G
`transfer_table_atomic / merge_tables_atomic / unmerge_tables_atomic / dismiss_table_atomic`
(order/table contract unchanged).

### 12.3 Zero-residue gate
```text
orders/order_items/inventory baselines unchanged (except documented repair inserts)
new ledger test rows = 0 (tests run on a dedicated test location/org, then hard-deleted via RPC)
outbox test events = 0
operation_logs test residue = 0
pnpm build PASS
```
→ 0.4-H frozen.

---

## 16. Legacy Path Disposition (explicit, no ambiguous writers)

| Path | Disposition | Reason |
|---|---|---|
| `consume_stock_for_item` | **REWRITE (KEEP name)** | canonical consumption writer (H2/H4) |
| `mark_item_ready_atomic` | **KEEP + harden** | canonical READY boundary; add advisory lock |
| `mark_order_ready` | **REWRITE internals** | delegate to canonical writer; same signature; KDS frozen behavior preserved |
| `void_order_item_atomic` | **REWRITE** | reversal → ledger (H6); drop dead-table writes |
| `void_item_atomic` | **REWRITE** | reversal via helper when consumed |
| `void_items_state_aware` | **KEEP** | already consistent (blocks consumed, no inventory) |
| `correct_item_atomic` | **KEEP (frozen)** | + outbox consumer added (H7) |
| `waste_order_item_atomic` | **REWRITE** | reversal → ledger |
| `comp_order_item_atomic` | **KEEP** | confirmed no inventory effect |
| `record_item_waste` | **REWRITE (additive)** | add `waste` ledger when consumed |
| `refund_with_inventory` | **REWRITE** | reversal/waste ledger rows |
| `return_to_stock` | **REWRITE** | canonical reversal; fixes decrement bug |
| `reverse_stock_deduction` | **DEPRECATE → REMOVE** | writes to dead `inventory_transactions` |
| `reverse_stock_deduction_for_items` | **REMOVE** | mutates history; repoint OrderModal |
| `deduct_stock_on_order` | **DEPRECATE → REMOVE** | writes dead table; guard on wrong ledger; unwired |
| `deduct_inventory_atomic` | **DEPRECATE → REMOVE** | writes dead table; no idempotency; unwired |
| `deduct_stock_for_order` | **REMOVE** | broken (undefined `p_performed_by`) |
| `rollback_inventory_atomic` | **REMOVE** | inversion-of-reversal on dead table |
| `inventory_transactions` (table + UNIQUE idx) | **REMOVE** | empty parallel ledger; invariant relocated to `inventory_logs.idempotency_key` |
| `stock_transactions` | **KEEP (out of H scope)** | separate manual/secondary leg; no app writers; not part of order boundary |
| `process_stock_in` / `perform_stock_audit` / `apply_stock_count` / `waste` writers | **REWRITE (remove direct stock UPDATE)** | single-mutation-path requirement (H5) |

---

## 17. Production Repair Safety Protocol

```text
BEFORE  → baseline snapshot (tables/rows/values, checksums)
REPAIR  → apply migration sequence + H10 repair (single controlled window)
AFTER   → reconciliation report
```
Baseline snapshot captures: inventory_logs (count 678 + row hash), ingredients.current/theoretical per row,
inventory_transactions (0), affected orders/items, outbox count (93), operation_logs count (843).
Post-repair accepts only: ledger root-inserts (reversal/historical_repair) + new-order activity; no changes to
orders/items baselines.

---

## 18. Execution Sequence (one controlled sequence)

1. M1 — additive schema + immutability trigger + enum extension + idempotency index (H1)
2. M2 — single stock-mutation trigger (H5) + drop legacy triggers + remove direct stock UPDATEs (writers rewritten to log-only)
3. M3 — canonical `consume_stock_for_item` rewrite + `mark_order_ready` delegation + `mark_item_ready_atomic` harden (H2–H4)
4. M4 — reversal helper + void/waste/refund/return rewrites + correct consumer (H6–H8)
5. M5 — remove `inventory_transactions` + reverse/deduct/rollback removal + OrderModal repoint (disposition)
6. P1 — H10 classification + per-ingredient reconciliation + `historical_repair` ledger inserts
7. E2E — H12 suite, legacy regression, zero-residue, build PASS
8. FREEZE — reconciliação signed, 0.4-H locked

Each step is a separate, reviewable migration in the repo `supabase/migrations/` of `artifacts/saito-admin`
(the live project's migration directory), applied in-order with `supabase db push`.

---

## Freeze Gate (decisions to confirm before implementation)

1. Accept `historical_repair` + `reversal` as new ledger enum values. ✅ / change
2. Accept `current_stock`/`theoretical_stock` stay stored (not a view). ✅ / change
3. Accept REMOVE (not just ARCHIVE) for `inventory_transactions`. ✅ / keep table archived
4. Accept `mark_order_ready` delegation (KDS behavior preserved; server-side consumption shape changes). ✅ / change
5. Accept admin OrderModal repoint away from `reverse_stock_deduction_for_items`. ✅ / change
6. Accept the live forensic figures over the earlier assumed (17/301/27 897). ✅ / re-measure
7. Confirm execution window rule: M1–M5 + P1 in one low-traffic window. ✅ / separate windows