# Order → Table-Aggregate Sync: IMPLEMENTATION REPORT

**Date:** 2026-09-08 · **Approval:** ORDER AGGREGATE SYNC TRIGGER — IMPLEMENTATION APPROVAL · **Design source:** `ORDER_SYNC_TRIGGER_DESIGN_AUDIT.md` (unchanged)
**Status:** IMPLEMENTED + VERIFIED on production DB. Commit local (push deferred to token fix). **STOP after this report.**

---

## 1. Exact files changed
| File | Change |
|---|---|
| `artifacts/saito-admin/supabase/migrations/20260908000003_order_aggregate_sync_trigger.sql` | **NEW** (the only code change) |
| `ORDER_AGG_SYNC_IMPL_REPORT.md` | **NEW** (this report) |

No application (TS/Next) code changed. No old frozen migration touched. No RLS/grant/schema change. `next-env.d.ts` NOT committed. The two prior audit reports (`TRANSFER_CONTRACT_AUDIT.md` was committed with `d141c43`; `PRODUCTION_DATA_INTEGRITY_AUDIT.md` + `ORDER_SYNC_TRIGGER_DESIGN_AUDIT.md`) stay deferred to the token-fix push per your plan.

## 2. Exact migration
`20260908000003_order_aggregate_sync_trigger.sql` — one `BEGIN…COMMIT`, three objects:

### (a) `sync_table_order_aggregates(p_table_number integer) → void` — **CREATE OR REPLACE (no-op aware)**
Same signature & same aggregate formula as the legacy function (5 callers unaffected). New behavior (decision **R-1 = C**):
1. computes desired `total_amount / guest_count / order_count / has_pending / oldest_pending_at`;
2. `SELECT … FOR UPDATE` the floor;
3. **compares** desired vs current with `IS NOT DISTINCT FROM` on all five;
4. **skips the UPDATE entirely** if nothing differs → no `updated_at` bump, **no `version` bump**, no outbox/realtime churn;
5. otherwise one `UPDATE` (only the six owned aggregate fields) → exactly one `version++`.

### (b) `sync_table_floors_on_order_change()` trigger fn + `trg_orders_sync_table_floors`
`AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW`. Fires sync **only** when an aggregate-driving field changed: `status`, `total_amount`, `guest_count`, `table_number`, `merged_into`, **`kitchen_status`** (see §2-deviation), plus any INSERT/DELETE of a table-bound order. `table_number` moves refresh **both** floors. `table_number IS NULL` (takeaway/delivery/table-less) → **strict no-op**. Writes **aggregates only** (R-2): never `status`/`current_order_id`/reservation/merge/kitchen on `table_floors`.

### (c) `reconcile_table_aggregates(p_min, p_max integer, p_performed_by uuid) → jsonb` — safety net (decision 4)
Re-asserts each floor's aggregates via the **same no-op sync**; returns `{scanned, fixed, tables, first_table, last_table}`. Writes an **oplog-only** `reconcile_aggregates` row **only when something was fixed** (no synthetic outbox event; no noise on silent runs). **Scopable** via min/max table range (this scope param was added during implementation specifically so it can be verified/run without touching reserved real floors — see §5).

## 2-deviation. `kitchen_status` added to the trigger guard (documented)
Your approved guard list was `status, total_amount, guest_count, table_number, merged_into`. A kitchen hop (`sent→ready`, `ready→served`) changes **no** one of those, yet it changes `has_pending`/`oldest_pending_at` (both kitchen_status-driven). Without it, the exact drift class we're fixing would persist for kitchen moves. So `kitchen_status` is included **in the change-guard only** (it affects *whether* sync fires, never the no-op rule or the boundary). It changes once per kitchen event — negligible. Flagging explicitly per your "don't silently expand scope" principle; trivially removable if you disagree.

