# P-9 NIGHT CHECKPOINT — 2026-09-18 (01:00 local)

**Status: 🟢 P9 GATE 22/22 PASS · 🟡 reflow 2/14 done · 🔴 STOP at F (needs your decision)**
Night protocol applied: hard-stop at F crash (frozen gate FAIL, non-trivial) → evidence captured → stop, no silent fixes.

---

## 1. Migrations applied this phase (all single-txn, ON_ERROR_STOP, all with rollbacks)

| Migration | File | State |
|---|---|---|
| M1 | `20260918000001_p9_rls_grant_pass.sql` | APPLIED |
| M1-R1 | `20260918000008_p9_m1_rpi_auth_revoke.sql` | APPLIED (RPI: `REVOKE ALL ON reservation_preorder_items FROM authenticated` — plan line 69 ratified cell; applied via `SET ROLE postgres` after pooler `current_user=authenticated` anomaly made first apply a no-op) |
| M2 | `20260918000002_p9_settings_views.sql` (10 views) | APPLIED |
| M3 | `20260918000003_p9_app_settings_cleanup.sql` (4 cols) | APPLIED |
| M4 | `20260918000004_p9_orders_items_drop.sql` + `v_closed_orders` rewrite | APPLIED |
| M5 | `20260918000005_p9_dead_tables_archive.sql` (waiter_assignments + audit_log only; M5-R1 staff_stats recreated; M5-R2 dining_groups EXCLUDED = LIVE/FROZEN-BOUND, Option A) | APPLIED |
| M6 | `20260918000006_p9_safe_fks.sql` (10 new RESTRICT FKs, M6-R1: 14→10) | APPLIED 2026-09-17 |
| M7 | `20260918000007_p9_staff_fixture_purge.sql` (10-req transactional hard-stop; 1,055 fixtures; 53-ID denylist byte-verified; 14 archives) | APPLIED 2026-09-18, preflight 24/24 |

Post-M7 live-verified: staff=53 (9 active), pool=9, fixture-pattern=0, dining_groups + `orders_group_id_fkey` + `merge_tables_v4` intact, staff_stats 53 rows/32 cols.

## 2. P9 gate `.p9-gate.cjs` — **22/22 PASS, 0 REAL-RISK, 0 HARNESS, EXIT=0**

```
S1.1 grant map: FULL11×3 roles=∅; RPI×{auth,test}=∅ (M1-R1); CAT3×{auth,test}=∅   PASS
S1.2 anon keeps SELECT on CAT3+RPI                                              PASS
S1.3 52 denied functional probes (rolled-back txns)                             PASS
S1.4 anon SELECT on CAT3+RPI succeeds (policy-bounded)                          PASS
S1.5 RLS4: enabled + ≥2 policies + 0 rows as authenticated                      PASS
S1.6 RPI: RLS on + 3 pre-existing policies                                      PASS
S2.1 10 v_settings_* ≡ settings (jsonb equality, all cols)                      PASS
S2.2 8 GET /api/settings/* → 200 (owner cookie token)                           PASS
S2.3 /api/settings/geo GET → 405 (PATCH-only by design)                         PASS
S3.1 orders.items column dropped                                                PASS
S3.2 INSERT orders without items ok (rolled back)                               PASS
S3.3 v_closed_orders.item_count ≡ order_items (ALL rows)                        PASS
S3.4 upsert_popular_query roundtrip — 0 residue                                 PASS
S4.1 M6 tripwires: 3 orphans blocked (23503) + 3 clean ok                       PASS
S5.1 fixture staff = 0                                                          PASS
S5.2 active staff = 9 (all real)                                                PASS
S5.3 pool ≤ 9 (was 39)                                                          PASS
S5.4 53-ID denylist intact two-way (total=53, extra=0)                          PASS
S5.5 FRESH fixture login 200 + token + session + shift (A-incident regression)  PASS
S6.1 test_rls_role exists, 0 grants on 15 tables                                PASS
S7.1 P-8 canary T-4: close→idempotent:true→new-key rejected, close-row=1        PASS
T.1  zero residue: 0 P9GATE_* staff                                             PASS
```

