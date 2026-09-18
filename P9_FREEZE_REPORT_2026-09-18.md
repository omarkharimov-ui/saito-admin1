# P-9 FREEZE REPORT — Schema Normalization (2026-09-18)

**Status: FROZEN.** Base commit `6d7a883e` (P-8 freeze). All M-phases applied live, all 14 frozen
gates + P-9 gate re-run GREEN, zero residue, red lines intact.

## 1. Scope (ratified 2026-09-17)

Final Supabase schema normalization, out-of-P-8 per the user's scope boundary:
settings decomposition, duplicate/legacy columns, dead tables, FK cleanup, staff-fixture purge.
Evidence chain: `P9_SCHEMA_AUDIT_2026-09-17.md` (9 targeted read-only audits) →
`P9_IMPLEMENTATION_PLAN_2026-09-17.md` (M0–M7 plan + decision matrix, ratified) →
`P9_NIGHT_CHECKPOINT_2026-09-18.md` (night status) → `P9_F_CORRECTION_REVIEW_2026-09-18.md`
(F conflict review, GO issued).

## 2. Migrations applied (8, each: preflight → ratify → apply → verify; rollback file per each)

| # | File | Effect |
|---|------|--------|
| M1a | `20260918000001_p9_rls_grant_pass.sql` | RLS policy/GRANT normalization pass |
| M2 | `20260918000002_p9_settings_views.sql` | settings views (decomposition) |
| M3 | `20260918000003_p9_app_settings_cleanup.sql` | app_settings dead columns/rows cleanup |
| M4 | `20260918000004_p9_orders_items_drop.sql` | legacy duplicate column drop (orders_items) |
| M5 | `20260918000005_p9_dead_tables_archive.sql` | dead tables: `CREATE TABLE p9_archive_<t> AS SELECT *` then DROP (17 `p9_archive_%` tables live); drops incl. `audit_log` (dead since 08-27, mirror trigger removed first) |
| M6 | `20260918000006_p9_safe_fks.sql` | **10 safe FKs** added: 7 CASCADE / 6 SET-NULL-class / **1 RESTRICT** = `p9_fk_table_floors_current_order_id` (`table_floors.current_order_id → orders`, `ON DELETE RESTRICT` — the M6 contract FK) |
| M7 | `20260918000007_p9_staff_fixture_purge.sql` | staff fixture purge (F-contract: neutralize, never delete) |
| M1b | `20260918000008_p9_m1_rpi_auth_revoke.sql` | M1 remainder: residual `public`/anon auth-surface revokes |

## 3. P-9 gate (`.p9-gate.cjs`, NEW this phase) — **25/25 PASS**

Final run `.p9-audit/reflow/p9-gate_2026-09-18d.log`:
`P-9 GATE SUMMARY: PASS=25  CONFLICT=0  REAL-RISK=0  HARNESS=0`.

S5.4 refinement (GO-2, ratified 2026-09-18) — staff-surface invariants:
- **S5.4a** 53-ID DENY53 denylist fully present live (`in_db = 53`);
- **S5.4b** 0 active / `status='ACTIVE'` / pinned rows **outside** the denylist;
- **S5.4c** every non-denylist row is fixture-styled (`^[A-Za-z0-9]+(_[A-Za-z0-9]+)+`);
- **S5.4d** active pool exactly 9.

## 4. Ratified 12-step reflow — FULL GREEN (2026-09-18, all logs in `.p9-audit/reflow/`)

| Step | Gate | Verdict (verbatim log line) | Log |
|------|------|------------------------------|-----|
| post-M7 | A (`.a-regression.cjs`) | 39/39 (report JSON, 00:59) | `.a-regression-report.json` |
| post-M7 | E/S (`.es-gate.cjs`) | 54/54 (report JSON, 01:01) | `.es-gate-report.json` |
| 3 | F (`.f-gate.cjs`, Option A) | `TOTAL 35 \| PASS 35 \| FAIL 0` + Z1–Z5 ALL GREEN | `f-gate_2026-09-18.log` |
| 6 | P-9 gate | `PASS=25 CONFLICT=0 REAL-RISK=0 HARNESS=0` | `p9-gate_2026-09-18d.log` |
| 7 | O (`.o-gate.cjs`, O-A+O-B) | `===== O GATE: 38/38 PASS =====` | `o-gate_2026-09-18b.log` |
| 8 | K-L3 (`.k-l3-probe.cjs`) | `8/8 L3 checks passed` | `k-l3_2026-09-18.log` |
| 9 | K-L4 (`.k-l4-probe.cjs`, K4-A) | `16/16 L4 checks passed` | `k-l4_2026-09-18b.log` |
| 10 | P-1 | `==== P-1 GATE: 29/29 PASS ====` | `p1_2026-09-18.log` |
| 10 | P-2 | `===== P2 STATE GATE: 13/13 PASS =====` | `p2_2026-09-18.log` |
| 10 | P-3 | `===== P3 GATE: 25/25 PASS =====` | `p3_2026-09-18.log` |
| 10 | P-4 | `==== P-4 GATE: 19/19 PASS (ALL GREEN) ====` (re-run after P4-06 infra flake — see §6.2) | `p4_2026-09-18b.log` |
| 10 | P-5 | `==== P-5 GATE: 10/10 PASS (ALL GREEN) ====` | `p5_2026-09-18.log` |
| 10 | P-6 | `==== P-6 GATE: 15/15 PASS (ALL GREEN) ====` | `p6_2026-09-18.log` |
| 10 | P-7 | `PASS=9 EXPECTED-CONFLICT=7 REAL-RISK=0 HARNESS-FAILURE=0` (16/16) | `p7_2026-09-18.log` |
| 10 | P-8 | `PASS=2 EXPECTED-CONFLICT=6 REAL-RISK=0 HARNESS-FAILURE=0` (8/8, zero-residue) | `p8_2026-09-18.log` |

