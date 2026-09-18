# P-9 F-CONTRACT CORRECTION REVIEW — 2026-09-18 (PROPOSAL — NOTHING APPLIED)

**Verdict in one paragraph:** The conflict is real and is exactly what we agreed: the ratified M6
RESTRICT FK (`table_floors.current_order_id → orders`) collides with the frozen F gate's teardown
order (`DELETE orders` **before** `DELETE table_floors`). The FK was the right decision and stays.
The minimal contract-safe correction is a **2-line swap inside `CLEANUP_SQL` (Option A below)** —
teardown order only, zero new statements, zero new trigger paths, zero production surface. Source
evidence (not just empirical) proves the swapped order is trigger-safe: the only DELETE-firing
trigger on `table_floors` is `trg_table_archive_guard`, which the cleanup block itself disables.
A secondary finding requires ratification of a P9-gate assertion refinement (S5.4) — P-9's own
file, not frozen — because F's neutralize-don't-delete contract leaves inert fixture rows that the
strict `total=53, extra=0` assertion cannot see.

**Status of this document:** proposal only. No file modified, no DB write, no commit. Repo + DB
byte-identical to the 01:10 FULL-STOP snapshot; everything below is read-only evidence
(collected 2026-09-18 ~10:35–11:05 Baku).

---

## 1. Agreed classification (ratified in chat this morning)

- Not an environment problem, not an M6 bug — **two separately-correct contracts colliding**.
- M6 FK: keep. `DROP` = rejected. `CASCADE` = rejected (would change a ratified decision).
- Frozen F gate: corrected via a **separate ratified correction cycle** — not an inline "test fix".
- No O→P8 until F is fully 35/35 under the correction.

## 2. Redlines (binding for the correction)

| # | Redline |
|---|---|
| R1 | M6 FK `p9_fk_table_floors_current_order_id` stays `ON DELETE RESTRICT` |
| R2 | No migration, app code, view, RLS, or trigger changes |
| R3 | F gate: check logic, fixtures, assertions (A1–A10, concurrency, B, D, Z1–Z5) untouched |
| R4 | No manual DB residue deletion — the corrected F contract cleans its own residue via its START cleanup (L45) |
| R5 | No git commit/push until the full reflow is green |
| R6 | Correction touches **only** the statement order inside `CLEANUP_SQL` |

## 3. Evidence file (all read-only, live-verified this morning)

### E1 — Frozen F `CLEANUP_SQL`, verbatim (`.f-gate.cjs` L33–41; file = 160 lines, sha256 `9f0651ef…`)
```js
const CLEANUP_SQL = `
  ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard;
  DELETE FROM orders WHERE table_number IN (${TEST_TABLES.join(',')});      // L35 ← BLOCKED by M6 FK
  DELETE FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')}); // L36 ← never reached
  ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard;
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'FG_%');
  DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'FG_%');
  UPDATE staff SET is_active=false, status='INACTIVE', pin_hash='' WHERE name LIKE 'FG_%';
`;
```
`TEST_TABLES = [101..108, 201..208]` (gate-dedicated numbers; Z1 contract asserts 0 such rows after cleanup).
Executed at L45 (START, idempotent crash-survival) and L143 (END, **before** Z1–Z5 at L144–150).
`sql()` (L16) uses `-v ON_ERROR_STOP=1` → batch aborts at the first failing statement.
Crash handler L157 re-runs the same block → same FK → swallowed → `exit 2`.

### E2 — The blocking FK (M6 migration L50–52, live-confirmed `pg_constraint.confdeltype='r'`)
```sql
ALTER TABLE public.table_floors ADD CONSTRAINT p9_fk_table_floors_current_order_id
  FOREIGN KEY (current_order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;
```

### E3 — ALL 14 FK children of `orders` (live `pg_constraint` scan): exactly ONE is RESTRICT
| Constraint | Child.column | deltype | Effect on fixture-order DELETE |
|---|---|---|---|
| **p9_fk_table_floors_current_order_id** | table_floors.current_order_id | **[r] RESTRICT** | **BLOCKS (the M6 FK)** |
| campaign_usage, cancelled_orders, kitchen_analytics, kitchen_tickets, order_events, order_items, order_payments, payments | …order_id | [c] CASCADE | auto-cascade, never block |
| couriers.current_order_id, operation_logs.order_id, orders.merged_into, price_overrides.order_id | … | [n] SET NULL (legacy catalog oddity) | could block in theory — **empirically proven non-blocking**: every prior green F run (35/35) deleted the same fixture orders with all 13 of these FKs already in place (they predate M6) |

Conclusion: the M6 FK is the **only** new blocker; nothing else in `orders`'s child surface can reject the corrected delete.

