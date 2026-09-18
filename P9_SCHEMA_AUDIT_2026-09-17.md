# P-9 SCHEMA AUDIT — read-only (2026-09-17)

> **GO boundary (user, 2026-09-17):** P-9.1 read-only audit → P-9.2 inventory → P-9.3 invariant/
> ratification matrix → P-9.4 decision matrix → **STOP**. No DROP/ALTER/DELETE anywhere in this
> document's production. Every statement executed was SELECT / pg_dump --schema-only / grep.
> Evidence: `.p9-audit/` (p9_schema_dump.sql 35,099 lines, p9_1…p9_6_*.txt).

---

## 0. P-9.2 FULL INVENTORY (summary)

| Metric | Value | Source |
|---|---|---|
| Public tables | **122** | pg_class relkind='r' |
| Foreign keys | **182** | p9_3_fks.txt (complete list) |
| `_id` columns WITHOUT an FK | **91** | comm-diff vs FK list (§3.E) |
| Functions | **632** (331 SECURITY DEFINER) | pg_proc |
| Views / matviews | 15 / 0 | pg_class |
| Active triggers (non-constraint) | 55 | p9_6_triggers.txt (complete list) |
| Tables with RLS OFF | **15** | §3.D |
| Audit stores | 3 (67 / 369 / 818 rows) | §3.C |
| Staff rows | 1,108 (39 active / 1,069 inactive) | §3.F |
| Schema dump | `.p9-audit/p9_schema_dump.sql` (authoritative, full DDL) | pg_dump -s |

## 1. P-9.1 NINE TARGETED AREAS — findings

### 1.1 `settings` decomposition
- **1 row, 56 columns** (`p9_1_settings_dups.txt`). Domains mixed in one row:
  business identity (8), hours (4), delivery/QR (3), receipt (7), printer (7),
  cash-close (2 — **FROZEN-BOUND: P-8 DB functions read `cash_close_variance_threshold` /
  `cash_close_manager_required`**), VAT (3), loyalty (4 — engine reads them), AI (2),
  limits/timeouts (6).
- **`app_settings`** (key/value) is **0 rows** in key/value BUT carries **4 typed columns that
  duplicate `settings` 1:1** (`receipt_staff_name`, `receipt_payment_method`,
  `cash_close_variance_threshold`, `cash_close_manager_required`) — dead duplicate design.
  3 app routes reference it (settings/geo, staff/geo-config, staff/me) → the LIVE use is the
  key/value geo config; the 4 typed columns are unused duplication.

