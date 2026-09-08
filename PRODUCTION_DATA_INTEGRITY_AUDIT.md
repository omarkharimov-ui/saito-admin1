# Production Data Integrity Audit — Tables 4/5/6 (+ full-floor sweep)

**Date:** 2026-09-08 · **Method:** AUDIT ONLY — real data **read-only SELECT** + in-file `BEGIN…ROLLBACK` probes (never `--single-transaction`). **No repair executed.** STOP at approval.

Predecessor: `TRANSFER_CONTRACT_AUDIT.md` §9 P-3 (first flagged tables 4/5/6). This audit executes the mandated **canonical source → expected aggregate → repair strategy** sequence for each.

---

## 1. Exact current state (live SELECT, 2026-09-08 ~18:45 UTC)

| Table | Status | `merged_into` | Floor `current_order_id` | Floor total / cnt / guest | Orders truth (non-final) | Reservation state |
|---|---|---|---|---|---|---|
| 3 | empty | — | — | 0 / 0 / 0 | **none** (only old paid/cancelled) | — |
| **4** | **merged** | **3** | **`ae11362c`** | 0 / 0 / 0 | **`ae11362c` confirmed 49.00, 6 guests, kitchen pending, updated 09-08 17:53, 0 payments** | — |
| **5** | occupied | — | `446f73a3` | **17 / 0 / 1** | `446f73a3` **confirmed 45.00**, 1 guest | — |
| **6** | reserved | — | `3ece55a7` | 0 / 0 / 0 | `3ece55a7` **`served`, kitchen `completed`, 0.00**, updated 08-22 | `reservation_id NULL`, `reservation_status_snapshot='checked_in'`, floor `kitchen_status='completed'` |
| 7 | reserved | 6 | — | 0 / 0 / NULL | none | same legacy no-record reservation as 6 |

### 1.1 Full-floor sweep (all real floors, `table_number < 9000`)
The three patterns were swept across every real floor:

| Pattern | Definition | Floors affected |
|---|---|---|
| **A** — merged child carries an open bill | `status='merged'` AND open (non-final) order on the child | **only 4** |
| **B** — aggregate drift | floor `total_amount`/`order_count` ≠ sum of its open orders | **2** (17.00→0), **5** (17→45), **10** (0→38), **15** (0→10) |
| **C** — pointer at stale/final-stage order | floor points at a non-`confirmed`-fresh order while occupied, or reserved with a dead pointer | **6** (`served`), 17 (`confirmed` 0.00 — see §4.4, likely valid), 8/9 fresh |

**Scope correction:** the original "tables 4/5/6" ticket understates it — **5 floors need the same class of repair** (4, 5, 10, 15 by drift; 6 by stale pointer). No other pattern-A instance exists anywhere.

---

## 2. Per-anomaly: root cause · canonical source · reproducibility

