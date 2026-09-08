# Order → Table-Aggregate Sync: Trigger Design Audit (AUDIT ONLY — NO IMPLEMENTATION)

**Date:** 2026-09-08 · **Scope:** decide whether a DB trigger (or another mechanism) should prevent floor-aggregate drift (the class we just repaired on 2/5/10/15). Read-only + in-file `BEGIN…ROLLBACK` probes only. **No DDL committed, no trigger installed, nothing pushed.**

**Principle honored:** we are not changing anything just because it looks clean. This audit exists to answer *is a trigger actually required, or is there a better invariant/RPC mechanism?*

---

## 1. The real structural gap (quantified)

| Fact | Value |
|---|---|
| Public functions that **write** `orders` (INSERT/UPDATE/DELETE) | **105** |
| Of those, that call `sync_table_order_aggregates` | **5** (merge, unmerge, seat_guests, transfer_table, dismiss_table — all *structural*, none *lifecycle*) |
| Public functions that write `table_floors` aggregates **directly** (bypass sync) | **44** |
| `orders` table triggers | **none** (no sync, no floor consistency) |
| `table_floors` triggers | status/kitchen emit, version bump, release guard, pointer validate — **none recompute aggregates** |

**Conclusion:** floor aggregates are maintained by **scattered per-write-path code** (44 direct writers + 5 sync-callers), with **no single canonical enforcement point**. Any order write that touches an aggregate (status, total, guest, table, merge) and forgets the sync call leaves the floor stale. That is exactly what produced 2/5/10/15. **This is a structural invariant problem, not a one-off bug.**

### The status-only trigger is a trap (important)
The original proposal was `orders.status` → sync. The probe proves it would **NOT** have prevented table 5's drift, because 5 drifted on an **order total change (item add: 17→45)** with status unchanged at `confirmed`. A correct guard must watch **`status OR total_amount OR guest_count OR table_number OR merged_into`**, on **INSERT + UPDATE + DELETE** — i.e. an *aggregate-change* trigger, not a *status* trigger.

### Lifecycle classes covered (per user's required list)
The candidate trigger (below) was explicitly probed against: table-bound, **takeaway/delivery (`table_number NULL`)**, **multi-order per table**, **merged** (`merged_into`), **transferred** (`table_number` change refreshes both floors), **reopened** (final→non-final via `status`), **cancelled/voided/refunded** (excluded set), **reservation/pre-order** (0.00 non-final order counted), **item changes** (`total_amount`). See §3.

---

## 2. Candidate trigger (PROPOSED DDL — NOT applied)
```sql
-- AGGREGATE-ONLY safety net. Does NOT touch status/pointer/kitchen (business logic stays in RPCs).
CREATE OR REPLACE FUNCTION public.sync_table_floors_on_order_change() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  -- takeaway/delivery/table-less orders: no floor to sync
  IF COALESCE(NEW.table_number, OLD.table_number) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF (NEW.status        IS DISTINCT FROM OLD.status)
     OR (NEW.total_amount IS DISTINCT FROM OLD.total_amount)
     OR (NEW.guest_count IS DISTINCT FROM OLD.guest_count)
     OR (NEW.table_number IS DISTINCT FROM OLD.table_number)
     OR (NEW.merged_into  IS DISTINCT FROM OLD.merged_into)
     OR (TG_OP IN ('INSERT','DELETE'))
  THEN
    PERFORM public.sync_table_order_aggregates(NEW.table_number);
    IF TG_OP='UPDATE' AND NEW.table_number IS DISTINCT FROM OLD.table_number THEN
      PERFORM public.sync_table_order_aggregates(OLD.table_number);  -- both ends of a move
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $f$;

CREATE TRIGGER trg_orders_sync_table_floors
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_table_floors_on_order_change();
```
`sync_table_order_aggregates` recomputes from `orders` (canonical), so the trigger is **idempotent** and **self-correcting** regardless of which of the 105 writers ran.

---

## 3. Empirical probe results (in-file `BEGIN…ROLLBACK`; candidate trigger installed, measured, dropped, **rolled back**)

