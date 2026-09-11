# 🔒 F — FROZEN (Floor/Tables) — Final Validation Gate Evidence

**Date:** 2026-09-11 · **Module:** F (Floor/Tables) · **A 🔒 + E/S 🔒 = FROZEN dependencies (read-only)**

> Freeze issued only because: every finding F-01…F-10 is FIXED + LIVE-PROVEN, the
> **old broken implementations are proven unreachable** (re-audit sweep A1–A10), and
> one **clean uninterrupted** F gate run is **35/35** while **A 39/39** holds.

---

## GATE RESULTS (real DB `jbxmlnsicbfkbsatnoej` + dev app :3000)

| Gate | Result |
|---|---|
| **F validation gate** (`.f-gate.cjs`) | **35 / 35 PASS** (one clean run; idempotent START cleanup) |
| **A regression** (`.a-regression.cjs`) | **39 / 39 PASS** (A read-only, unchanged) |
| **E/S regression** (`.es-gate.cjs`) | **54 / 54 PASS** (re-verified after F batch) |
| Residue (Z1–Z5) | 0 new orphans, production baseline restored, guard trigger re-enabled, table 1 untouched |
| Old-bypass reachability (A1–A10) | **all unreachable** |

### F gate — mandated coverage (all PASS in the clean run)
- **M1–M11:** waiter→dismiss/merge/transfer = PERMISSION_DENIED; own-location op not authz-denied; **LOC_A actor → LOC_B table = denied + state untouched**; same table number across locations coexist; duplicate same-location DENIED; archived→new order BLOCKED; hard DELETE BLOCKED; live open order → pointer (live wins); cancelled → pointer cleared.
- **F10-1…F10-5:** undo via route = atomic RPC success; **audit row exists**; **outbox event exists** (count increased); **invalid-token raw RPC = BLOCKED** + state unchanged.
- **C1–C4:** 2× merge / unmerge / clear / transfer (parallel psql) → exactly one valid outcome each.
- **A1–A10:** 8 token RPCs present, 0 caller-identity overloads, all table-op routes `requirePermission`, 0 raw PATCH in undo/transfer, composite unique present + global gone, 0 stale pointers, archive guard live, seats gone, view location-scoped, **tables/seat bypass CLOSED**.
- **Z1–Z5:** residue 0, baseline restored, guard re-enabled, production row intact.

---

## FINDING-BY-FINDING (from `F_FOUNDATION_CURRENT_STATE.md`)

| ID | Issue | Status | Fix (migration / route) | Live evidence |
|---|---|---|---|---|
| **F-01** | No permission on table ops (waiter could dismiss=cancel-order) | ✅ FIXED + LIVE | `floor.manage` (new, manager-tier) + `orders.create` reuse; enforced in **definer RPC + route** (mig 20260911000022) | M1–M3 waiter DENY; host seat → 403 |
| **F-02** | Cross-location table ops not blocked (definer bypasses RLS) | ✅ FIXED + LIVE | `has_location_access` self-enforced + session `app.current_location_id` scoping (mig 22 + 23) | M5 LOC_A→LOC_B denied, state untouched |
| **F-03** | Global `UNIQUE(table_number)` = single-location | ✅ FIXED + LIVE | `UNIQUE(location_id,table_number)` + 2 FK rekeys + 7 fns + view + routes scoped (mig 23) | table 1 in both locs ✅ / dup ❌ / floor-map 0 cross-loc leakage |
| **F-04** | Hard-delete tables → 68 orphan orders | ✅ FIXED + LIVE | `is_archived`, DELETE always blocked, archived immutable, `archive_table_atomic`, editor delete+reinsert→archive+upsert (mig 25) | M8/M9 BLOCKED; `F_TABLE_ORPHAN_RECONCILIATION.md` (68 documented, NOT deleted) |
| **F-05** | 3 stale `current_order_id`; no runtime recompute | ✅ FIXED + LIVE | canonical pointer recompute in `sync_table_order_aggregates` (runtime, not cron) + repair (mig 24) | M10 live-wins; M11 cancel-clears; 3→0 |
| **F-06** | Dead `seats` table | ✅ FIXED + LIVE | 0-caller sweep → DROP table + 2 fns; `guest_count` canonical (mig 26) | A8 seats gone |
| **F-07** | 16 statuses, 3 in use | ✅ ACCEPTED (by design) | data-driven state machine = extensible; unused statuses are defined-but-inactive | documented, no action |
| **F-10** | `orders/undo` + `orders/transfer` DELETE = raw client PATCH (bypassed state machine/locks/audit/outbox) | ✅ FIXED + LIVE | all undo actions → existing inverse atomic RPCs (mig — route rewrite, `3ab2c38`) | F10-1…5: route→RPC success, audit, outbox, raw-bypass blocked, concurrency=1 |