### 2.1 Table 4 — merged child with live 49.00 bill (Pattern A)
- **Root cause (provenance, read-only):** order `ae11362c` created **08-31 16:49** as an *open* bill on table 4; table 4 was already merged into 3 (last merge of 3/4 pre-dates it; oplog shows the 3/4 group was unmerged on 08-16 and 08-01, re-formed by legacy/manual path, no later `merge_tables` oplog entry). A **legacy merge/pointer path** left the open order on the *child* while the group stayed merged. The current `merge_tables_atomic` **cannot** create this: it requires the child's open order to move to the parent with `merged_from_table`/lineage (guard `G_MERGE_CHILD_NO_ORDER` / order-move is mandatory). ⇒ **Frozen legacy artifact, not reproducible by any live RPC.**
- **Canonical source:** `orders` (table 4's open bill is real business data: 49.00, 6 guests, unpaid). Floor 4's aggregates are correct *for its own orders* (0), but the bill is **invisible on the floor UI** (child hidden under empty parent 3).
- **Impact:** real open money not visible on floor; bill requested → would hit a hidden table.
- **Reproducibility:** ❌ cannot be recreated by current contract (verified: merge moves child orders; unmerge now recovers child orders — P-1).

### 2.2 Table 5 — aggregate drift 17 vs 45 (Pattern B)
- **Root cause:** floor row is **stale** (`updated_at 2026-08-26 12:23`, version 70) while its open order `446f73a3` (45.00, created 08-27) was written by a path that never called `sync_table_order_aggregates`. No `orders`-table trigger syncs aggregates — only the 5 RPCs (`merge/unmerge/seat_guests/transfer_table/dismiss_table`) do. ⇒ A **direct order INSERT/UPDATE outside the RPC contract** left the floor stale. Not reproducible *via* the RPCs (they always sync); reproducible only by direct-SQL writes (the same class that produced rows 2/10/15).
- **Canonical source:** `orders` — expected: **total 45.00, count 1, guest 1, has_pending true**.
- **Reproducibility:** ✅ self-heal verified in ROLLBACK probe **RP-1**: `sync_table_order_aggregates(5)` → 45/1/1/pending. No pointer change, no trigger conflict. **Trivial, safe.**

### 2.3 Table 6 — reserved parent pointing at a `served` 0.00 order (Pattern C)
- **Root cause:** order `3ece55a7` created 08-15 21:10 during the legacy 6/7 reservation cycle, advanced to `served` (0.00) 08-22 — **never closed**. Table 6's floor still points at it, `kitchen_status='completed'`, `reservation_status_snapshot='checked_in'` but `reservation_id NULL` (legacy no-record reservation — the group has **no live reservation row**; the only resv bound to 6/7, `549c23be`, is `cancelled`). So the 6/7 group is a **zombie reservation** (checked-in snapshot, no reservation, dead pointer).
- **Canonical source:** ambiguous — **business decision needed**: (a) the 6/7 table is actually occupied by a served bill (then it should be `occupied`, not `reserved`, and the 0.00 `served` order is a data bug), or (b) the seating ended 08-22 and the floor simply was never released (then the pointer is dead and the group should be released). The oplog shows no release/dismiss of 6/7 since 08-15.
- **Reproducibility:** ✅ partially — a `served` order **blocks floor release by design**: probe **RP-3** confirms direct `UPDATE status='empty'` on table 6 fails loud `TABLE_ORDER_POINTER_ACTIVE` (release guard). So the *shape* "reserved floor can't be released while pointing at a non-final order" is **enforced, not a bug**; the bug is only that the 0.00 `served` order was never closed by whoever served it 08-22.
- **Reproducibility of the dead pointer itself:** `served→paid` and `served→cancelled` are the **only** valid state-machine exits (verified via `validate_transition`); `served→closed` is invalid. So a stale `served` pointer is a *workflow* gap, not a trigger gap.

### 2.4 Table 17 — reserved with an open 0.00 `confirmed` order (kitchen `reserved`)
- **Assessment:** looks like the **intended pre-order seat pattern** (0.00 placeholder order, kitchen `reserved`, real reservation `df1e3084` active, guests 3, tables 16/17/18 consistently bound). **Recommend: leave as-is.** No repair proposed; flag only for your confirmation that this is the intended business state.

---

## 3. Would triggers/RPC recreate the anomalies? (summary of probe results)

| Probe (in-file `BEGIN…ROLLBACK`, rolled back, 0 residue) | Result |
|---|---|
| RP-1 `sync_table_order_aggregates(5)` on real table 5 | self-heals to 45/1/1/pending — no side effects, no pointer change |
| RP-2 `unmerge_tables_atomic(3, ARRAY[4])` on the **real** group 3/4 | **succeeds** (P-1 path): child 4 → `occupied` w/ `ae11362c` (49.00 visible), parent 3 → `empty`, audit-trailed, no 40P01, no partial state — rolled back after verification |
| RP-3 direct `UPDATE table 6 → 'empty'` | **fails loud** `TABLE_ORDER_POINTER_ACTIVE` (release guard working as designed) |

Conclusion: **none of the three anomalies is recreated by the current live contract.** 2/5/10/15 drifts come only from writes bypassing the RPC contract; table 4's shape is a frozen pre-V2 artifact; table 6's blockage is correct guard behavior on an unclosed order.

---

## 4. Repair strategy — **NOT executed**, awaiting approval

**General:** every repair is (1) snapshot first, (2) executed in one explicit transaction (or as the shown RPC call, which is itself atomic), (3) verified by the listed SELECTs, (4) rolled back if any check deviates. No DDL. No `next-env`. No fixture residue (all on real floors, no new rows except the audit/oplog rows the RPCs themselves emit — expected and desirable).

### 4.1 Table 5 (and 2, 10, 15) — aggregate re-sync (Pattern B)
```sql
BEGIN;
SELECT public.sync_table_order_aggregates(5);
SELECT public.sync_table_order_aggregates(2);   -- 17.00 → 0
SELECT public.sync_table_order_aggregates(10);  -- 0 → 38.00/1
SELECT public.sync_table_order_aggregates(15);  -- 0 → 10.00/1
-- verify (expect: 5→45/1/1/pending t; 2→0/0; 10→38/1/3; 15→10/1/1)
SELECT table_number, total_amount, order_count, guest_count, has_pending
FROM table_floors WHERE table_number IN (2,5,10,15) ORDER BY table_number;
COMMIT;
```
**Risk:** negligible. `sync_table_order_aggregates` only rewrites the 6 denormalized aggregate fields from `orders` (canonical). Verified on table 5 in RP-1. **Note:** tables 10 & 15 will *gain* visible open bills on the floor (38.00/3 guests, 10.00/1 guest) — confirm that's wanted before committing (it is the truth).

### 4.2 Table 4 — surface the 49.00 bill (Pattern A). **Two options:**
**Option A1 — clean unmerge (recommended):**
```sql
SELECT public.unmerge_tables_atomic(3, ARRAY[4]);
-- expect JSON: success true, mode 'group-empty', child 4 restored 'occupied' order ae11362c
-- verify: table 4 = occupied, ptr ae11362c, total 49.00/6; table 3 = empty 0/0; oplog has table.unmerged
```
Proven in RP-2 on the live rows (rolled back). Atomic, audit-trailed, no direct SQL, P-1-guaranteed. **Effect:** 49.00 bill becomes visible on table 4; parent 3 already empty.
**Option A2 — business close instead** (if the bill is actually over): `dismiss_table_atomic(4)` after unmerge, or payment flow on the order — but **only if** the 49.00/6-guest bill is business-closed. This needs your word, not the DB's.

### 4.3 Table 6 — zombie reservation group 6/7 (Pattern C). **Needs business decision first** (§2.3 a/b). If (b) "seating ended, release the group":
```sql
-- 1) unmerge 6/7 back to flat state (atomic, audit-trailed)
SELECT public.unmerge_tables_atomic(6, ARRAY[7]);
-- 2) release parent 6 through the CONTRACT RPC (it must handle the open served order
--    with the valid served->cancelled path; signature verified live):
SELECT public.dismiss_table_atomic(6, 'data-repair: stale served pointer 3ece55a7', 'cancelled', <performed_by_uuid>, 'audit-repair');
-- 3) release child 7 (no open orders -> clean):
SELECT public.dismiss_table_atomic(7, 'data-repair: legacy reservation group release', 'empty', <performed_by_uuid>, 'audit-repair');
```
(Exact behavior of `dismiss_table_atomic` — which `p_final_status` it applies to the served order — will be re-verified by a `BEGIN…ROLLBACK` probe against real 6/7 **as the first step of the approved repair**, before anything commits.)
If (a) "table actually had a served 0.00 bill that must be paid": do NOT touch the pointer — fix the *order* (total/guests) and transition `served→paid` through the payment flow; release after.
**If unsure: leave 6/7 as-is** — the guard currently prevents data corruption; the cost is one floor pair that won't release until a human decides. This is the *safe* default.

### 4.4 Table 17 — **no repair proposed** (likely valid pre-order seat pattern; see §2.4).

### 4.5 Out of scope (explicitly)
- `9991` residue — untouched per freeze.
- Dead legacy functions — separate cleanup task.
- Any schema/trigger/RPC change — transfer/merge contract is FROZEN; if you want "orders written outside RPCs can never drift floors again" that's a **new** proposal (e.g., an `AFTER UPDATE` trigger on `orders.status` calling `sync_table_order_aggregates(NEW.table_number)`) — I will not implement it without its own approval.

---

## 5. Verification hygiene of this audit
- All probes: in-file `BEGIN…ROLLBACK`, `psql` **without** `--single-transaction`. Post-rollback committed state confirmed pre-probe (table 5 = 17/0, table 6 = reserved/completed) and **0 new outbox/oplog rows** after 18:35 UTC.
- No fixtures created (probes used real rows and rolled back). No DDL. No commit, no push (push still pending valid token; commit `d141c43` ready).

## 6. Approval request (STOP)
1. **§4.1** — re-sync aggregates on floors **2, 5, 10, 15**? (Y/N per floor OK — floors 10 & 15 will show new open bills)
2. **§4.2** — table 4: **A1 unmerge (surface 49.00 bill)** or **A2 close the bill** (needs business confirmation it's over)?
3. **§4.3** — table 6/7: **business decision (a)/(b)**, or **leave as-is** for now?
4. **§4.4** — confirm table 17 state is intended (no action).
5. Optional new proposal (separate approval): **orders-status trigger for aggregate auto-sync** to make Pattern B structurally impossible.

**Nothing is repaired until you approve the specific items above.**

---

## 7. REPAIR OUTCOME (2026-09-08 ~18:51 UTC) — approved scope only, EXECUTED

**Approved (exact scope):** §4.1 sync floors 2/5/10/15 · §4.2 table 4 = **A1 unmerge** (A2 explicitly rejected) · 6/7 **no action** · 17 **no action** · orders-status trigger **not implemented** (deferred to separate design/audit).

### 7.1 Pre-repair re-snapshot (live, seconds before repair)
Values unchanged from §1: floor 2 = 17/0/NULL, 5 = 17/0/1, 10 = 0/0/NULL, 15 = 0/0/1; order `ae11362c` still `confirmed 49.00/6 guests` at table 4; `446f73a3` still `confirmed 45.00` at table 5. Expected aggregates recomputed from live `orders` matched the approved targets (2→0, 5→45/1/1, 10→38/1/3, 15→10/1/1).

### 7.2 Repair 1 — aggregate sync (floors 2,5,10,15)
`BEGIN → sync_table_order_aggregates(2),(5),(10),(15) → assertion DO-block → COMMIT`.
Assertions: floor (total/count/guest/has_pending) == `orders` truth per the sync formula **and** status/pointer unchanged for each floor. All passed.

| Floor | Before | After | Pointer/status |
|---|---|---|---|
| 2 | 17 / 0 / NULL | **0 / 0 / 0** | empty, no ptr — unchanged |
| 5 | 17 / 0 / 1 | **45.00 / 1 / 1, pending t** | occupied, ptr `446f73a3` — unchanged |
| 10 | 0 / 0 / NULL | **38.00 / 1 / 3, pending t** | occupied, ptr — unchanged |
| 15 | 0 / 0 / 1 | **10.00 / 1 / 1, pending t** | occupied, ptr — unchanged |

### 7.3 Repair 2 — table 4 A1 unmerge (3 → [4])
`BEGIN → unmerge_tables_atomic(3, ARRAY[4]) → assertion DO-block → COMMIT`.
Assertions: table 4 = `occupied` w/ ptr `ae11362c`, `merged_into NULL`, aggregates 49/1/6; table 3 = `empty`, no ptr, 0/0; order `ae11362c` = `confirmed` at 4 with `merged_into`/`merged_from_table` cleared; **tables 6 & 7 byte-identical** (reserved/completed/checked_in + served pointer `3ece55a7`). All passed.

RPC result: `{"mode":"group-empty","count":1,"success":true,"unmerged":[{"table":4,"order_id":"ae11362c…","restored":"occupied"}]}` (P-1 recovery path, as proven in RP-2).

### 7.4 Final verification (post-repair, read-only)
- **Full 1–18 snapshot** (see values in §7.2/7.3; 6/7/16/17/18 byte-identical to pre-repair — 6 still `reserved/completed/checked_in` w/ served pointer, 17 untouched `reserved` + `df1e3084` group).
- **Audit trail: exactly the expected set, nothing more:** 1 oplog (`unmerge_tables` src 3, 18:51:52, corr `931bc5b4`) + 3 outbox (`table.kitchen_changed`/`table.status_changed` @4, `table.unmerged` @3). Syncs emitted **0** outbox rows (they rewrite only aggregate fields) — as designed.
- **Residue:** fixtures 9000+ = 0; `merge_lineage` on 1–18 = 0; **9991 intact** (1 oplog + 2 outbox); no unexpected oplog/outbox rows anywhere.
- **Not committed / not pushed** — report stays uncommitted alongside the deferred push (token fix pending; then `d141c43` + both audit/repair reports in one clean push per your plan).

### 7.5 Deferred (no action taken, per approval)
- **6/7** — held as-is (zombie reservation; business decision outstanding). Release guard keeps it safe from silent corruption.
- **17** — accepted as intended pre-order seat state.
- **orders-status auto-sync trigger** — proposed only; requires a separate design/audit (all transitions, table-less/delivery orders, merged orders, payment/reopen/refund, reservation orders, trigger recursion, performance, outbox duplication) before any production trigger.
- **Dead legacy function cleanup** — separate task.

**STOP.** No further changes until new approval.