### E4 — Trigger surface of `table_floors` (live `pg_get_triggerdef`, authoritative):
| Trigger | Fires | Pointer relevance |
|---|---|---|
| `trg_table_archive_guard` | **BEFORE DELETE** (only DELETE trigger) | disabled by L34 of CLEANUP_SQL |
| `trg_validate_table_order_pointer` | BEFORE **UPDATE OF current_order_id** | function body line 1: `IF NEW.current_order_id IS NULL THEN RETURN NEW;` — never fires on DELETE |
| `trg_release_guard` | BEFORE UPDATE OF status, current_order_id | UPDATE-only |
| `trg_emit_table_order_event` | AFTER UPDATE OF current_order_id | UPDATE-only; reads OLD.current_order_id, **no orders lookup** |
| `increment_table_floors_version`, `trg_archived_immutable` | BEFORE UPDATE | UPDATE-only (archived_immutable reads OLD pointer, no orders lookup) |
| badge/reservation/status emitters | AFTER UPDATE OF status | not pointer-related |

Source scan of all 9 function bodies: **no trigger queries `orders` on the DELETE path**; only
`validate_table_order_pointer` queries orders at all, and it is UPDATE-only. The app's own
`clear_table_atomic` (F-bound? no — production fn) performs `SET current_order_id = NULL` (L43 of
its body) with these triggers live — pointer writes are normal supported operations.

Implication for Option A: `DELETE FROM table_floors` with a **LIVE** pointer (vs STALE in all prior
runs) fires exactly one trigger — the already-disabled archive guard. **Zero new trigger path.**

### E5 — Crash mechanics (night, proven): ON_ERROR_STOP=1 aborts the batch at L35; L36–L41 never
ran; crash-handler retry hits the same FK; exit 2; Z1–Z5 (L144–150) never executed; A7–A10 visible
PASS in captured tail; no fresh F report file.

### E6 — Residue inventory (live, unchanged since 01:10 snapshot):
- orders ×4: `34684b10…`(101,confirmed) `b4b24514…`(102,confirmed) `5fbbde88…`(103,confirmed) `fd1abd94…`(105,cancelled)
- table_floors ×8: 101/102/103 (occupied, **live** ptr — the FK-referencing rows), 104/205 (empty), 105/207 (occupied, no ptr), 208 (dirty)
- FG_MGR / FG_WTR / FG_WTRB: **ACTIVE, pin set** + 3 sessions (3h TTL) + 3 staff_locations
- Invariants: 0 stale pointers (all 3 ptrs live), 0 orphan orders (orders.table_number = loose ref, no FK), `trg_table_archive_guard`='O', 0 order_items children

### E7 — Staff complement (live, DENY53 extracted from `.p9-gate.cjs` L105, 53 IDs):
**Exactly 11 rows outside DENY53 — all created by THIS night's reflow runs** (UTC→Baku UTC+4):
| Name | Baku created | is_active | pin | Source run |
|---|---|---|---|---|
| A_RT_MGR_B / A_RT_WTR_B / A_RT_CASH_B | 00:57 | f | f | A gate (39/39 green — A's contract neutralizes, doesn't delete) |
| G2mu60jfp4_CASH/WTR/MGR/NOL/INACT | 00:59 | f | f | E/S gate (54/54 green — same neutralize contract) |
| FG_WTR / FG_MGR / FG_WTRB | 01:01 | **t** | **t** | F gate (crashed before L40 neutralize) |

Steady-state arithmetic: corrected F run's START cleanup deletes the 8 tables + 4 orders (R4),
and L40 neutralizes the 3 FG_ (ACTIVE→INACTIVE, pin='') → **all 11 rows inert → pool=9,
active=9, staff_total=64** (53 real + 11 inert fixtures). No real-staff row is ever touched.

## 4. Correction candidates (exact diffs)

### ✅ Option A (RECOMMENDED) — pure teardown-order swap, 2 lines, zero new statements
```diff
 const CLEANUP_SQL = `
   ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard;