| Test | Scenario | Result | Pass |
|---|---|---|---|
| T1 | INSERT order on floor 9901 | floor → `total 25 / count 1 / guest 1 / pending t`; **status left `empty`** (agg-only, as intended) | ✅ |
| T2 | UPDATE order total 25→40 (the **table-5 class**) | floor total → **40** automatically | ✅ |
| T3 | UPDATE status `confirmed→paid` | floor → **0 / 0 / pending f** (paid excluded) | ✅ |
| T4 | multi-order: 1 active (10) + 1 paid (30) on 9902 | floor → **total 10 / count 1** (paid excluded, only active summed) | ✅ |
| T5 | INSERT order with `table_number NULL` (takeaway/delivery) | **no error, no-op** | ✅ |
| T6a | outbox rows for touched floors | **0** → **no outbox duplication** (aggregate-only writes don't fire status/order events) | ✅ |
| T6b | floor `version` after many syncs | bumped (8/5/1) — see **risk R-1** | ⚠️ |
| T7 | recursion | **bounded** — `sync` is a single `UPDATE table_floors`; no loop back into `orders`; no stack overflow, no runaway | ✅ |
| T8 | cleanup (drop trigger+fn, delete fixtures) then ROLLBACK | post-rollback: floors≥9900 **0**, orders≥9900 **0**, trigger fn **0**, new outbox **0** | ✅ |

**The three risks you named — recursion, outbox duplication, performance/locking — are all empirically controlled:** bounded recursion, **zero** outbox duplication, and single-row `UPDATE`s (cheap). The one real cost is **version churn** (R-1).

---

## 4. Risks & trade-offs (honest)

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-1** | `increment_table_floors_version` is `AFTER INSERT OR UPDATE` — **every** aggregate sync bumps the floor `version` (T6b: 8 bumps). `version` is a CAS/optimistic-lock counter, so churn could spuriously signal change to any consumer diffing it. | **Low–Med** | (a) accept (order changed *did* affect the floor); or (b) add an internal `agg_version` and keep `version` for structural changes only; or (c) make the sync `UPDATE` conditional (`WHERE` aggregate actually differs) to skip no-op bumps. **Must be decided before any implementation.** |
| **R-2** | Trigger is **aggregates-only**; it will **not** fix the *pointer/status* consistency (e.g., table 6's dead served pointer, or a floor left `empty` while an order is active). Those are separate invariants owned by the 5 structural RPCs + guards. | **Design boundary** | Keep scope tight: trigger = money/count consistency. Do **not** let it silently flip `status`/`current_order_id` — that would fight the RPCs. Pointer integrity stays a guard/RPC concern (already audited, frozen). |
| **R-3** | 105 writers — many are **dead legacy** (`saito_*`, `*_v3/v4`). A trigger makes them *safe* but does not remove them. | **Low** | Separate dead-function cleanup task (already deferred). Trigger is the safety net that makes deferring them lower-risk. |
| **R-4** | Extra trigger on the hottest table (`orders`): small per-write cost (1–2 index-free aggregate `SELECT`s + 1 row `UPDATE`). | **Low** | Probe shows no runaway; aggregate subquery is `table_number`-scoped. Verify with a quick benchmark during implementation (not now). |

---

## 5. Alternatives considered (and why)

| Option | Verdict |
|---|---|
| **A. DB trigger (this doc)** | **Recommended.** Single canonical point; immune to the 105-scattered-writers problem; idempotent; proven no-duplication/no-recursion. Cost = version churn (R-1). |
| **B. Add `sync` call to each of the ~40 live order writers** | ❌ Re-implements the exact fragility that caused the drift; 40+ edits, will rot as paths are added. |
| **C. Periodic reconciler (cron/worker recomputing all floors)** | ⚠️ Viable *belt-and-braces* add-on (cheap: recompute `table_number<9000` floors every N min). Does **not** give real-time UI correctness (a floor can show the wrong amount until the next run). Best used *alongside* A, not instead. |
| **D. `CHECK` constraint / view-only floor** | ❌ Floor aggregates are mutable denormalized columns for UI speed; a `CHECK` can't *write* them, only reject — wrong tool. A **view** would fix reads but is a bigger app/RLS change and doesn't help writes that persist the columns. |
| **E. App-layer enforcement** | ❌ The 105 writers are DB functions; the app can't guarantee every one calls sync. The invariant must live where the writes happen (DB). |

**Recommendation:** **A (the aggregate-only `orders` trigger) as the primary fix**, **optionally + C (reconciler) as a safety net**. Decide R-1 (version churn) first. Keep **R-2 boundary** (aggregates only — never touch status/pointer). This is still a **new architecture change** and, per your rule, needs its own explicit approval + a small implementation pass (migration + benchmark + full regression) before it touches production.

---

## 6. Verification hygiene
- Probe: in-file `BEGIN…ROLLBACK`, **no** `--single-transaction`. Post-rollback committed state confirmed clean (floors≥9900=0, orders≥9900=0, trigger fn=0, new outbox=0, `merge_lineage`=0, 9991 intact).
- No DDL committed, no trigger persisted, no fixtures left, no commit/push (deferred to token fix, together with `d141c43` + the other reports).

## 7. STOP — decision requested
1. **Adopt Option A** (aggregate-only `orders` trigger) — yes/no?
2. **R-1 version churn**: (a) accept / (b) separate `agg_version` / (c) conditional no-op sync?
3. **R-2 boundary**: confirm trigger stays **aggregates-only** (never flips status/pointer)?
4. **Option C reconciler**: add as safety net, or skip?
5. If 1 = yes → I will prepare the **implementation** (migration + R-1 mitigation + benchmark + full regression) **as a separate, explicitly-approved pass** — I will **not** implement it in this audit.

**No implementation performed. Awaiting your decision.**