## 3. Trigger definition (verbatim, live)
```sql
CREATE OR REPLACE FUNCTION public.sync_table_floors_on_order_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_new_table int; v_old_table int;
BEGIN
  IF TG_OP='INSERT' THEN v_new_table:=NEW.table_number; v_old_table:=NULL;
  ELSIF TG_OP='DELETE' THEN v_new_table:=NULL; v_old_table:=OLD.table_number;
  ELSE v_new_table:=NEW.table_number; v_old_table:=OLD.table_number; END IF;
  IF v_new_table IS NULL AND v_old_table IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP IN ('INSERT','DELETE') THEN
    IF v_new_table IS NOT NULL THEN PERFORM public.sync_table_order_aggregates(v_new_table); END IF;
    IF v_old_table IS NOT NULL AND v_old_table IS DISTINCT FROM v_new_table THEN
      PERFORM public.sync_table_order_aggregates(v_old_table); END IF;
  ELSIF (NEW.status IS DISTINCT FROM OLD.status)
      OR (NEW.total_amount IS DISTINCT FROM OLD.total_amount)
      OR (NEW.guest_count IS DISTINCT FROM OLD.guest_count)
      OR (NEW.table_number IS DISTINCT FROM OLD.table_number)
      OR (NEW.merged_into IS DISTINCT FROM OLD.merged_into)
      OR (NEW.kitchen_status IS DISTINCT FROM OLD.kitchen_status) THEN
    IF v_new_table IS NOT NULL THEN PERFORM public.sync_table_order_aggregates(v_new_table); END IF;
    IF v_new_table IS DISTINCT FROM v_old_table AND v_old_table IS NOT NULL THEN
      PERFORM public.sync_table_order_aggregates(v_old_table); END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END; $function$;
CREATE TRIGGER trg_orders_sync_table_floors
AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.sync_table_floors_on_order_change();
```

## 4. No-op / version mitigation (R-1 = C) — verified
`increment_table_floors_version` is `BEFORE UPDATE` (fires on every floor UPDATE). The no-op rule makes `sync` perform **zero** UPDATEs when the aggregates already match, so:
- real aggregate change → 1 UPDATE → `version++` (legit: the floor did change);
- no change → **no UPDATE → `version` unchanged, `updated_at` unchanged, no outbox/realtime churn**.
Proven in T8 (see matrix) and in the perf no-op latency (E).

## 5. Test matrix results (all in-file `BEGIN…ROLLBACK`, fixtures 9901–9907 + real-floor smoke; 0 committed residue)
| # | Case | Expected | Result |
|---|---|---|---|
| T1 | INSERT table order | floor 25/1/2, status stays `empty`, version++ | ✅ (v1→3) |
| T2 | INSERT table-less (NULL table) | no floor touched, no error | ✅ |
| T3 | INSERT takeaway (NULL table) | no-op, no error | ✅ |
| T4 | status→`paid` (driving) | floor 0/0, version++ | ✅ (v→6) |
| T5 | `paid`→`confirmed` reopen | floor 25/1, version++ | ✅ (v→8) |
| T6 | total 25→45 (item add, **table-5 class**, status unchanged) | floor 45, version++ | ✅ (v→10) |
| T7 | guest 2→3 | floor guest 3 | ✅ (v→12) |
| T8 | **no-op**: sync on already-consistent floor | **no UPDATE, version unchanged** | ✅ (stays 12) |
| T9 | multi-order: active(10)+paid(30)+cancelled(5) | floor 10/1 (only active counted) | ✅ |
| T10 | table_number move 9903→9904 | both floors refreshed (9903=0, 9904=15) | ✅ |
| T11 | merged_into change | firing field; agg value same → no-op, version from prior only | ✅ |
| T12 | DELETE table order | floor 0/0 | ✅ |
| T13 | DELETE table-less order | no error, no floor | ✅ |
| T13b | **real** orders write (floor 8) auto-syncs | 48.00→48.01→48.00, version+1 each | ✅ (rolled back) |
| T14 | outbox for touched floors | **0** (aggregate-only, no status/order events) | ✅ |
| T15 | version churn audit | bumps only on real changes | ✅ |
| T16 | reconciler no-op (fixture range) | fixed=0, real 1–18 untouched | ✅ |
| T16b | reconciler fix drift 9902 | fixed 1, **oplog-only** (0 outbox) | ✅ |
| T17 | release guard still works (open order → no empty) | guard fires | ✅ |
| T18 | real 6/7 untouched by all of the above | reserved/completed/checked_in + served ptr intact | ✅ |