### 1.2 Duplicate columns / legacy fields
- `orders.items` (jsonb) — legacy column from pre-itemization (old roadmap #1). No route reads
  `orders.items` as the item store (orders route uses `order_items`).
- `table_floors` snapshot: `total_amount, order_count, order_ids (array), has_pending,
  reservation_id/name/time, opened_at, last_activity_at` — **maintained by FROZEN trigger
  `trg_orders_sync_table_floors`** → FROZEN-BOUND cache, not SSOT.
- `waiter_assignments.total_amount/tip_amount` — duplicates order money (table is DEAD, §1.3).
- `cash_registers` mixes `location text` + `location_id uuid` (dual model).

### 1.3 Legacy / dead tables (exact rows, app refs, writers)
| Table | Rows | App refs | DB writer | Last write | Verdict |
|---|---|---|---|---|---|
| `cash_drawer_logs` | 2 (1 original 350₼ + 1 P-8-gate) | **0** | **P-8 frozen fn** (bound-shift close) | 09-17 (gate) | FROZEN-BOUND, keep + fix grants |
| `cash_registers` | 3 | 1 (staff/assignments) | legacy | 09-11 | FROZEN-BOUND (sessions.register_id FK), keep + fix grants |
| `daily_reports` | 0 | 1 (finance/close-day) | **F frozen close-day** | — | FROZEN-BOUND, keep |
| `clock_events` | 0 | 3 (close-day, stats, UI) | legacy clock | 07/08 era | F-bound via close-day, keep (verify read) |
| `waiter_assignments` | 18 | **0** | none | 08 era | **DEAD** |
| `popular_queries` | 10 | **0** | AI db-function (verify) | recent | probably LIVE-via-fn |
| `sync_operations` | 2 | **0** | none | 09-11 | **STUB** (Q8) |
| `reservations_archive` | 18 | — | archive trigger | 09-05 | archive-by-design, keep |
| `reservation_tables_quarantine_2026_09` | 8 | — | one-off | 09-05 | quarantine, keep (read-only) |
| `manager_overrides` | 0 | — | **A frozen gate O-tests** | — | FROZEN-BOUND, keep |
| `organizations` | 1 | — | — | 07-26 | multi-tenant root, keep |
| `dining_groups` | 0 | — | — | — | **LIVE/FROZEN-BOUND** (M5-R2 correction 2026-09-17: `merge_tables_v4` INSERTs it; FK `orders_group_id_fkey` validated; 0 rows = merge never exercised) |
| `price_overrides` | 3 | 1 (orders/discount) | live | 09-11 | LIVE, keep (FK gap §3.E) |
| `staff_documents` | 4 | 1 (documents) | live | 08 era | LIVE thin, keep |
| `campaign_usage` | 15 | — | engine | 09-11 | LIVE, keep |

### 1.4 FK map + FK-less relations
- 182 FKs (complete: `p9_3_fks.txt`). Notable legacy couplings:
  `cash_drawer_sessions.register_id → cash_registers.id` (P-8 ↔ legacy model).
- **91 `_id` columns have NO FK** — three classes:
  - **Intentional (keep)**: polymorphic (`entity_id`, `record_id`, `target_id`, `source_id`),
    correlation/trace (`correlation_id`, `device_id`, `terminal_id`, `transaction_id`,
    `split_group_id`, `merge_group_id`, `combo_group_id`), provider refs
    (`provider_transaction_id`), views' ids.
  - **Safe-to-add candidates (nullable, low blast)**: `current_stock.ingredient_id`,
    `expenses.staff_id`, `order_items.variant_id`, `reservations.floor_id`,
    `table_floors.current_order_id`, `payments.refund_of_payment_id`,
    `price_overrides.order_item_id/product_id`, `staff_metrics.staff_id`,
    `staff_stats.staff_id`, `labor_summaries.staff_id`, `login_attempts.staff_id`,
    `notification_read_state.user_id`, `combos.category_id`,
    `recipe_items.ingredient_id/product_id`, `cash_drawer_log.order_id`,
    `order_payments.reference_order_id` (full list in p9_3 workdir).
  - **Intentionally soft (document, do not FK)**: `waiter_assignments.table_id` (dead table),
    `dining_groups.primary_order_id`, `inventory_logs.*_line_id` (cross-module soft refs).

### 1.5 RLS OFF + grants (15 tables)
| Table | anon | authenticated | service | Notes |
|---|---|---|---|---|
| **`cash_drawer_logs`** | **FULL CRUD + TRUNCATE** | FULL CRUD + TRUNCATE | FULL | **critical** — legacy money table world-writable |
| **`cash_registers`** | **FULL CRUD + TRUNCATE** | FULL CRUD + TRUNCATE | FULL | **critical** — same |
| `app_settings` | SELECT | FULL CRUD | FULL | dead dup columns exposed |
| `expenses` | SELECT | FULL CRUD | FULL | money data |
| `gift_cards` | SELECT | FULL CRUD | FULL | Q3 area |
| `delivery_zones` | SELECT | FULL CRUD | FULL | |
| `kitchen_analytics` | SELECT | FULL CRUD | FULL | |
| `loyalty_product_rules` | SELECT | FULL CRUD (no test role) | FULL | Q2 area |
| `order_counters` | SELECT | FULL CRUD | FULL | |
| `payment_attempts` | SELECT | FULL CRUD | FULL | payment metadata |
| `payment_idempotency_keys` | SELECT | FULL CRUD | FULL | P-4 pattern table, no anon write |
| `payroll_webhook_configs` | SELECT | FULL CRUD | FULL | credentials config! |
| `staff_metrics` | SELECT | FULL CRUD | FULL | |
| `reservation_preorder_items` | SELECT | (none) | FULL | **3 policies exist but RLS OFF = inactive** |
| `migrations`/quarantine | — | — | — | housekeeping |

Plus P-8-carried (RLS ON but `{public}`-ALL policies): `overtime_records`, `schedule`,
`shift_breaks`, `shift_swap_requests`. **`test_rls_role`** (P-2 test artifact) still holds
grants on ~11 tables.

### 1.6 Duplicate audit models
| Store | Rows | Span | Writers | Readers | State |
|---|---|---|---|---|---|
| `audit_log` (trigger-based) | 67 | 07-26 → **08-27 (DEAD 21d)** | legacy app code (gone) + dormant `trg_audit_log_mirror` | old | **dead store, live dormant trigger** |
| `audit_logs` (polymorphic) | 369 | 07-04 → 09-17 | app code (compat layer) | reports? | active compat |
| `audit_logs_canonical` | 818 | 08-26 → 09-17 | **`log_audit()` (all P-1..P-8 fns)** | P-9.3 ref | **SSOT since P-1** |

### 1.7 Staff bloat
- **1,108 rows: 39 active / 1,069 inactive.** Name prefixes prove origin: `P4`=196,
  `A`=135, `P6`=78, `OG`=73, `P5`=72, `FG`=69, `P7`=65, `L3`=63, `G7`=42, `L4`=42,
  `KQ`=32, `K3/L2`=10, `P8`=9, `L5/GD`=6, `G2mt*`≈35×5 — **~1,050 = gate fixtures from
  P-1..P-8 runs**; the rest = early dev/real (44 real-looking + OG/L-series).
- Root-cause linkage: `login_preflight` candidate pool = **56 active-with-valid-hash** rows →
  this is exactly what broke the A gate in the P-8 reflow (O-1/C-2 residue incident).
- Cleanup behavior: every gate deactivates (not deletes — `trg_staff_prevent_delete`) most
  fixtures; **A gate deactivates only 3 of N** (known weakness); several older gates left
  fixtures active (the 56-row pool).

### 1.8 The 12,900.00₼ residual — FULLY EXPLAINED
Session `4d5aa595` (legacy 09-11 fixture, opened 50.00): **138 payment rows summing exactly
12,900.00**, span **09-12 16:01 → 09-15 09:05** = the P-3/P-4/P-5/P-6/P-7 gate runs (each cash
pay = 100₼/40₼ fixture). P-8 closed it at `expected = 12,950.00` (50 + 12,900), diff 0.
→ **Ledger is consistent; the amount is gate-test origin.** The orders were cleaned by gates;
ledger rows remain by design (append-only, P-8 frozen).

### 1.9 P-8 preserved facts — re-verified LIVE
| # | Fact | Check | Result |
|---|---|---|---|
| F1 | ledger SSOT types (10 incl. refund/void/reopen) | type_check constraint | ✅ exact |
| F2 | idem table FK-less (0 FKs) | pg_constraint | ✅ 0 |
| F3 | `emit_outbox_event` COALESCE | prosrc | ✅ true |
| F4 | replay-before-'already closed' | position() check | ✅ true |
| F5 | 0 open sessions / 0 open shifts | counts | ✅ 0/0 |

## 2. P-9.3 INVARIANT + RATIFICATION MATRIX

Class: **FB** = frozen-bound (P-1..P-8 gate/contract reference — schema may not break),
**LIVE** = app route uses it, **LEG** = superseded but rows/writer remain, **DEAD** = 0 refs.

| Object | Class | Evidence | P-9 may |
|---|---|---|---|
| settings (56 cols) | FB (cash_close_* 2 cols) + LIVE | P-8 DB fns read 2 cols; 8+ routes read rest | decompose non-frozen cols only |
| app_settings | LIVE (geo kv) + LEG (4 dup cols) | 3 routes; 0 kv rows w/ dup cols | drop 4 dup cols (verify 0 reads) |
| cash_drawer_logs | FB (P-8 writer) + grants hole | P-8 close v2 inserts | grants/RLS fix only |
| cash_registers | FB (sessions FK) + grants hole | FK + 1 route | grants fix only |
| daily_reports / clock_events | FB (F close-day) | close-day refs | keep |
| manager_overrides | FB (A O-tests) | A gate | keep |
| orders.items jsonb | LEG (verify 0 readers) | no route read | drop candidate |
| table_floors snapshot | FB (trg_orders_sync_table_floors) | trigger | keep, document as cache |
| waiter_assignments | DEAD | 0 refs, 18 rows | archive + drop candidate |
| sync_operations | STUB (Q8) | 0 refs, 2 rows | keep (Q8) or archive |
| popular_queries | LIVE-via-fn (verify writer) | AI fn | keep |
| audit_log + mirror trigger | DEAD (21d) | 67 rows, no writer | archive + drop trigger candidate |
| audit_logs | LIVE compat | app writes | keep or merge (verify readers) |
| audit_logs_canonical | FB (all P-* log_audit) | 818 rows | **SSOT — never touch** |
| 91 FK-less cols | mixed | §1.4 | add safe FKs (per-row) |
| 15 RLS-off tables | security surface | §1.5 | RLS/grant pass |
| {public}-ALL ×4 (P-8 carry) | security surface | P-8 report | RLS pass |
| test_rls_role grants | LEG test artifact | ~11 tables | revoke candidate |
| staff fixtures (~1,050) | LEG (inactive) | prefix analysis | purge w/ FK preflight candidate |
| 12,900₼ ledger rows | FB (immutability) | §1.8 | **NO data change — document only** |
| dining_groups | ~~DEAD-candidate~~ **LIVE/FROZEN-BOUND** (M5-R2 corr.) | 0 rows; `merge_tables_v4` (FROZEN V2) INSERTs it; validated FK `orders_group_id_fkey`; `unmerge_tables_v4`/`undo_operation_v4` UPDATE `orders.group_id`; `complete_payment_v4` reads | **KEPT** (excluded from M5) — M0 E3 pg_class-only filter missed the pg_constraint FK |

## 3. P-9.4 DECISION MATRIX — awaiting per-row ratification (STOP)

| ID | Action (proposed) | Risk | Blast radius | Notes |
|---|---|---|---|---|
| **D-1** | **RLS/grant pass (security)**: revoke anon+authenticated+test_rls_role from the 15 RLS-off tables (service-only except documented public catalogs); enable RLS on `reservation_preorder_items` (3 policies exist — flip ON); add location/org-scoped policies for `overtime_records`, `schedule`, `shift_breaks`, `shift_swap_requests` | LOW (no schema change, revoke only) | auth surface | `expenses`/`payment_methods`/`delivery_zones` public-catalog semantics need 1 decision each (public SELECT ok?) |
| **D-2** | **settings decomposition**: create domain tables (`settings_receipt`, `settings_printer`, `settings_vat`, `settings_loyalty`, `settings_hours`, `settings_ai_limits`) OR keep `settings` + read-views; the 2 FROZEN cols stay where DB fns read them (or a compat view named `settings`) | MED | 8+ settings routes | non-destructive option = views only (zero risk) — RECOMMENDED first step; physical split only if user wants |
| **D-3** | **Drop 4 duplicate `app_settings` typed columns** (verify 0 reads first) | LOW | 3 geo routes (kv only) | keep kv |
| **D-4** | **`orders.items` legacy column**: verify 0 readers/triggers → drop (or keep as archive) | LOW-MED | order surface | frozen O/P-3 gate does NOT reference it (verify in matrix run) |
| **D-5** | **`waiter_assignments`** (narrowed, M5-R2): archive 18 rows → drop. ~~`dining_groups`~~ EXCLUDED — proven LIVE/FROZEN-BOUND (see findings table) | LOW | none | 18 rows (waiter_assignments only) |
| **D-6** | **`audit_log` + `trg_audit_log_mirror`**: archive 67 rows → drop table + dormant trigger | LOW | old reports (verify readers) | canonical stays SSOT |
| **D-7** | **Safe FK additions** (ratified 14; applied 2026-09-17 as **10 new** — M6-R1: 4 of 14 were views/already-FK'd: `staff_stats`/`labor_summaries`/`current_stock` are relkind=v views, `staff_metrics_staff_id_fkey` pre-existed) | LOW-MED | per-table backfill check | all 10 RESTRICT, `p9_fk_*` named, orphan=0 re-verified live; 2 pre-existing CASCADE rules left untouched (observation) |
| **D-8** | **Staff fixture purge**: delete inactive staff with gate prefixes (P\d_*, A_RT_*, ES_*, F*_*, K*_*, L*_*, G*_*, OG_*, P8_*) after per-table FK residue check (shifts/sessions/entries…) | MED | login_preflight pool 56→~8 (fixes A-gate root cause) | requires FK-residue sweep first; real 39 active untouched |
| **D-9** | **`test_rls_role`**: revoke all grants (P-2 artifact) | LOW | P-2 gate reflow (uses role!) | **P-2 gate references test_rls_role → reflow impact; coordinate or keep role, revoke table grants only** |
| **D-10** | **12,900₼**: NO action — document as accepted test-origin residue (ledger immutable) | none | — | ratify the "accept" itself |
| **D-11** | **A-gate cleanup weakness** (3-of-N): separate ratification — it is a frozen-gate code change | — | A gate | out of P-9 DB scope; its own mini-phase if GO |
| **D-12** | **New-feature-before-P-9 question** (user's explicit ask): **NOT required for frozen-core safety** — no pending feature edits frozen schema. BUT if Q2 (loyalty tiers) / Q3 (gift cards) are GO'd, their new tables should land BEFORE D-1..D-8 execute, so P-9 normalizes them in one pass. Decision needed: (a) GO Q2/Q3 feature phase first, or (b) P-9 now with those areas EXCLUDED from D-1/D-2 | — | phasing only | my recommendation: **(b) P-9 now, exclude loyalty_*/gift_card_*/waitlist from RLS pass + settings decomposition; D-8 purge + D-1 security pass proceed** |

**STOP ⛔ — no implementation. Each row D-1..D-12 awaits your per-row ratification (GO / NO-GO /
modify). After ratification: P-9 implementation plan (migrations, ordering, gate design,
reflow list) — then GO → implement → gate → full frozen reflow → FREEZE.**
