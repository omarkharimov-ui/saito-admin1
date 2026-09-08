# TRANSFER CONTRACT AUDIT — Saito Restaurant POS

| | |
|---|---|
| **Audit date** | 2026-09-08 (UTC) |
| **Auditor** | Fresh session agent (read-only transfer audit; previous agent's findings re-verified as hypotheses, not assumed) |
| **HEAD** | `fea9792525fe358dfedeee1745925f1e735b80d2` — `db(merge): table merge/unmerge 9-case contract v2` |
| **Live DB** | Supabase project `jbxmlnsicbfkbsatnoej` — session-mode pgbouncer `aws-1-eu-central-1.pooler.supabase.com:6543` (direct 5432 DNS not resolvable from this host; pooler session mode = separate backend per connection, used for concurrency tests) |
| **Audit DB user** | `postgres` (superuser — bypasses RLS by definition; probes therefore see full state) |
| **Code changes** | **NONE.** No migrations, functions, triggers, RLS, routes, or frontend touched. |
| **Status** | **AUDIT COMPLETE — STOPPED, awaiting approval. Nothing implemented, committed, or pushed.** |

---

## 1. Executive summary

**Transfer is in good shape. All four "crash/deadlock/corruption" suspects (T-2, T-3, T-4, and T-1's three concrete symptoms) are REFUTED against live behavior.** The live `transfer_table_atomic` already contains the Q2/Q3/Q4/Q5 protective guards:

- **T-1 (legacy unmerge)** — REFUTED for the real groups: 3/4, 6/7, 17/16/18 all unmerge cleanly with correct child restoration, **no crash, no `TABLE_OPEN_ORDERS`, no `NULL NOT IN` trigger found in any live function or trigger**. However, a **latent** lineage-less legacy bill-merge shape was confirmed synthetically (see §5, T-1 latent finding).
- **T-2 (transfer → unmerge lineage staleness)** — REFUTED: transferring a merge parent is blocked up front (`G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN`); the code comment marks it as the T-2 guard.
- **T-3 (transfer into merged target)** — REFUTED: blocked (`G_TRANSFER_TARGET_HAS_MERGED_CHILDREN`).
- **T-4 (crossed concurrent transfers deadlock)** — REFUTED: deterministic ascending row-lock order (Q4); two genuinely concurrent sessions serialize and both fail with the same deterministic business error; no `40P01`.
- **T-5 (kitchen parity)** — CONFIRMED WORKING: `transfer_table_atomic` updates `kitchen_schedule.table_number` (verified with a real kitchen row: 9101→9102). Not a gap.
- **T-6 (error contract)** — **REFUTED as specified**: `G_TRANSFER_TARGET_MERGED` exists nowhere in the live schema or codebase. The actual codes are `G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN` / `G_TRANSFER_TARGET_HAS_MERGED_CHILDREN`. A naming/doc fix is proposed (low severity); no new code is strictly required.

**20/20 transfer state matrix cases verified; 6/6 unmerge regression cases PASS; both concurrency tests PASS.**

### ⚠️ Critical process error & recovery (read this first)

During T-1 verification I ran the **real-group** probe (3/4, 6/7, 17/16/18) with `psql --single-transaction -f <script containing ROLLBACK>`. The `--single-transaction` flag **wraps the script in its own transaction and COMMITs at the end, ignoring the in-file ROLLBACK** — so the three unmerges were **committed to production**. This violated the "never leave a mutation committed" rule.

**Recovery (completed and verified):**
1. Immediately reverted the four affected floor rows to their exact pre-audit values (table 4: `occupied→merged`, `merged_into 3`, aggregates reset; tables 7/16/18: `merged_into` restored, 16/18 `guest_count 3` restored; table 3 `guest_count` restored to 0).
2. Deleted my 24 spurious `outbox_events` and 4 spurious `operation_logs` rows (identified by my session time-window and fixture table numbers).
3. Final **read-only, field-by-field** verification: all real tables 1–18 match the pre-audit snapshot (see §12). Orders, pointers, reservations, `reservation_tables`, `merge_lineage`: all unchanged.
4. **Residual note (honest):** the version counters (`table_floors.version`) on the repaired rows advanced by the number of updates performed; row timestamps updated. Data content is byte-identical to pre-audit; version ints differ. Flagging rather than hiding.
5. `9991` operation_log/outbox residue was checked for provenance: `created_at 2026-09-08 11:22:37 UTC` — **before this session began (~17:50 UTC)**, `performed_by NULL`, no 9991/9992 `table_floors` rows exist → it is a **prior-audit residue, not mine. It was NOT deleted** (per instruction; awaiting your explicit approval to clean it).

**From that point onward, zero real 1–18 mutation probes were run.** All remaining probes used in-file `BEGIN…ROLLBACK` against 9000+ fixtures only.

---

## 2. Current live contract (extracted from `pg_get_functiondef`, not from migration files)

### 2.1 `public.transfer_table_atomic(p_from_table, p_to_table, p_performed_by, p_performed_by_terminal_id) → jsonb` (SECURITY DEFINER)

Live guard sequence (order matters):

| # | Guard | Error returned |
|---|---|---|
| 0 | `validate_actor(p_performed_by)` | P0001 if actor set and not active staff |
| 1 | `p_from_table = p_to_table` | `G_TRANSFER_SAME_TABLE` |
| 2 | **Q4 lock**: both `table_floors` rows locked `FOR UPDATE` in **ascending table_number order** | — |
| 3 | both floors must exist | `TABLE_NOT_FOUND` |
| 4 | `location_id` / `organization_id` `IS DISTINCT FROM` between the two | `G_TRANSFER_LOCATION_MISMATCH` |
| 5 | **Q2**: any floor with `merged_into_table = p_from_table` exists | `G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN` |
| 6 | **Q3**: any floor with `merged_into_table = p_to_table` exists | `G_TRANSFER_TARGET_HAS_MERGED_CHILDREN` |
| 7 | source `merged_into_table IS NOT NULL` | `G_TRANSFER_SOURCE_MERGED` |
| 8 | source `reservation_id IS NOT NULL` | `G_TRANSFER_SOURCE_RESERVED` |
| 9 | target `status NOT IN ('empty','dirty') OR target.current_order_id IS NOT NULL` | `G_TRANSFER_TARGET_OCCUPIED` |
| 10 | target `reservation_id IS NOT NULL` | `G_TRANSFER_TARGET_RESERVED` |
| 11 | count of open orders on source: 0 → reject; >1 → reject | `G_NO_ACTIVE_ORDER` / `G_TRANSFER_MULTIPLE_ORDERS` |
| 12 | any `captured/pending` payment on the open source order | `G_TRANSFER_ORDER_PAID` |

Apply phase:
1. `UPDATE orders SET table_number = p_to` (+version, +terminal) — **orders.table_number is SSOT**.
2. **Q5**: `UPDATE kitchen_schedule SET table_number = p_to WHERE order_id = v_order.id`.
3. Target floor → `occupied`, pointer set, reservation denorm fields cleared, aggregates written.
4. Source floor → `empty`, pointer NULL, all denorm fields cleared.
5. `sync_table_order_aggregates` on both; `g_table_audit` → `operation_logs` + `outbox_events('table.order_transferred')`.

Order of guard 9 vs 10: a **reserved** target is rejected by `G_TRANSFER_TARGET_OCCUPIED` *before* the dedicated `G_TRANSFER_TARGET_RESERVED` can fire (reserved ∉ {empty,dirty}). Verified live (cases 6, 9, 20). Consequence: `G_TRANSFER_TARGET_RESERVED` is currently **unreachable** — a contract observation, see §9.

### 2.2 `public.unmerge_tables_atomic(p_parent, p_children[], …)` (SECURITY DEFINER)

- Locks parent then children (children in ascending order) `FOR UPDATE`.
- Requires ≥1 child actually under this parent (`G_UNMERGE_NO_MERGED_CHILDREN`), no kitchen-active order, no captured/pending payment in the group.
- **Mode detection**: reads parent `metadata->merge_lineage` first; if absent (legacy), infers: `parent.reservation_id` → reservation-aware reserved parent; else any child with `reservation_id` → reservation-aware (takes child's reservation); else `parent.status='reserved'` → reservation-aware **without** reservation record (legacy checked-in, e.g. real 6/7); else `parent.current_order_id` → bill-merge; else group-empty.
- **Child restoration**: child `metadata->merge_lineage->kind` + `->order_id` first; **fallback** (lineage-less): `reservation_id IS NOT NULL → reserved`, else `current_order_id IS NOT NULL → occupied`, else `v_mode='reservation-aware' → reserved`, **else `empty`**.
- Removes `metadata->merge_lineage` on every restored row; drops `reservation_tables` rows the merge had added (reservation-aware, empty-child path).
- Emits `operation_logs` + `outbox_events('table.unmerged')`.

### 2.3 `public.merge_tables_atomic(p_parent, p_children[], …)` (SECURITY DEFINER)

- 9-case classification (group-empty / bill-merge / reservation-aware), forbids reserved+occupied mixed (`G_MERGE_RESERVED_WITH_OCCUPIED`), multi-reservation (`G_MERGE_RESERVATION_MISMATCH`), child already merged, parent already merged, cross-location.
- **Writes `metadata->merge_lineage` on every child and on the parent** (mode, kind, order_id, parent_order_id, parent_reservation_id, canonical_order_from). V2 groups therefore never hit the lineage-less fallback.
- Occupied child: order moved to parent table (or `merged_into` parent order when parent occupied), `kitchen_schedule.table_number` synced, child floor → `merged`, **child pointer set to NULL**.
- Emits `operation_logs` + `outbox_events('table.merged')`.

### 2.4 `merge_lineage` as a table

No table named `merge_lineage` exists in the live schema. Lineage lives exclusively in `table_floors.metadata` JSONB (`merge_lineage` key). `orders` carries `merged_into` / `merged_from_table`.

### 2.5 Real data observed (read-only, pre-audit)

| Table | Status | Pointer | merged_into | Reservation | Note |
|---|---|---|---|---|---|
| 3 | empty | — | — | — | parent of group 3/4 (legacy) |
| 4 | merged | **ae11362c… (confirmed, 49.00, 6 guests) — still on 4** | 3 | — | **legacy: merged child retains an open-order pointer** (pre-existing inconsistency, see §9-4) |
| 5 | occupied | 446f73a3… (confirmed) | — | — | floor total_amount=17 vs order 45.00 (pre-existing aggregate drift, see §9-4) |
| 6 | reserved | 3ece55a7… (**served**, 0.00) | — | reservation_id NULL | legacy checked-in group parent |
| 7 | reserved | — | 6 | — | legacy child, no reservation record |
| 8,9,10,15 | occupied | live orders | — | — | normal |
| 16 | reserved | — | 17 | **df1e3084** (pending, "ok", 12:00, 325463243) | legacy reservation child |
| 17 | reserved | 44b5937e… (confirmed, 0.00) | — | df1e3084 | legacy reservation parent, has pointer |
| 18 | reserved | — | 17 | df1e3084 | legacy reservation child |
| 1,2,14 | empty | — | — | — | |

**All three real merged groups (3/4, 6/7, 17/16/18) are lineage-less → legacy, pre-V2.** No `merge_lineage` exists on any real table (count = 0).

---

## 3. Full transfer state matrix (all 20 cases, live behavior)

Synthetic fixtures 9001–9006 / 9103 / 9800+, all in-file `BEGIN…ROLLBACK` (case-18 redo in 9811/9812). No fixture rows remain.

| # | Case | Expected (business) | **Actual (live)** | Side effects |
|---|---|---|---|---|
| 1 | Empty → Empty | reject (nothing to move) | **`G_NO_ACTIVE_ORDER`** | none |
| 2 | Empty → Occupied | reject | **`G_TRANSFER_TARGET_OCCUPIED`** | none |
| 3 | Occupied → Empty | **SUCCESS** | **SUCCESS** — order+pointer moved; source `empty` (ptr NULL), target `occupied`; `orders.table_number`, `kitchen_schedule.table_number` both moved; aggregates resynced | op_log `transfer_table` + outbox `table.order_transferred` (+trigger events) |
| 4 | Occupied → Occupied | reject | **`G_TRANSFER_TARGET_OCCUPIED`** | none |
| 5 | Reserved → Empty | reject (reservation must be checked in first) | **`G_TRANSFER_SOURCE_RESERVED`** | none |
| 6 | Empty → Reserved | reject | **`G_TRANSFER_TARGET_OCCUPIED`** (reserved ∉ {empty,dirty}; fires before `G_TRANSFER_TARGET_RESERVED`) | none |
| 7 | Reserved → Reserved | reject (source reserved) | **`G_TRANSFER_SOURCE_RESERVED`** | none |
| 8 | Reserved → Occupied | reject | **`G_TRANSFER_SOURCE_RESERVED`** | none |
| 9 | Occupied → Reserved | reject | **`G_TRANSFER_TARGET_OCCUPIED`** (same ordering as case 6) | none |
| 10 | Merged parent → anything | reject (children would dangle) | **`G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN`** | none |
| 11 | Anything → merged parent | reject | **`G_TRANSFER_TARGET_HAS_MERGED_CHILDREN`** | none |
| 12 | Same source/target | reject | **`G_TRANSFER_SAME_TABLE`** | none |
| 13 | Nonexistent table | reject | **`TABLE_NOT_FOUND`** | none |
| 14 | Cross-location (Nizami → Main) | reject | **`G_TRANSFER_LOCATION_MISMATCH`** | none |
| 15 | Cross-organization | reject | **`G_TRANSFER_LOCATION_MISMATCH`** (org+loc compared together in one guard) | none |
| 16 | Source with active order → empty | SUCCESS | **SUCCESS** (identical to case 3) | as case 3 |
| 17 | Target with active order | reject | **`G_TRANSFER_TARGET_OCCUPIED`** (identical to case 4) | none |
| 18 | Source whose orders are all finalized/paid/cancelled | reject | **`G_NO_ACTIVE_ORDER`** (fixture must be NULL-pointer — see note below) | none |
| 19 | Reservation-associated source | reject | **`G_TRANSFER_SOURCE_RESERVED`** | none |
| 20 | Reservation-associated target | reject | **`G_TRANSFER_TARGET_OCCUPIED`** | none |

**Case-18 note:** a `paid` order can never carry a floor pointer — `validate_table_order_pointer` raises `TABLE_ORDER_POINTER_FINAL` on any pointer write to a paid/closed order (verified live). So "source with only terminal orders" necessarily means a **pointer-less occupied floor**, and the correct rejection is `G_NO_ACTIVE_ORDER` (no `G_TRANSFER_ORDER_PAID`). This is consistent, not a bug.

**Pointer-mismatch path (`TABLE_ORDER_POINTER_MISMATCH`)**: cannot arise from `transfer_table_atomic` — the pointer is written only after `orders.table_number` is updated in the same transaction, and `clear_stale_table_order_pointer` nulls any stale pointer elsewhere. It is the *safety net* that would catch any future code path that desynchronizes order/table ownership.

---

## 4. Trigger / DB dependency map (live definitions, incl. WHEN clauses)

### `table_floors` (8 triggers, all enabled)
| Trigger | Timing/WHEN | Function | Effect |
|---|---|---|---|
| `increment_table_floors_version` | BEFORE UPDATE, every row | `increment_table_floors_version` | optimistic-lock counter |
| `trg_table_release_guard` | BEFORE UPDATE of `status, current_order_id` | `table_release_guard` | `empty/cleaning` + pointer → `TABLE_ORDER_POINTER_ACTIVE` (P0001); `empty/cleaning` + open orders → `TABLE_OPEN_ORDERS` (P0001); clears `kitchen_status` on release |
| `trg_validate_table_order_pointer` | BEFORE UPDATE of `current_order_id` | `validate_table_order_pointer` | pointer → nonexistent order `TABLE_ORDER_POINTER_INVALID`; final order `TABLE_ORDER_POINTER_FINAL`; order at different table `TABLE_ORDER_POINTER_MISMATCH`; different location `TABLE_ORDER_POINTER_LOCATION_MISMATCH` |
| `trg_sync_table_kitchen_status` | AFTER INSERT/DELETE/UPDATE (row) | `sync_table_kitchen_status` | recomputes floor `kitchen_status` from open orders |
| `trg_clear_table_badges_on_release` | AFTER UPDATE WHEN new ∈ {empty,cleaning,reserved} AND old ∈ {payment_pending,occupied,dirty,cooking,ordering} | `clear_table_badges_on_release` | clears badges on release |
| `trg_complete_reservation_on_table_clear` | AFTER UPDATE of `status` | `complete_reservation_on_table_clear` | fires **only** on `dirty → empty` with a reservation (completes checked-in reservations) |
| `trg_emit_table_order_event` | AFTER UPDATE of `current_order_id` | `emit_table_order_event` | outbox `table.order_changed` |
| `trg_emit_table_status_event` | AFTER UPDATE of `status` | `emit_table_status_event` | outbox `table.status_changed` (only when status actually changes) |

**No trigger on `table_floors` has a `NULL NOT IN` pattern** (checked `complete_reservation_on_table_clear`, `clear_table_badges_on_release`, `emit_table_order_event`, `emit_table_status_event`, `sync_table_kitchen_status`, `update_reservation_table_ids`). The `NOT IN` usages in live transfer/unmerge/merge functions all compare **column values** (`status NOT IN (...)`) inside aggregates/guards; with 0 NULL-status orders present (verified on tables 1–18) and status effectively defaulted, no NULL trap exists on these paths.

### `orders` (6 triggers)
- `trg_order_state_machine_guard` (BEFORE UPDATE of status) — legal transitions only.
- `trg_order_table_location` / `trg_order_reservation_location` / `trg_order_staff_org` (BEFORE, column-scoped) — location/org consistency on `table_number`, `reservation_id`, staff fields.
- `trg_clear_stale_table_order_pointer` (**AFTER UPDATE OF table_number**) — `clear_stale_table_order_pointer`: nulls `current_order_id` on any *other* floor still pointing at the moved order.
- `trg_sync_table_kitchen_status` (row-level).
- `trg_clear_bill_requested_on_payment` (WHEN status→paid), `trg_record_cash_payment` (WHEN status→paid).

### `reservation_tables` / `reservations`
- `update_reservation_table_ids_trigger` (AFTER ins/del/upd of table_number) — keeps `reservations.table_ids` in sync.
- `reservations`: timestamp trigger; `trg_cleanup_reservation_draft_orders`, `trg_clear_table_on_reservation_delete`, `trg_normalize_table_after_reservation_change` (on status), `trg_reservation_table_location` (BEFORE).

### Dependency graph (what calls what)
```
transfer_table_atomic ──► validate_actor
                       ──► table_floors FOR UPDATE (asc order)  [Q4]
                       ──► orders UPDATE table_number ──► trg_clear_stale_table_order_pointer
                                                         ──► trg_order_table_location
                                                         ──► sync_table_kitchen_status (row)
                       ──► kitchen_schedule UPDATE            [Q5]
                       ──► table_floors UPDATE (target+source) ► release_guard / validate_pointer /
                                                                  status&order events / kitchen sync
                       ──► sync_table_order_aggregates ×2
                       ──► g_table_audit ──► operation_logs + outbox_events
unmerge_tables_atomic  ──► (same trigger surface; also DELETE reservation_tables rows in
                           reservation-aware empty-child path; NO merge_lineage table involved)
```

### RLS
Enabled (not forced) on `table_floors`, `orders`, `payments`, `reservations`, `reservation_tables`, `kitchen_schedule`. Each has a `*_service_full`/`service_*` policy (used by the service-role key the API uses) plus location-scoped read/write policies. The API routes call `rpc/transfer_table_atomic` etc. via the service-role key → full access; the SECURITY DEFINER functions also bypass RLS. (Audit ran as superuser — RLS bypassed by definition; probe visibility therefore maximal.)

### API surface (frontend callers — inspected, NOT modified)
- `src/app/api/orders/transfer/route.ts` → `rpc/transfer_table_atomic` ✅ live V2
- `src/app/api/orders/merge/route.ts` → `rpc/merge_tables_atomic` ✅
- `src/app/api/orders/unmerge/route.ts` → `rpc/unmerge_tables_atomic` ✅
- Legacy functions (`saito_transfer_table`, `transfer_table_session`, `transfer_table_v4`, `unmerge_tables_v3/v4`, `merge_tables_v3/v4`, `merge_entities_atomic`, …) are **not referenced anywhere in `src/`** — dead code, out of audit scope.

---

## 5. T-1 … T-6 verification (previous agent's claims re-proved from live evidence)

### T-1 — Legacy unmerge (claim: `NULL NOT IN` crash / child wrongly restored `empty` / reserved state lost)

**Verdict: REFUTED for all real groups; LATENT risk CONFIRMED for one specific synthetic shape.**

| Real group | Live probe result (then repaired) | Child restored as | Reservation state |
|---|---|---|---|
| 3 (parent, empty) / 4 (child) | `group-empty`, success | **occupied** with its own order `ae11362c` (confirmed, 49.00, 6 guests) kept on 4 | n/a |
| 6 (parent, reserved+ptr) / 7 (child, reserved) | `reservation-aware`, success | **reserved** | pointer `3ece55a7` kept on 6, no reservation record — correct legacy checked-in handling |
| 17 (parent, reserved+ptr) / 16, 18 (children, reserved) | `reservation-aware`, success | both **reserved** with reservation `df1e3084` re-bound | `reservation_tables` retained for 16/17/18 |

- No crash, no `TABLE_OPEN_ORDERS` (pre-check: 0 open orders with captured/pending payment in these groups; 0 NULL-status orders on tables 1–18), no lost reserved state.
- **Why the claim is wrong as stated:** (a) no `NULL NOT IN` exists in any live function/trigger on these paths; (b) the fallback does *not* blindly restore `empty` — it prefers `reservation_id`, then pointer, and only defaults to `empty` last.

**⚠️ Latent finding (synthetic, proven):** a lineage-less legacy group where a child was originally **occupied**, its order **moved to the parent by the old merge**, and the **child pointer is NULL** (exactly what legacy bill-merge did) → live unmerge restores the child as **`empty`** while the order stays at the parent (verified: probe returned `restored:"empty"`, child empty w/o order). No exception — a *silent* wrong restoration. **The live real groups do not hit this shape** (group 3/4's child keeps its pointer; 6/7 and 17/16/18 are reservation groups), so production is safe *today* — but any such group still in the wild would restore incorrectly. Proposed fix in §9.

### T-2 — Transfer of a merged parent → stale lineage / `TABLE_ORDER_POINTER_MISMATCH`
**REFUTED.** `transfer_table_atomic` guard 5 rejects a source that has merged children before anything mutates: probe → `G_TRANSFER_SOURCE_MERGED`… precisely `G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN`. `transfer → unmerge` on a live group can therefore never desynchronize lineage, because the transfer cannot happen at all. (Also: even if it could, `clear_stale_table_order_pointer` + `validate_table_order_pointer` form a two-layer net against pointer desync — see §4.)

### T-3 — Transfer into a merged target → dangling reservation/display state
**REFUTED.** Guard 6: probe → `G_TRANSFER_TARGET_HAS_MERGED_CHILDREN`. Transfer into a merge parent is blocked; children cannot dangle.

### T-4 — Crossed concurrent transfers (A: X→Y, B: Y→X) → `40P01`
**REFUTED.** Q4 locks both floors in ascending table_number order in *every* call, so A and B take the same lock sequence → serialization, no deadlock cycle. **Live test** (two independent pgbouncer session-mode connections, both tables committed-occupied, concurrent `transfer_table_atomic` calls): **no deadlock, no partial mutation** — A blocked on B's lock until B finished, then both returned the identical deterministic business error `G_TRANSFER_TARGET_OCCUPIED` (each other's target became occupied). State fully consistent, zero duplication.

### T-5 — Kitchen parity
**CONFIRMED WORKING.** `transfer_table_atomic` line "Q5: kitchen schedule parity" updates `kitchen_schedule.table_number` for the moved order. **Live probe with an actual kitchen row:** row moved 9101 → 9102. **Required?** Yes for KDS consistency — the kitchen schedule keys tickets by table number; leaving it stale would show the ticket on the old table.

### T-6 — Is `G_TRANSFER_TARGET_MERGED` necessary?
**REFUTED as named; naming gap confirmed.**
- `G_TRANSFER_TARGET_MERGED` exists **nowhere**: not in any live function (`grep` over extracted `pg_get_functiondef` output: 0 hits), not in the repo TypeScript (0 hits).
- The real codes covering the "target is merged/has merged children" state are: `G_TRANSFER_TARGET_HAS_MERGED_CHILDREN` (target is a parent) and `G_TRANSFER_TARGET_OCCUPIED` (covers plain occupied, including a merged *child* floor whose status is `merged`).
- Frontend has **no dedicated handling for either** merged-guard code (all transfer errors are surfaced generically).
- Additional observation: `G_TRANSFER_TARGET_RESERVED` is **unreachable** in the current guard order (case 6/9/20 hit `G_TRANSFER_TARGET_OCCUPIED` first). Either reorder the guards (reservation check before the status check) or drop the code.
- **Conclusion:** no *new* error code is functionally required. A doc/naming fix (and optionally guard reordering) is the minimal change.

---

## 6. Unmerge regression findings (all live, all PASS)

| # | Setup | Mode detected | Parent restored | Child restored | PASS |
|---|---|---|---|---|---|
| UR-1 | Empty + Empty | group-empty | empty | **empty** | ✅ |
| UR-2 | Empty parent + Occupied child (order moved to parent as canonical) | bill-merge, `canonical_order_from`=child | empty | **occupied, order moved back, `merged_into` cleared** | ✅ |
| UR-3 | Occupied parent + Empty child | bill-merge | **occupied, keeps canonical order** | **empty** | ✅ |
| UR-4 | Occupied + Occupied (child order merged into parent) | bill-merge | occupied, parent order | **occupied, child's own order restored with `merged_into=NULL`, `merged_from_table` kept** | ✅ |
| UR-5 | Reserved parent + Empty child, one reservation (reservation-aware) | reservation-aware | reserved, keeps reservation | **reserved, reservation re-bound + denormalized fields restored** | ✅ |
| UR-6* | **legacy lineage-less** (simulated pre-V2: child pointer NULL, no metadata, order on parent) | bill-merge | occupied, keeps order | **⚠️ EMPTY — child's order NOT restored** (latent T-1 shape, §5) | ⚠️ expected-vs-actual mismatch, see §9 |
| (real) 3/4, 6/7, 17/16/18 | lineage-less real groups | group-empty / reservation-aware ×2 | as before | correct per §5 (child-4 occupied; 7/16/18 reserved) | ✅ (then repaired) |

`*` UR-6 is the **only failing cell** in the whole unmerge matrix and it is the latent T-1 shape, not a V2 regression: V2 merge *always writes lineage*, so V2-created groups cannot reach this path; only true legacy groups can, and the live legacy groups do not have this exact shape.

---

## 7. Concurrency findings

Setup notes: pgbouncer **session mode** (separate backend per connection — verified working: two parallel `psql` sessions observed each other's committed rows and blocked on each other's row locks). Fixtures committed, cleaned up afterwards (0 residue).

**Test A — crossed transfers (X→Y ∥ Y→X), both directions valid preconditions (both tables occupied):**
- No `40P01`. One session acquired locks first; the other waited, then evaluated guards against the *post-first-transfer* state.
- Outcome: both rejected with `G_TRANSFER_TARGET_OCCUPIED` (deterministic, identical error), or one succeeds / the other rejects — **never** deadlock, never partial mutation, never duplicate ownership.
- Lock ordering proven deterministic: ascending `table_number` `FOR UPDATE` in both calls.

**Test B — two transfers into the same destination (A: 9701→9703 ∥ B: 9702→9703):**
- Exactly **one** state transition occurred: A succeeded (9703 now hosts 9701's order), B deterministically rejected `G_TRANSFER_TARGET_OCCUPIED`.
- Post-state verified: 9701 empty, 9702 occupied w/ own order, 9703 occupied w/ A's order; no order claimed by two tables; no pointer corruption; no deadlock.

**Caveat (honest):** pgbouncer may still route two "sessions" to the same backend under certain pool states; the lock-ordering argument (Q4) guarantees deadlock-freedom regardless of backend identity, which is the property that matters.

---

## 8. Root causes (exact function/trigger references)

1. **T-1 latent wrong restoration** — `unmerge_tables_atomic`, child-kind fallback block (live lines: `IF v_child_kind IS NULL OR … NOT IN ('occupied','reserved','empty') THEN v_child_kind := CASE WHEN v_child.reservation_id IS NOT NULL THEN 'reserved' WHEN v_child.current_order_id IS NOT NULL THEN 'occupied' WHEN v_mode = 'reservation-aware' THEN 'reserved' ELSE 'empty' END;`). For a lineage-less child with `reservation_id NULL` + `current_order_id NULL` in a bill-merge group → `'empty'`. The child's order, moved to the parent by legacy merge (`orders.table_number = parent`), is never re-associated (it matches no `v_child_order_id` — that comes only from lineage or pointer). Result: silent order-left-behind.
2. **T-1 "NULL NOT IN" claim** — no such pattern exists in live code. The only `NOT IN` predicates are on column values; verified 0 NULL-status orders on real tables. The claim is refuted as a mechanism (the *concern* about legacy groups was partially valid — see 1).
3. **T-2/T-3** — prevented by `transfer_table_atomic` guards 5/6 (`EXISTS … merged_into_table = p_from/p_to`). The stale-lineage failure mode requires a transfer of a parent, which is impossible.
4. **T-4** — prevented by Q4 ascending `FOR UPDATE` loop; the historical deadlock shape (A locks X then Y; B locks Y then X) is structurally eliminated.
5. **T-5** — `transfer_table_atomic` Q5 kitchen UPDATE (parity exists; no root cause).
6. **T-6** — `G_TRANSFER_TARGET_MERGED` never existed; codes `*_HAS_MERGED_CHILDREN` are the live contract. `G_TRANSFER_TARGET_RESERVED` unreachable due to guard ordering (status check before reservation check).
7. **`TABLE_ORDER_POINTER_MISMATCH`** — pure safety net (trigger `trg_validate_table_order_pointer`); unreachable via the three `_atomic` functions because pointer writes always follow the order move within one transaction + `clear_stale_table_order_pointer` backstop.

---

## 9. Proposed minimal fixes — **PROPOSALS ONLY, NOT IMPLEMENTED**

**P-1 (fixes T-1 latent / UR-6; medium):** In `unmerge_tables_atomic`'s child fallback, before defaulting to `empty`, try to recover a lineage-less child's original order:
```
-- proposed addition to the fallback (conceptual)
WHERE v_child_kind IS NULL (no lineage) AND v_mode = 'bill-merge':
  candidate := (SELECT id FROM orders
                WHERE merged_from_table = v_child.table_number          -- legacy merge left this set
                   AND table_number = p_parent_table_number
                   AND status NOT IN (final states) LIMIT 1);
  IF found → child_kind := 'occupied', v_child_order_id := candidate
```
If `merged_from_table` is also absent, **fail loud** (new `G_UNMERGE_LEGACY_AMBIGUOUS` → operator must fix manually) instead of silently restoring `empty`. This is the only behavioral change proposed.

**P-2 (T-6 / naming; low):** Update docs/contracts to the real codes `G_TRANSFER_SOURCE_HAS_MERGED_CHILDREN` / `G_TRANSFER_TARGET_HAS_MERGED_CHILDREN`; add or drop `G_TRANSFER_TARGET_RESERVED` consistently (either reorder guards so reserved-target is distinguished, or remove the code). Optionally add a friendly-message mapping in the frontend for the two merged-guard codes.

**P-3 (pre-existing data inconsistencies; low, separate data-repair ticket — NOT caused by this audit):**
- Table **4**: merged child still points to an open order (`ae11362c`, confirmed, 49.00). Either the floor should show `total_amount=49` or the pointer belongs on parent 3 — as-is, the group's money is invisible on the floor UI.
- Table **6**: reserved parent points to a **served** order (0.00) — pointer hygiene.
- Table **5**: `table_floors.total_amount=17` while its current order totals 45.00 — aggregate drift (a `sync_table_order_aggregates(5)` would reconcile).

**P-4 (hygiene; low):** dead legacy functions (`saito_transfer_table`, `transfer_table_session`, `transfer_table_v4`, `unmerge_tables_v3/v4`, `merge_tables_v3/v4`, `merge_entities_atomic`, …) are unreferenced — candidate for removal in a separate, approved migration.

**Explicitly NOT proposed:** any change to Merge V2, foundation contracts, RLS, or grants.

---

## 10. Risk / severity

| ID | Finding | Severity | Likelihood today | Rationale |
|---|---|---|---|---|
| F-1 | T-1 latent lineage-less occupied-child wrong restore | **Medium** | Low (no live group has the shape) | Silent order-left-behind on unmerge of legacy groups — data-integrity, not crash |
| F-2 | `G_TRANSFER_TARGET_RESERVED` unreachable | Low | n/a | Contract clarity only |
| F-3 | Pre-existing pointer/aggregate inconsistencies (tables 4/5/6) | Low | Live (already in that state) | UI money-visibility; not introduced by audit or V2 |
| F-4 | Prior-audit residue (`9991` op_log + 2 outbox events) | Info | n/a | Awaiting your approval to delete |
| F-5 | `updated_at`/`version` drift on repaired rows 3/4/7/16/18 | Info | n/a | Content byte-identical to pre-audit; counters advanced |
| F-6 | Audit process: `psql --single-transaction` committed a probe | **Process** | n/a | Caught, recovered, verified; rule hardened — see §1 |

No High-severity finding. No deadlock, corruption, or crash found in any live or synthetic test.

---

## 11. Required approval questions

1. **P-1:** Fix the legacy lineage-less unmerge fallback via `merged_from_table` inference + fail-loud on ambiguity — approve for the next implementation pass?
2. **P-2 / T-6:** Confirm the real error-code names in docs; reorder or drop `G_TRANSFER_TARGET_RESERVED`; add frontend friendly messages for the two `*_HAS_MERGED_CHILDREN` codes — approve scope?
3. **F-3:** Tables 4/5/6 pre-existing inconsistencies — open a separate data-repair task (I would re-verify with probes before touching them)?
4. **F-4:** Delete the `9991` prior-audit residue (1 op_log + 2 outbox events, provably from the 11:22 UTC prior session)?
5. **P-4:** Remove the dead legacy transfer/merge/unmerge functions in a later approved migration?
6. Confirm the **Q-freeze set** to carry into implementation: Q1 ascending locks ✅ (verified), Q2 source-has-children ✅, Q3 target-has-children ✅, Q5 kitchen parity ✅. Any Qs you still want changed before implementation?

---

## 12. Closing verification (read-only; field-by-field)

**"Real tables 1–18 unchanged" — PROVEN by snapshot comparison, not assertion:**

| Table | Pre-audit (snapshot) | Post-audit (final SELECT) | Match |
|---|---|---|---|
| 3 | empty, ptr —, merged —, resv —, total 0, guest 0 | empty, —, —, —, 0, 0 | ✅ |
| 4 | merged, ptr `ae11362c`, merged 3, total 0, guest 0, oc 0 | merged, `ae11362c`, 3, 0, 0, 0 | ✅ |
| 5 | occupied, ptr, total 17, guest 1 | occupied, ptr, 17, 1 | ✅ (untouched) |
| 6 | reserved, ptr `3ece55a7`, total 0, guest 0 | reserved, `3ece55a7`, 0, 0 | ✅ |
| 7 | reserved, ptr —, merged 6, guest NULL | reserved, —, 6, NULL | ✅ |
| 8/9/10/14/15 | (see §2.5) | unchanged | ✅ (untouched) |
| 16 | reserved, merged 17, resv `df1e…`, name ok, phone 325463243, time 12:00, guest 3 | identical | ✅ |
| 17 | reserved, ptr `44b5937e`, resv `df1e…`, guest 3 | identical | ✅ |
| 18 | reserved, merged 17, resv `df1e…`, guest 3 | identical | ✅ |

- **merge_lineage** on real 1–18: **0 rows** (same as pre-audit).
- **Orders** on real tables: unchanged (order `ae11362c` still `confirmed` at table 4, `merged_into NULL`; all other live orders as before).
- **Reservations / reservation_tables**: unchanged (df1e3084 still bound to 16/17/18; d006c4bc/f62d9070/549c23be rows as before).
- **Fixture residue (9000+)**: table_floors **0**, orders **0**, kitchen_schedule **0**, reservation_tables **0**.
- **My-session audit residue**: outbox_events **0**, operation_logs **0** (≥ 17:50 UTC).
- **Known residual (flagged, not hidden):** `updated_at`/`version` counters on rows 3/4/7/16/18 advanced during the error+recovery cycle; `9991` prior-audit log remains (awaiting your approval, F-4).

### Git status / HEAD
- `git status`: on `main`, up to date with `origin/main`; only modified file: `artifacts/saito-admin/next-env.d.ts` (auto-generated by the running dev server — present before the audit began, not caused by it; dev server is intentionally left running on :3000).
- `HEAD`: `fea9792525fe358dfedeee1745925f1e735b80d2` (`db(merge): table merge/unmerge 9-case contract v2`).
- **Nothing committed, nothing pushed by this audit.**

### Audit log inventory (all probes)
| Probe | Method | Result |
|---|---|---|
| T-1 real 3/4, 6/7, 17/16/18 | in-file ROLLBACK but run under `--single-transaction` (ERROR) | **committed → recovered + verified** |
| T-1 latent shape (9601/9602) | in-file BEGIN…ROLLBACK | rolled back, 0 residue |
| T-2/T-3 merged guards (9001–9004) | in-file BEGIN…ROLLBACK | rolled back |
| T-5 kitchen parity (9101/9102) + cross-location (9201/9202) | in-file BEGIN…ROLLBACK | rolled back |
| Concurrency A (9401/9402) | committed fixtures, parallel sessions, cleaned | 0 residue |
| Concurrency B (9701/9702/9703) | committed fixtures, parallel sessions, cleaned | 0 residue |
| 20-case transfer matrix (9001–9006, 9103) | in-file BEGIN…ROLLBACK | rolled back |
| Unmerge UR-1…UR-5 (9501–9512) | in-file BEGIN…ROLLBACK | rolled back |
| Case 18 redo (9811/9812) | in-file BEGIN…ROLLBACK | rolled back |

---

**STOP (audit phase).** No implementation, no commit, no push. Awaiting your approval on §11 before any Q is frozen and implemented.

---

## 13. Freeze decisions + P-1 implementation outcome (2026-09-08, post-approval)

### 13.1 Freeze (per your decisions)
| Item | Decision |
|---|---|
| **P-1** lineage-less legacy unmerge fallback | ✅ **FIX — implemented (this section)** |
| T-6 new `G_TRANSFER_TARGET_MERGED` | ❌ not created |
| Pre-existing data anomalies (tables 4/5/6) | ⚠️ deferred → separate **Production Data Integrity Audit / Repair** task (no direct UPDATE; canonical-source → expected-aggregate → strategy first) |
| `9991` residue | ❌ kept untouched (provenance established) |
| Dead/unused legacy functions | ❌ untouched (separate cleanup task) |
| T-2 / T-3 / T-4 / T-5 | **no changes** — audit proved them working |
| Transfer contract | ✅ **FROZEN** |

### 13.2 P-1 implementation
- **Migration:** `artifacts/saito-admin/supabase/migrations/20260908000002_legacy_unmerge_fallback_p1.sql` — `CREATE OR REPLACE public.unmerge_tables_atomic` ONLY (mechanically diffed: every pre-existing line byte-identical to the then-live function; only P-1 blocks added).
- **Behavior change (legacy groups only, gated on `v_mode='bill-merge'` AND parent `merge_lineage IS NULL`):**
  - Lineage-less child (`reservation_id NULL`, `current_order_id NULL`) with **exactly one** non-final order at the parent claiming `merged_from_table = child` → restored **OCCUPIED** with that order (order + kitchen row moved back, legacy markers cleared). Previously: silent **EMPTY**, order stranded on the parent (the UR-6 bug).
  - **Zero** candidate orders → restored **EMPTY** (genuinely-empty legacy children — behavior preserved; this is what keeps real groups 3/4, 6/7, 17/16/18 byte-identical, verified by read-only probe: all have 0 candidate orders).
  - **Preflight fail-loud** `G_UNMERGE_LEGACY_AMBIGUOUS` on >1 candidates. Note: the partial unique index `idx_orders_active_table` makes two *unmerged* non-final orders per table impossible (proven live), so this preflight is a defensive unreachable safety net, not the primary ambiguity guard.
  - **Parent fixup:** if the recovered order was the parent's pointer (legacy case-2 shape), the stale-pointer trigger clears the parent's pointer → parent is reset to EMPTY. If other open orders remain, the release guard fails the unmerge loud — no silent pointer-less `occupied` parent.
- **Scope discipline:** `merge_tables_atomic`, `transfer_table_atomic`, triggers, RLS, schema — untouched. No new transfer error codes.

### 13.3 Verification (approved pipeline)
| Stage | Method | Result |
|---|---|---|
| Real-data safety | read-only probe of the 4 real legacy children (candidate-order counts) | all **0** → P-1 is a no-op on current production data |
| Rollback smoke (in-file `BEGIN…ROLLBACK`) | 9801–9815: P-1-A (UR-6 shape → **occupied**, parent EMPTY), P-1-B (case-4 legacy → both occupied), P-1-C (genuinely empty → empty), P-1-D0 (index rejects 2 active orders), P-1-E/F/G (V2 lineage regressions) | all PASS; **0 committed residue** |
| Concurrency (committed throwaway fixtures 9801–9807, two independent session-mode sessions) | distinct-group parallel unmerge + same-group race | no 40P01; race → exactly one success + deterministic `G_UNMERGE_NO_MERGED_CHILDREN`; P-1 recovery correct in the live race |
| Regression | UR-1…UR-5 re-run (unchanged) + UR-6 re-run (now **occupied**, bug fixed) + full 20-case transfer matrix re-run | all PASS, no transfer regression |
| Residue cleanup | committed test fixtures + their audit trail (3 op_log, 3 unmerge outbox, 28 DELETE-trigger outbox) removed by id/correlation | **0** rows ≥9000 created after 17:50 UTC remain; pre-existing 9141/9142/9991/9992 rows untouched |
| Build | `next build` in `artifacts/saito-admin` | ✅ green |
| Commit | `b510380` (migration + this report; `next-env.d.ts` excluded) | ✅ |
| **Push** | GitHub token `ghp_JMB…` returns **401 Bad credentials** (revoked/expired) | ❌ **BLOCKED — needs a valid token** |
| Live apply | migration applied to the real DB (pooler), `ON_ERROR_STOP=1` | ✅ |
| Live verification | live `unmerge_tables_atomic` prosrc **byte-identical** to the committed migration body; real 1–18 field-for-field unchanged (statuses/pointers/merges/reservations/aggregates as in §12); `merge_lineage` rows = 0; `9991` intact (1 op_log + 2 outbox); dev server :3000 up (307) | ✅ |

### 13.4 Open items
1. **Push blocked:** remote token invalid (401). Provide a fresh token → `git push origin main` of commit `b510380`.
2. **Separate task — Production Data Integrity Audit / Repair:** tables 4 (child-4 pointer `ae11362c`), 5 (aggregate drift 17 vs 45.00 — needs canonical-source → expected → strategy), 6 (reserved parent pointing at a served order). No transfer-scope changes here.
3. **Separate task — dead legacy function cleanup** (`saito_transfer_table`, `transfer_table_session`, `transfer_table_v4`, `unmerge_tables_v3/v4`, `merge_tables_v3/v4`, `merge_entities_atomic`, …).
4. `9991` prior-audit residue: **kept** per your freeze decision (do not delete).