+  DELETE FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')});
-  DELETE FROM orders WHERE table_number IN (${TEST_TABLES.join(',')});
+  DELETE FROM orders WHERE table_number IN (${TEST_TABLES.join(',')});
   ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard;
   ... (L38–L40 unchanged)
 ```
i.e. child (pointer-holding `table_floors`) deleted before parent (`orders`) — standard
FK-teardown discipline, which is exactly what the ratified RESTRICT FK now requires.

Why A is safe (all from E3/E4 source evidence):
1. No FK from `orders` → `table_floors` exists (E3: `orders_to_floors_fk=0`) → deleting tables first is unblocked.
2. The only DELETE-firing trigger is the archive guard — disabled two lines above (E4).
3. No trigger queries `orders` on DELETE (E4 source scan) → live-vs-stale pointer at delete time is semantically inert.
4. Every statement after the swap is byte-identical to the frozen contract; every prior green run already executed the exact `DELETE FROM table_floors` shape.
5. Idempotent under the crash-handler retry (L157): re-run of an already-clean state = no-ops.
6. The corrected START cleanup (L45) self-clears tonight's residue (E6) — **satisfies redline R4** (no manual deletion).

### Option B (fallback, documented — not recommended) — one scoped pointer-null before orders delete
```diff
 const CLEANUP_SQL = `
   ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard;
+  UPDATE table_floors SET current_order_id=NULL WHERE table_number IN (${TEST_TABLES.join(',')}) AND current_order_id IS NOT NULL;
   DELETE FROM orders WHERE table_number IN (${TEST_TABLES.join(',')});
   DELETE FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')});
   ...
```
Also contract-safe (trigger source: `NULL → RETURN NEW`; operation = `clear_table_atomic`'s own L43
pattern), but strictly larger change surface: 5 trigger firings per cleanup (release_guard,
validate, version, archived_immutable, emit event) + new event-table rows, and it adds a DML type
(UPDATE) to a delete-only block. Keep as fallback only if A's re-run surfaces an unforeseen block.

## 5. Secondary finding — P9 gate S5.4 (P-9's own harness file, NOT frozen; needs your ratification)

**Problem:** S5.4 today asserts `staff total = 53 AND extra (non-DENY53) rows = 0` (byte-verified
post-purge state). But F's ratified contract (L40) **neutralizes instead of deleting** FG_ staff on
every run — and A/ES do the same (E7). After the corrected F re-run, 11 inert fixture rows exist
permanently → S5.4 would report REAL-RISK on a perfectly healthy state. This is a P9-gate
assertion calibration issue, not a data issue.

**Proposed refinement (keeps every real-staff protection intact):**
- **S5.4a (unchanged):** all 53 DENY53 IDs present — real staff byte-verified.
- **S5.4b (replaces extra=0):** `count(*) WHERE id NOT IN (DENY53) AND (is_active OR status='ACTIVE' OR (pin_hash IS NOT NULL AND pin_hash<>'')) = 0` — **no active/pinned row may ever exist outside the denylist** (this is the real-staff-identity protection; it's what made pool=12 dangerous, and it would have caught it).
- **S5.4c (new):** every non-DENY53 row must match the UPPER_SNAKE fixture style: `name ~ '^[A-Z0-9]+(_[A-Z0-9]+)+'` — any real-looking name appearing outside the denylist = REAL-RISK.
- **S5.4d (unchanged):** pool = 9.

Net effect: strict "53 and only 53" → "53 real + only inert, fixture-styled, non-pinned extras".
This matches the M7 D-8 inert-fixture definition and tolerates the frozen gates' neutralize contract.

## 6. Post-GO execution plan (each step gated on the previous green)

1. Apply Option A to `.f-gate.cjs` (2-line swap in `CLEANUP_SQL` only; everything else byte-frozen).
2. Run F with **full output capture** (`tee .f-gate-run-2026-09-18.log`) → expect **35/35** incl. Z1–Z5; START cleanup self-clears E6 residue (R4).
3. Post-F read-only assertions: 0 tables in 101–208, 0 orders in 101–208, 0 FG_ sessions/locations, 3 FG_ inert (active=f, pin=''), pool=9, active=9, staff_total=64, archive_guard='O'.
4. Apply S5.4 refinement to `.p9-gate.cjs` (P-9's own file).
5. Re-run P9 gate → expect **22/22** again (proves P-9 invariants hold under corrected steady state; S5.4b/c now green on the 11 inert rows).
6. Resume reflow: O (`O_ROUTE=artifacts/saito-admin/src/app/api/orders/route.ts`) → K-L3 → K-L4 → P1..P8 (`P7_ALL=1`, `P8_ALL=1`) with per-gate baseline tallies (checkpoint §6).
7. Then: P-9 FREEZE report (your template) + HANDOVER update + git commit/push (tasks 84/85).

## 7. Non-goals (reaffirmed)

No FK change/drop/cascade · no migration · no app code · no trigger · no manual residue deletion ·
no git · no O→P8 before F 35/35 · no silent scope expansion beyond §4-Option-A + §5 (both itemized for ratification).

## 8. Change log since FULL-STOP snapshot (01:10)

**Zero writes** to repo or DB. All work this morning = read-only queries + this document + task-board notes.
