# P-9 IMPLEMENTATION PLAN — awaiting implementation GO (2026-09-17)

> **Status:** ratification received (D-1..D-12, per-row conditions applied). **Implementation
> GO = NOT YET GIVEN.** This document is the plan for that GO. Everything below is design;
> nothing has been applied. All preflight evidence is READ-ONLY and in `.p9-audit/`
> (`p9_preflight*.sql` + outputs, `p9_schema_dump.sql`, `p9_*.txt`).

## 0. Ratification as bound

| D | Verdict | Binding condition honored in this plan |
|---|---|---|
| D-1 | GO | public-catalog exceptions (`delivery_zones`, `payment_methods`, `gift_cards`) keep anon SELECT via policy; everything else service-only |
| D-2 | GO views-only | 7 read-views over `settings`; **physical split deferred** (zero table changes) |
| D-3 | GO | drop 4 `app_settings` typed cols — preflight PROVEN: pg_depend NO_DEPENDENTS + app reads only `settings` via settings-svc |
| D-4 | GO | drop `orders.items` — preflight PROVEN: pg_depend NO_DEPENDENTS + 0 route reads |
| D-5 | GO (narrowed) | `waiter_assignments` (18) → archive → drop (0 app refs; view dep fixed in M5-R1). **M5-R2 correction (2026-09-17):** `dining_groups` reclassified DEAD→**LIVE/FROZEN-BOUND** — `merge_tables_v4` (FROZEN, P-7 V2 contract) INSERTs it on every merge; validated FK `orders_group_id_fkey → dining_groups` (missed by M0 E3's pg_class-only pg_depend filter; FKs live under classid=pg_constraint). dining_groups EXCLUDED from M5 (user-ratified Option A). **Correction vs audit:** `popular_queries` is LIVE (`upsert_popular_query` writes it) → NOT in D-5; `sync_operations` kept (Q8) |
| D-6 | GO | `audit_log` (67, dead since 08-27) + dormant `trg_audit_log_mirror` → archive → drop. `audit_logs_canonical` NEVER touched; `audit_logs` (compat, active) kept |
| D-7 | GO per-FK | **14 FKs** (all orphan=0, PROVEN). Excluded: `cash_drawer_log.order_id` (154 orphans — intentional loose ledger ref), `recipe_items.product_id` (5 orphans — needs backfill decision, own row) |
| D-8 | GO guarded | **1,025** fixture staff (prefix-regex set, PROVEN residue: shifts=39, labor_summaries=39, staff_locations=88, security_events=257, login_attempts=67, sessions=1, time_clock_audit=1, everything else 0). Proven gate pattern: `DISABLE TRIGGER trg_staff_prevent_delete → DELETE → ENABLE` (P-1/P-2/P-3 gates use exactly this) |
| D-9 | MODIFY | `test_rls_role`: PROVEN 0 policies reference it (grants-only artifact) → revoke grants on the 15 tables, **keep the role**, P-2 gate has 0 refs → no P-2-specific reflow risk (P-2 still runs in the standard reflow) |
| D-10 | GO | 12,900.00₼ = documented test-origin residue; **no ledger change** |
| D-11 | NO-GO | A-gate code untouched (recorded as separate mini-phase candidate) |
| D-12 | GO | P-9 now; `loyalty_*`, `gift_card_*`, waitlist, customer-tab EXCLUDED from D-1/D-2 scope |

## 1. Migration order + dependency graph

```
M0  preflight re-run (read-only, hard-stop on any drift vs this plan's numbers)
 │
 ├── M1  security/RLS pass ............ independent, first (immediate security value)
 ├── M2  settings read-views (×7) ...... independent, additive
 │
 ├── M3  app_settings: drop 4 cols ..... after M0-proof
 ├── M4  orders: drop items jsonb ...... after M0-proof (+ archive non-null values first)
  ├── M5  dead tables: archive + drop ... after M0-proof (waiter_assignments,
  │                                      audit_log + mirror trigger).
  │                                      [M5-R2: dining_groups EXCLUDED — LIVE/FROZEN-BOUND]
  ├── M6  FK additions (10 new, M6-R1: 4 of 14 were views/already-FK'd)
  │                                       after M5 (clean surface), before M7 (FKs guard purge)
 │
 └── M7  staff fixture purge (3 steps) . LAST (needs M6 FKs as tripwires)
M8  test_rls_role grant revokes ........ after M1 (same grant surface)
D-10 documentation (no migration)
```

No migration touches: P-8 functions/tables (close v2, cash_drawer_log, cash_drawer_sessions,
clock/break/auto fns, idem keys), `audit_logs_canonical`, loyalty_*/gift_card_*/waitlist,
`settings` table columns, frozen triggers.

## 2. Per-migration spec

### M1 — security/RLS (`20260918000001_p9_rls_grant_pass.sql`)
| Table | anon | authenticated | service_role |
|---|---|---|---|
| cash_drawer_logs | REVOKE all | REVOKE all | keep |
| cash_registers | REVOKE all | REVOKE all | keep |
| app_settings | REVOKE | REVOKE | keep |
| expenses | REVOKE | REVOKE | keep |
| kitchen_analytics | REVOKE | REVOKE | keep |
| order_counters | REVOKE | REVOKE | keep |
| payment_attempts | REVOKE | REVOKE | keep |
| payment_idempotency_keys | REVOKE | REVOKE | keep |
| payroll_webhook_configs | REVOKE | REVOKE | keep |
| staff_metrics | REVOKE | REVOKE | keep |
| delivery_zones | **keep SELECT** (public catalog) | REVOKE (writes service-only) | keep |
| payment_methods | **keep SELECT** | REVOKE | keep |
| gift_cards | **keep SELECT** (Q3-excluded area, catalog) | REVOKE | keep |
| loyalty_product_rules | REVOKE | REVOKE (Q3-excluded area — full RLS deferred with Q2) | keep |
| reservation_preorder_items | keep SELECT | keep INSERT/UPDATE? → **REVOKE; service-only** (app writes via service RPC) | keep + **`ALTER TABLE ENABLE ROW LEVEL SECURITY`** (3 existing policies become active) |

+ 4 P-8-carried tables (`overtime_records`, `schedule`, `shift_breaks`, `shift_swap_requests`):
  add location/org-scoped SELECT policy for `authenticated` (manager+ via permission join) +
  keep service full. `{public}`-ALL replaced by scoped policy.
+ `test_rls_role`: revoke all 15-table grants (M8 executes here, same file — keep role).
**Rollback:** `p9_rls_grant_pass_rollback.sql` (pre-state grants captured in
`.p9-audit/p9_4_grants.txt` — exact inverse).

### M2 — settings views (`20260918000002_p9_settings_views.sql`)
`v_settings_business` (name/address/phone/city/timezone/currency…), `v_settings_hours`,
`v_settings_receipt`, `v_settings_printer`, `v_settings_vat`, `v_settings_loyalty`,
`v_settings_limits` — each `SELECT <domain cols> FROM settings LIMIT 1`. Zero table changes.
**Rollback:** `DROP VIEW IF EXISTS` ×7.

### M3 — app_settings columns (`20260918000003_p9_app_settings_cleanup.sql`)
`ALTER TABLE app_settings DROP COLUMN receipt_staff_name, DROP COLUMN receipt_payment_method,
DROP COLUMN cash_close_variance_threshold, DROP COLUMN cash_close_manager_required;`
**Rollback:** add 4 nullable cols (were empty; 0 kv rows affected).

### M4 — orders.items (`20260918000004_p9_orders_items_drop.sql`)
1. `CREATE TABLE p9_archive_orders_items AS SELECT id, items FROM orders WHERE items IS NOT NULL;`
2. `ALTER TABLE orders DROP COLUMN items;`
**Rollback:** restore column + re-join archive (1:1 on id).

### M5 — dead tables (`20260918000005_p9_dead_tables_archive.sql`)
- `CREATE TABLE p9_archive_waiter_assignments AS SELECT * FROM waiter_assignments;` → `DROP TABLE waiter_assignments;`
- `CREATE TABLE p9_archive_audit_log AS SELECT * FROM audit_log;` → `DROP TRIGGER trg_audit_log_mirror ON audit_log;` → `DROP TABLE audit_log;`
- ~~`dining_groups`~~ — **EXCLUDED (M5-R2, 2026-09-17):** misclassified DEAD by M0 E3; PROVEN LIVE/FROZEN-BOUND via `merge_tables_v4` (INSERT) + validated FK `orders_group_id_fkey` + `unmerge_tables_v4`/`undo_operation_v4` (UPDATE `orders.group_id`) + `complete_payment_v4` (read). Stays in place.
**M5-R1 (2026-09-17):** `staff_stats` view had a `waiter` CTE reading `waiter_assignments` (pg_rewrite dep, missed by M0 E3's pg_class filter). Recreated `staff_stats` WITHOUT the waiter CTE; its 5 waiter columns → constants (0). View column contract preserved 1:1; the two live consumers (`get_staff_directory_v2` family) read none of those 5 columns. Rollback restores the original waiter-CTE definition verbatim.
**Rollback:** `CREATE TABLE … AS SELECT * FROM p9_archive_…;` + re-create trigger (body in schema dump) + original `staff_stats`.

### M6 — FK additions (`20260918000006_p9_safe_fks.sql`) — APPLIED 2026-09-17
**M6-R1 (2026-09-17, scope correction):** plan listed 14; live re-verify proved 4
items cannot be NEW FKs → **10 new FKs applied** (all orphan=0 PROVEN live
2026-09-17, ON DELETE RESTRICT, constraint names `p9_fk_<tbl>_<col>`):
`expenses.staff_id→staff`, `order_items.variant_id→product_variants`,
`reservations.floor_id→table_floors`, `table_floors.current_order_id→orders`,
`payments.refund_of_payment_id→order_payments`, `price_overrides.order_item_id→order_items`,
`price_overrides.product_id→products`, `login_attempts.staff_id→staff`,
`notification_read_state.user_id→staff`, `combos.category_id→categories`
4 items already satisfied / N/A (verified live 2026-09-17):
- `staff_stats.staff_id` — staff_stats is a **VIEW** (relkind=v), derived per-staff
  from staff; no real relation to constrain.
- `labor_summaries.staff_id` — labor_summaries is a **VIEW** over (shifts JOIN staff);
  base relation `shifts_staff_id_fkey` ALREADY EXISTS (RESTRICT, validated).
- `current_stock.ingredient_id` — current_stock is a **VIEW** over (ingredients LEFT
  JOIN stock_transactions); base relation `stock_transactions_ingredient_id_fkey`
  ALREADY EXISTS (CASCADE, validated).
- `staff_metrics.staff_id` — `staff_metrics_staff_id_fkey` ALREADY EXISTS (CASCADE,
  validated).
**Observation (out of scope, no change ratified):** the 2 pre-existing CASCADE rules
(`staff_metrics`, `stock_transactions`) differ from M6's RESTRICT safety default;
left untouched.
**Rollback:** 10 × `DROP CONSTRAINT IF EXISTS p9_fk_*` (applied-state file).
**Open row (needs your call in plan-ratification):** `recipe_items.product_id` — 5 orphans.
Options: (a) set 5 orphans to NULL (data edit — separate approval), (b) skip. Default = **(b) skip**.

### M7 — staff fixture purge (`20260918000007_p9_staff_fixture_purge.sql`) — APPLIED 2026-09-18
**M7-R1..R4 (corrections, user-ratified):**
- **M7-R1:** 30 active fixtures carried children beyond the D-8 (1,025-only) sweep →
  13 child tables / 565 rows deleted: security_events=288, staff_locations=111,
  login_attempts=82, shifts=43, approval_requests=25, sessions=6, cash_drawer_log=4,
  cash_drawer_sessions=2, shift_breaks=2, schedule=2, time_clock_audit=7,
  time_clock_entries=6, overtime_records=1.
- **M7-R2:** time_clock_entries/overtime_records/time_clock_audit DELETED (not SET
  NULL): staff_id NOT NULL + pre-existing catalog oddity — all 7 legacy "SET NULL"
  FKs show confdeltype='a' but NO ON DELETE clause and block parent delete
  (NO ACTION behavior). Oddity left untouched (out of scope).
- **M7-R3:** cash_drawer_log deleted BEFORE cash_drawer_sessions (FK
  cash_drawer_log.session_id→cash_drawer_sessions CASCADE would silently eat rows).
- **M7-R4:** soft refs remain post-purge (append-only, 0 FK, legacy = 0 app reads):
  audit_logs_canonical.actor_id=454, operation_logs.performed_by=447,
  outbox_events.aggregate_id=1230, cash_drawer_logs.staff_id=2 (full 1,055 set).
**Hard-stop design (user-ratified 10 requirements, single DO-block/txn):** 53-ID
denylist hardcoded byte-verified; `p9_m7_fixture_ids` materialized set (1,055);
denylist∩fixture=0; staff_total=1,108; 14 archives with count asserts == preflight
constants; RESTRICT-aware 13-step order + 0-residue scan; pool 39→9; M6-FK orphan
re-check; two-way set equality (53 real intact, 9 active); trigger EXCEPTION
guards + `tgenabled<>'D'` assert; ALL asserts BEFORE any DELETE (RAISE = abort).
Dry-run caught 3 real bugs pre-apply (cascade order, NOT NULL, sessions column).
Preflight (read-only) re-ran 2026-09-18: 24/24 constants PASS → applied.
**Result:** staff 1,108→53 (9 active real), pool 39→9, staff_stats 1,108→53,
0 orphans on all staff FKs + M6's 10 FKs, dining_groups/merge_tables_v4 intact.
**Rollback:** `20260918000007_p9_staff_fixture_purge_rollback.sql` — staff + 13
children re-INSERTed from archives (FK order: staff→shifts→shift_breaks→…).
_Obsolete original 3-step spec (superseded): A neutralize 1,025; B residue
shifts/security_events/time_clock_audit; C trigger-guarded delete; post-asserts
active=39/pool 56→≤9 — counts were 1,025-only and stale._

### M8 — folded into M1 (D-9 MODIFY). No separate migration.

### D-10 — documentation only: HANDOVER P-9 block + this plan note. No DB statement.

## 3. Gate design — `.p9-gate.cjs` (NEW gate, P-pattern harness)

| # | Check | Classification |
|---|---|---|
| S1 | **RLS matrix**: each of 15+4 tables × {anon, low-priv cashier, manager} × {SELECT, INSERT} vs the M1 access map — any unexpected 200/201 = REAL-RISK | REAL-RISK on leak |
| S2 | **views equivalence**: every `v_settings_*` value == `settings` row value; all `settings/*` routes 200 unchanged | REAL-RISK on mismatch |
| S3 | **post-drop smoke**: full order fixture create→pay→refund (P-7 pattern) works after M3/M4/M5; `settings/geo` 200; one `upsert_popular_query` call works (table kept) | REAL-RISK |
| S4 | **FK tripwires**: for 3 sampled FKs (expenses.staff_id, price_overrides.product_id, reservations.floor_id): orphan INSERT → expect constraint violation; clean INSERT → ok; teardown | REAL-RISK on miss |
| S5 | **purge proof**: fixture count = 0, active real staff = 9 (was 39 incl. fixtures), preflight pool ≤ 9, 53-ID denylist intact, fresh fixture login succeeds (A-gate incident regression-proof) | REAL-RISK |
| S6 | **role state**: `test_rls_role` exists, 0 grants on the 15 tables | REAL-RISK on grant |
| S7 | **frozen-surface canary**: P-8 close v2 5-arg + idempotent replay + drawer open/close on a fixture session all behave per preserved facts (proves P-8 untouched by P-9) | REAL-RISK |
Teardown: zero-residue (own fixtures), residue() asserts 0. Env: `P9_ALL=1`.

## 4. Exact frozen reflow list (post-gate, solo, background driver, halt-on-fail)

1. `.a-regression.cjs` *(first — purge root-cause proof)*
2. `.es-gate.cjs`
3. `.f-gate.cjs`
4. `.o-gate.cjs` *(env `O_ROUTE`)*
5. `.k-l3-probe.cjs`
6. `.k-l4-probe.cjs`
7. `.p1-gate.cjs`
8. `.p2-gate.cjs`
9. `.p3-gate.cjs`
10. `.p4-gate.cjs`
11. `.p5-gate.cjs`
12. `.p6-gate.cjs`
13. `.p7-gate.cjs` *(env `P7_ALL=1`)*
14. `.p8-gate.cjs` *(env `P8_ALL=1`)*

Expected: identical tallies to the P-8 reflow (A 39/39, ES 54/54, F 35/35, O 38/38, K 8/8+16/16,
P-1 29/29, P-2 13/13, P-3 25/25, P-4 19/19, P-5 10/10, P-6 15/15, P-7 16/16, P-8 2P+6EC/0risk).
Any deviation = STOP + triage (P-9 suspect until proven env/harness).

**Reflow execution status (2026-09-18 night, 🔴 STOPPED at F — user decision pending):**
A 39/39 ✅ · ES 54/54 ✅ · **F: crash in frozen `CLEANUP_SQL`** — M6 FK
`p9_fk_table_floors_current_order_id` (RESTRICT) rejects `DELETE FROM orders` while the
gate's own fixture tables still point at them; `ON_ERROR_STOP=1` aborts the batch; Z1–Z5
never executed; A7–A10 visible PASS. Root cause 100% M6 vs pre-M6 frozen teardown order
(P-9-attributable, not env). Residue (all gate-created <2h): 4 orders (101/102/103 confirmed,
105 cancelled) + 8 table_floors (3 live ptrs, 0 stale) + FG_MGR/FG_WTR/FG_WTRB ACTIVE with
pins + 3 sessions + 3 locations → **pool=12, staff=64** until cleared. Options 1–4 + exact
residue IDs + FK-safe clear sequence: `P9_NIGHT_CHECKPOINT_2026-09-18.md` §4–5. Gates 4–14
NOT RUN (residue would contaminate count checks).
**DECISION (user, 2026-09-18 ~01:10): Option 4 — FULL STOP.** No F-gate modification, no
manual residue deletion, no further gates, no commit/push, no M6-FK rollback; evidence
preserved. Framing: ratified M6 RESTRICT FK vs frozen F `CLEANUP_SQL` = **contract conflict**,
not a test fix. Morning: code-level joint review (CLEANUP_SQL + FK surface + frozen F
contract) → either a contract-safe solution or a separate ratified correction cycle.

## 5. Explicit exclusions (binding)

- P-8 frozen surface: `close_cash_register_v2`, `open_cash_register`, `cash_in/out_atomic`,
  clock/break/auto fns, `emit_outbox_event`, `payment_idempotency_keys` schema, `cash_drawer_log`
  (incl. the 154 loose `order_id` refs — NOT to be FK'd), `settings.cash_close_*` columns.
- `audit_logs_canonical` (SSOT), `audit_logs` (compat, active writer).
- `loyalty_*`, `gift_card_*`, waitlist, customer tab field (D-12 exclusion).
- A-gate code (D-11 NO-GO).
- 12,900.00₼ ledger rows (D-10 — document only).
- `reservations_archive`, `reservation_tables_quarantine_2026_09` (archive-by-design).
- `sync_operations` (Q8 stub), `popular_queries` (LIVE), `cash_registers`/`cash_drawer_logs`
  tables (FROZEN-BOUND writers — M1 grants only, never drop), `daily_reports`/`clock_events`
  (F-bound), `manager_overrides` (A-bound).

## 6. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| M1 breaks a route relying on anon/auth access | LOW (only public catalogs kept; app uses service role) | S1 matrix + full reflow |
| M4 archive empty (orders.items all NULL) | — | archive step runs regardless; rollback available |
| M7 set over-matches (regex hits a real staff) | LOW — mitigated: 53-ID denylist hardcoded (byte-verified) + denylist∩fixture=0 assert + two-way set-equality post-assert (M7-R1..R4 applied 2026-09-18) | 14 archive tables = full restore (staff + 13 children); any assert fail = txn abort = 0 side effects |
| M6 FK blocks a live soft-delete path | LOW (RESTRICT only; orphan=0) | S4 tripwires + reflow |
| Pooler flake during big txn | MED | per-migration idempotent; re-run safe; ON_ERROR_STOP everywhere |

## 7. GO checklist (what your implementation GO authorizes)

- [ ] Apply M0..M8 in order (7 migration files + rollbacks committed)
- [ ] `.p9-gate.cjs` run → REAL-RISK=0, HARNESS=0, zero residue
- [ ] 14-gate frozen reflow → all green
- [ ] HANDOVER P-9 freeze block + commit + push
- [ ] P-9 FROZEN

**STOP ⛔ — awaiting implementation GO. No live changes since ratification; everything above
designed on read-only evidence.**