**Additional residual found + closed in the final re-audit:** `tables/seat` (forward op) used `requireAuth` + service-role unscoped PATCH → **host/kitchen (no `orders.create`) could seat, and (post-F-03) cross-location seat was possible.** Fixed: `requirePermission('orders.create')` + session-location scope. Proven: host → **403**; waiter LOC_A → **200** (A's table occupied, B's identical number untouched). A10 now asserts this in the gate.

---

## RE-AUDIT — "köhnə bypass implementation-lardan biri reachable-dırmı?" → **XEYR**

- Caller-identity (non-token) table-op overloads: **0** (A1/A2).
- Bare-`requireAuth` table-op routes: **0** (A3 — all `requirePermission`; `tables/seat` fixed to `orders.create`).
- Raw client `PATCH` to `table_floors`/`orders` in undo/transfer: **0** (A4).
- Global `UNIQUE(table_number)`: **gone**; composite present (A5).
- Stale `current_order_id`: **0** (A6).
- Hard delete: **blocked by trigger** (A7).
- `seats` + fns: **gone** (A8).
- View + floor-map + seat route: **location-scoped** (A9/A10).
- Invalid/absent token raw RPC: **BLOCKED** (F10-4) — no caller-trusted identity path remains.

## MIGRATIONS / COMMITS (this F freeze)
`20260911000022` (F-01/F-02) · `20260911000023` (F-03 + F-03 missing-AND fix) · `20260911000024` (F-05) · `20260911000025` (F-04) · `20260911000026` (F-06) · route rewrites (F-10, tables/seat) · commits `c576345`, `77440b5`, `9b23fa2`, `3ab2c38`, F-04/F-06 commits, `tables/seat` fix.

## DATA ITEMS (NOT auto-fixed — owner/finance)
- 68 historical orphan orders (tables 11–30): **kept + documented** (`F_TABLE_ORPHAN_RECONCILIATION.md`).
- 8 dead `reservation_tables` rows: quarantined (`reservation_tables_quarantine_2026_09`), not deleted.
- 3 abandoned `cash_drawer_sessions` (NULL `opened_by`, 2 open, real money): **E/S freeze item**, finance reconciliation.
- 1 inert archived test table (F-04 proof) — may be un-archived or left; no financial impact.

## FROZEN F CONTRACTS (reopen conditions = same bar as A/E/S)
1. **Identity/permission:** every table op = token (A-frozen `set_session_staff`) + `orders.create` (activate/reserve/seat) or `floor.manage` (manager-tier: clear/dismiss/undo/merge/unmerge/transfer/release), enforced in definer RPC AND route.
2. **Location:** session active location is the scoping source; client `location_id` never the authority; definer RPCs self-check `has_location_access`.
3. **Multi-location identity:** `UNIQUE(location_id, table_number)`; same number across locations OK, duplicate in one location denied.
4. **Lifecycle:** tables are never hard-deleted — archive only; archived = immutable vs use, no new order/reservation, number stays occupied.
5. **Pointer:** `current_order_id` = latest open order on (table, location), recomputed at runtime on every order change; a cancelled/voided order never shadows a live one.
6. **Guest model:** `guest_count` INT (per-seat dropped; `seats` table removed).

---

## 🎯 VERDICT
> **🔒 F — FROZEN.** All findings F-01…F-10 are FIXED + LIVE-PROVEN (F-07 accepted by design). The F gate is **35/35** on one clean run, **A 39/39** and **E/S 54/54** hold, and the re-audit proves **no old bypass/raw-PATCH/caller-identity path is reachable**. A, E/S, and F are now frozen dependencies for the next modules (O → K → P/B → I → R).