**Gate v4 fixes applied this night (harness-only, no DB/scope change):**
1. Robust `teardownGateStaff`: auto-discovers the full live-verified FK child surface (30 FKs → staff + 4 soft refs), RESTRICT/NO-ACTION/CASCADE-aware order (per-shift children → drawer logs → sessions → shifts → children → trigger-guarded staff `SET ROLE postgres`), **verifies 0 rows after delete — throws on residue**.
2. S5.5 fixture torn down immediately (login_commit's shift auto-discovered by fix 1).
3. S2b got its own short-lived `P9GATE_RT*` token fixture (S5's no longer available) + immediate teardown.
4. S7 ledger assert = P8 T-4 semantics: `type='close'` = 1 (was total rows).
5. Self-heal at gate start: removes any `P9GATE_*` leftovers from crashed runs before checks.
6. **Transport retry (P-8 pattern)**: S2b login got `ECONNRESET` 3/3 runs. Root-caused with log-marking: the reset request **never reached the server** (`/private/tmp/saito-dev.log` has only S5.5's 200 for the marked window). Cause: Node19+ client keep-alive pool reuse racing the dev server's 5s idle-FIN; the gate's ~40-psql teardown gap (3–6s) lands in the window. Fix = P-8's frozen `http()` retry-on-reset wrapper (6×, backoff). Proven duplication-safe (pre-processing reset).

## 3. Frozen reflow (plan §4 order) — 2/14 done, 🔴 at F

| # | Gate | Result | vs baseline |
|---|---|---|---|
| 1 | `.a-regression.cjs` | **39/39 PASS**, exit 0, "active A_RT staff left = 0" | = A 39/39 ✅ |
| 2 | `.es-gate.cjs` | **54/54 PASS**, exit 0, "ALL GREEN", cleanup done | = ES 54/54 ✅ |
| 3 | `.f-gate.cjs` | **🔴 CRASH in teardown** (see §4) | deviation |
| 4–14 | O, K-L3, K-L4, P1–P8 | **NOT RUN** (stopped per protocol; F residue would contaminate counts) | — |

## 4. F gate crash — full triage (root cause PROVEN, no env/flake)

**Error (verbatim, from gate stdout):**
```
F GATE CRASH: Error: SQL: ERROR:  update or delete on table "orders" violates foreign key
constraint "p9_fk_table_floors_current_order_id" on table "table_floors"
DETAIL:  Key (id)=(34684b10-a88e-4fcc-8f58-430f061d2e37) is still referenced from table "table_floors".
    at S (/Users/mr.apple/saito-admin1/.f-gate.cjs:17:52)
    at /Users/mr.apple/saito-admin1/.f-gate.cjs:143:3
```

**Mechanics (all read-verified against the frozen file):**
- Line 143 = final `S(CLEANUP_SQL)` (line 33): `DISABLE TRIGGER → DELETE FROM orders WHERE table_number IN (101..108,201..208) → DELETE FROM table_floors … → ENABLE TRIGGER → FG_ sessions/locations/staff-neutralize`.
- `sql()` uses `-v ON_ERROR_STOP=1` → batch aborts at statement 2 (the orders DELETE) → table_floors delete + FG_ neutralization never ran.
- Crash handler (line 157) retried the same CLEANUP_SQL → same FK → swallowed → `process.exit(2)`.
- Root cause: **M6's ratified RESTRICT FK `p9_fk_table_floors_current_order_id`** (table_floors.current_order_id → orders, applied 2026-09-17) vs the F gate's pre-M6 cleanup order. The F fixtures occupy tables 101–103 (`current_order_id` → fixture orders); deleting orders first is now rejected. 100% P-9-attributable, 0% env.
- Checks: A7–A10 visible PASS in captured tail; earlier checks scrolled (output not fully captured this session); **Z1–Z5 (residue checks) never executed**; no fresh `.f-gate-report.json` (crash before line 154).

**Residue inventory (live, read-only, 01:00 — all rows created by this run <2h ago):**

| Table | Rows | Detail |
|---|---|---|
| orders | 4 | `34684b10…` (101, confirmed), `b4b24514…` (102, confirmed), `5fbbde88…` (103, confirmed, LOC_B), `fd1abd94…` (105, cancelled) — each 50.00 |
| table_floors | 8 | 101/102/103 occupied **with live ptr** (FK-consistent, NOT orphans); 104 empty; 105 occupied no-ptr; 205 empty; 207 occupied; 208 dirty |
| staff | 3 | FG_MGR (manager), FG_WTR, FG_WTRB (waiters) — **all ACTIVE, all pin_hash set** (5522/5511/5533 per gate source) |
| sessions | 3 | FG_ staff, 3h TTL (expire ~04:00) |
| staff_locations | 3 | FG_ staff |

**Invariants:** 0 stale `current_order_id` pointers (all 3 ptrs live — F-10/A6 intact); 0 orphan orders (orders.table_number is a loose ref, no FK, verified `orders_to_floors_fk=0`); `trg_table_archive_guard` = 'O' (enabled, production protection intact); 0 order_items children.
**Drift created:** `pool_now=12` (was 9 — the 3 FG_ fixtures are in the login_preflight pool) and `staff_total_now=64` (was 53). A re-run of the P9 gate now would FAIL S5.2/S5.3/S5.4 on this residue alone.

## 5. Options for you (I will not choose overnight — both touch frozen/approval-gated scope)

**Option 1 — minimal F-gate teardown patch (my recommendation).** In `.f-gate.cjs` `CLEANUP_SQL`, add one statement before the orders DELETE:
```sql
UPDATE table_floors SET current_order_id=NULL WHERE table_number IN (101..108,201..208) AND current_order_id IS NOT NULL;
```
Then I manually clear the current residue in FK-safe order (4 orders after nulling ptrs → 8 tables → 3 sessions → 3 locations → neutralize-or-delete 3 FG_ staff), re-run F with full output capture → expect 35/35, then continue O→K→P1–P8.
*Touch: 1 frozen-file line (teardown only, zero check logic) + one manual residue clear with the exact ID list above.*

**Option 2 — no file change; manual residue clear only.** I clear the residue (same FK-safe sequence), then re-run F **as-is** — it will pass all 30 functional checks and crash at teardown again (same FK), leaving the same residue each run. Not viable for a green reflow; listed for completeness.

**Option 3 — leave F as-is, run remaining 11 gates now with residue in place.** Not recommended: pool=12/staff=64 will skew any absolute-count checks in later gates and makes P9-gate re-run red. (If you want it anyway, I'll flag every deviation caused by the 15 known rows.)

**Option 4 — full stop:** nothing else runs tonight; you review in the morning.

Whatever you pick, the residue clear (whenever it happens) will be: exact-ID list above, FK-safe order (null ptrs → orders → table_floors → sessions → staff_locations → staff), trigger-guarded staff op, post-assert `pool=9, staff=53, tables 101-208=0, FG_ sessions=0`, logged line-by-line in the morning report.

## 5b. DECISION (user, 2026-09-18 ~01:10): **Option 4 — FULL STOP**

Ratified freeze for the night:
- ❌ frozen F gate file: NO modification (any line)
- ❌ manual DB residue: NO deletion
- ❌ remaining 11 gates: NOT run over the residue
- ❌ commit/push: none
- ❌ M6 FK: NOT rolled back
- ✅ all checkpoint/evidence preserved

**Framing (user):** this is not a test fix — it is a **contract conflict** between the ratified M6 decision (`table_floors.current_order_id → orders` RESTRICT) and the frozen F gate's `CLEANUP_SQL` cleanup contract. Frozen backend + frozen gate + new FK behavior must be reconciled as a decision unit.

**Morning plan (user-set):** code-level joint review of (1) F gate's actual `CLEANUP_SQL`, (2) `table_floors`/`orders` FK surface, (3) the frozen F contract — then either a safe solution that does NOT touch the gate contract, or a separate ratified correction cycle.

**Frozen-state verification (read-only, ~01:10, post-decision):** f_orders=4, f_tables=8, fg_staff_active=3, fg_sessions=3, fg_locations=3, archive_guard='O', pool=12, staff_total=64, M6 FK present=1. Git HEAD still `6d7a883e` (P-8 freeze) — P-9 work uncommitted by design.

## 6. What remains after your GO

1. F fix/clear + F re-run (full capture) → 35/35
2. O (`O_ROUTE=artifacts/saito-admin/src/app/api/orders/route.ts`) → 38/38
3. K-L3 → 8/8, K-L4 → 16/16
4. P1→P8 (P7: `P7_ALL=1`, P8: `P8_ALL=1`) → 29/13/25/19/10/15/16/2P+6EC
5. P9 FREEZE report (your template) + HANDOVER update + diary/memory
6. git commit + push (all P-9 artifacts: 8 migrations + rollbacks, plan+audit docs, `.p9-gate.cjs`, `.p9-audit/`, this checkpoint)
7. Final `P-9 FINAL` block in your exact template

## 7. Notes for the morning audit

- DB session: `current_user=postgres` verified by G.0 on every gate run; the transient `authenticated` anomaly (pooler) is guarded in all DDL/privilege ops (`SET ROLE postgres`) and in gate teardown.
- Dev server: `next-server` PID 17006, log `/private/tmp/saito-dev.log` (root=307 healthy).
- A-gate note: `.a-regression.cjs` is the purge root-cause proof (D-8 incident regression) — 39/39 post-M7 = purge did not break the auth/override surface.
- `.psql_history`/tmp scratch: `/tmp/p9repro.cjs` (repro script, deletable), `/tmp/p9logmark` (log offset marker).
- No git work done yet (task 85 pending your GO on F).