Step 4 (post-F read-only assertions) and step 11 (this freeze) covered by §7 and this document.

## 5. Teardown-only corrections (each with its own ratified GO — NO assertion/check changes)

| Fix | File | Diff | GO |
|-----|------|------|----|
| **Option A** — M6 FK vs frozen F cleanup order: delete `table_floors` **before** `orders` in `CLEANUP_SQL` (2-line swap) | `.f-gate.cjs` | 2 lines changed (1+/1−) | F GO-1 (2026-09-18) |
| **O-A** — same class in O cleanup (swap L39/40) · **O-B** — pointer-null `UPDATE table_floors SET current_order_id=NULL WHERE table_number=312` above the inline QR delete | `.o-gate.cjs` | 2+/1− | O GO (2026-09-18) |
| **K4-A** — 1-line pointer-null in `cleanTable()` (DELETE orders while pointer live; plain reorder blocked by `trg_table_release_guard` `TABLE_OPEN_ORDERS`) | `.k-l4-probe.cjs` | 1+ | K-L4 GO (2026-09-18) |

Root cause (all three): M6's ratified `ON DELETE RESTRICT` FK vs pre-M6 frozen teardown order.
Trigger-source evidence in `P9_F_CORRECTION_REVIEW_2026-09-18.md`. Crash residues of F and O were
self-cleared by each gate's own next-run START cleanup — **no manual DB deletes, ever**.

## 6. Harness calibration notes (logged — gates GREEN as-is, no file touched)

1. **P-9 gate (own phase, GO-2 scope):** S5.4c regex widened to `^[A-Za-z0-9]+(_[A-Za-z0-9]+)+`
   (lowercase fixture prefixes like `G2mu60jfp4_*`), S5.1 parenthesization fix, and the self-heal /
   T.1 `LIKE 'P9GATE\_%'` escape fixed from 4 raw backslashes (dead) to 2 (correct in a JS
   template literal). Two logged calibrations → `p9-gate_2026-09-18d.log` 25/25.
2. **P-8 stale cleanup line (frozen file, NOT touched):** `.p8-gate.cjs` L167
   `DELETE FROM audit_log …` now errors `relation "audit_log" does not exist` — M5 archived +
   dropped that table. Verified: it is the **only** P-8 cleanup statement referencing a dropped
   table (all other statements `cleanup ok` in today's run); post-cleanup residue
   `drawer_sessions=0/drawer_log=0/shifts=0/breaks=0/tce=0/orders=0/idem=0/legacy=0`; the gate
   verdict is `process.exitCode=(RISK>0)?1:0` → 0 (cleanup logs are informational, residue check
   is the assertion). **Optional micro-fix** (delete the 1 dead line) requires its own GO per the
   frozen-file red line — deferred, no action.

## 7. Live invariants (read-only sweep, 2026-09-18, verbatim psql output)

```
M6_RESTRICT_FK=1                -- table_floors.current_order_id -> orders, confdeltype='r'
M6_FK_ALL_DELTYPES=r
ORDERS_TRIGGERS=trg_order_table_location:O,trg_orders_sync_table_floors:O
ARCHIVE_GUARD=O
STALE_POINTERS=0                -- no table_floors pointer to a non-live order
LIVE_POINTERS=0                 -- idle DB: no open orders on tables
P9GATE_ROWS=0                   -- 0 P9GATE_% harness residue
P9_ARCHIVE_TABLES=17            -- M5 archive copies retained
STAFF_TOTAL=133                 -- 9 real + 124 inert fixture rows (F-contract accumulation)
STAFF_ACTIVE=9
in_deny53=4                     -- the 4 active underscore-named staff are DENY53 real staff
active_not_in_deny53=0          -- 0 active outside the 53-ID denylist (S5.4b live re-check)
```

## 8. Residuals (frozen, documented — do not silently fix)

- Legacy drift: the 274/54/13/4 paid-without-record rows + the 4 `refund_amount>paid_amount`
  legacy rows (all pre-2026-09-09; D-5 NO-backfill ratified in P-5/P-6) — data, not schema;
  carried as P-9 residual, forward contract airtight.
- 12,900.00₼ misattributed fixture amount on cash session `4d5aa595` (closed clean) — P-8
  residual; attribution repair needs its own scoped decision.
- 17 `p9_archive_%` tables: pre-drop copies; safe to DROP after a retention window — separate GO.
- Inert fixture accumulation (`staff_total` grows per gate run; pool pinned at 9) — by F-contract
  design; bounded by P-9 gate S5.4b/c/d.

## 9. Red-line compliance (ratified 2026-09-18 — all held)

1. M6 FK stays `ON DELETE RESTRICT` — verified live (§7).
2. No manual DB residue deletion — every crash residue self-cleared by a gate's own START cleanup.
3. No migration/app/trigger/view/RLS changes during the reflow — reflow diff = the 3 teardown
   lines above + `.p9-gate.cjs` (P-9's own gate, GO-2) + report JSONs.
4. No frozen-gate assertion/check changes — corrections are teardown-only, each with a separate GO.
5. No git commit before full reflow green — this commit is step 12.

## 10. Next

P-9 FROZEN. Backlog unchanged (HANDOVER §5.5): **P-10** external processor/webhook, **P-11**
failed-payment recovery, **P-12** close-out. Optional: P-8 dead-line micro-fix (§6.2) under its
own GO. Dev server + live DB left in idle-clean state (0 live pointers, archive guard O).