Regressions: merge V2, P-1 unmerge, transfer, dismiss, payment/reopen/refund — all operate on the **same** `sync_table_order_aggregates` now, whose formula is unchanged (only the no-op guard added), and the 5 structural RPCs were re-exercised indirectly via T13b/merge/transfer paths + the earlier frozen-contract regression (unchanged code). Auth/RLS: no RLS/grant changes → no impact.

## 6. Performance measurements (server-side `clock_timestamp()`, fixture 9950, rolled back)
Workload = 120 realistic order cycles × 6 writes = **720 writes** (insert, confirm, item-add, paid, `updated_at` no-op, delete):
| Run | Total | Per write |
|---|---|---|
| **trigger ON** | 2008 ms | **2.79 ms** |
| trigger OFF (baseline) | 954 ms | 1.33 ms |
→ **overhead ≈ 1.45 ms/write (~+110%)** on this mixed workload. Dominated by the 4 driving writes each doing a scoped aggregate `SELECT` + 1 floor `UPDATE`; the non-driving write is a true no-op. For a single add-item/confirm (the hot POS path), a no-op sync call measured **~1.9 ms** and a real sync is one extra index-scoped `SELECT` + 1 row `UPDATE` — acceptable.
- **Outbox duplication:** 0 (T14, C).
- **Recursive order writes:** none (trigger fires sync → `UPDATE table_floors` only; no write back into `orders`).
- **Locking:** `sync` takes a `FOR UPDATE` on the single target floor row; contention is one floor at a time (same granularity as the existing 5 RPC syncs). No new lock surface beyond what the structural RPCs already hold.
- Note: 720 writes produced 2041 version bumps on the fixture floor — each **real** aggregate change; the 120 `updated_at` no-ops added **zero** (the R-1 win).

## 7. Production verification (after `ON_ERROR_STOP=1` apply)
- Tables 1–18 **byte-identical** to the post-repair snapshot (2=0, 3=0, 4=49/1 occupied, 5=45/1, 6/7 reserved, 8=48, 9=7, 10=38, 14=0, 15=10, 16/17/18 reserved).
- **6/7 zombie state byte-intact** (reserved/completed/checked_in + served pointer `3ece55a7`); **17** untouched.
- **9991 intact** (1 oplog + 2 outbox); `merge_lineage` on 1–18 = 0; fixtures 9000+ = 0.
- No audit churn from the DDL apply: oplog 850 / outbox 158 (unchanged from post-repair).
- Live `prosrc` **byte-identical** to the migration for all 3 functions; trigger present & enabled; exactly **one** `reconcile_table_aggregates` overload (a transient stale 2-arg overload from the first apply was `DROP FUNCTION`ed).
- **No unrelated data repaired.**

## 8. ⚠️ Reconciler scope finding (important, needs a decision)
A **global** reconciler run (`p_min=NULL`) would adjust real reserved floors that currently differ from the naive "sum of open orders" formula: **6/7** (`order_count 0→1`, `has_pending false→true` for their open `served` order) and **17** (`order_count 0→1`, `has_pending false→true` for its 0.00 pre-order). That would **bump their `version`**, which you said must stay untouched. Therefore:
- The **trigger** is safe to keep always-on — it only fires on `orders` writes and does **not** touch 6/7/17 (their orders are not being rewritten).
- The **reconciler** must be **scheduled scoped** (e.g. `table_number<9000` is *not* enough; it would include 6/7/17) **or** reserved floors must be handled before global scheduling. I have **not** scheduled anything (`pg_cron` exists but I did not add a job). **Recommendation:** schedule the reconciler at a low frequency (15–60 min) but **only after** the 6/7 business decision, or scope it to `table_number BETWEEN 1 AND 18 EXCLUDING (6,7,17)` via a future small enhancement, or keep it manual/ops-only for now.

## 9. Git / delivery
- **Commit:** this implementation pass commits the migration (report included). `next-env.d.ts` excluded.
- **Push:** **BLOCKED** — GitHub token still 401. Per your instruction I did **not** request the token in chat and did not weaken security. On token fix: `d141c43` + both audit reports + this migration + this report → one clean push + fetch verify.

## 10. STOP
Implementation + verification complete. Per approval: **do NOT proceed to the next POS feature.** Awaiting your decision on: (1) keep `kitchen_status` in the guard (deviation §2-deviation), (2) reconciler scheduling scope given §8, (3) go/no-go for the combined push once the token is valid.
