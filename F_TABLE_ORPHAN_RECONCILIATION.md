# F — Table Orphan Reconciliation (11–30) — F-04 DATA DECISION DOC

**Date:** 2026-09-11 · **Scope:** historical orphan orders · **Action:** DOCUMENT (NOT auto-delete), per frozen F-04 ("11–30 orphan history quarantine/reconciliation, silmək yoxdur; owner verifies").

## What was found (real DB, `jbxmlnsicbfkbsatnoej`)
- **68 orders** reference `table_number` in **{11, 12, 13, 19, 24, 27, 28, 29, 30}** which have **no `table_floors` row**.
- All 68 are **closed** (`still_open = 0`); financial history intact (total_amount, items, payments preserved on the orders).
- Date range: **2026-03 → 2026-09-01**.
- The tables that DO exist: **1–10, 14–18** (15 rows, all in location `f1f830b3`).

## Root cause (evidence-backed)
The **old floor-plan editor** (`/api/pos/floors` POST, pre-F-04) did **hard `DELETE` + re-`INSERT`** of every table not in the new floor plan. When tables 11–30 were removed/renumbered from the plan, their `table_floors` rows were **deleted**, orphaning the 68 historical orders that still point at those numbers. This is exactly the class of bug F-04 now prevents.

## F-04 fix (prevents recurrence)
- Tables are **never hard-deleted**: `trg_table_archive_guard` (BEFORE DELETE) RAISEs `TABLE_ARCHIVE_ONLY` on any DELETE (app, raw SQL, or service-role REST). The only path is **archive** (`is_archived`).
- The floor editor (`/api/pos/floors` POST) was rewritten: absent-from-plan tables are **ARCHIVED** (soft), present tables are **UPSERTed** (no delete+insert). Row identity + all historical `orders.table_number` references are preserved.
- An archived table: cannot take a new order (`trg_order_table_archive_guard`), cannot be used/merged/changed (`trg_table_archived_immutable`), and its `(location_id, table_number)` stays occupied so the number is never silently reused.

## Reconciliation for the 68 orphans (owner action — NOT auto-run)
These 68 orders are **valid financial history** and are **kept** (not deleted). For clean floor/reporting going forward, the owner should choose ONE:
1. **Leave as-is** (recommended): the orders remain valid history referencing numbers 11–30; the floor map simply has no rows for those (they were removed from the plan). No data loss; reports by `table_number` still work.
2. **Re-create the tables** (if 11–30 are real tables again): add them back in the floor editor (now archive-safe) so the history joins to a live table row.
3. **Map to canonical numbers** (if 11–30 were renumbered): a **deliberate, logged** `UPDATE orders SET table_number=<new> WHERE table_number IN (11,12,13,19,24,27,28,29,30)` — requires the owner to confirm the old→new number mapping.

> **No automatic deletion or renumbering was performed.** All 68 orders + their items/payments are intact.

## Related quarantined data (this F session, for the record)
- `reservation_tables_quarantine_2026_09` (F-03): 8 dead rows (missing reservation **and** missing table 200–209; both FKs already broken). Quarantined, not deleted.
- 3 pre-existing stale `current_order_id` pointers (F-05): **repaired** (recomputed to canonical live order / NULL).
- 3 pre-existing abandoned `cash_drawer_sessions` with NULL `opened_by` (E/S freeze, 2 still OPEN, real money): **not auto-closed** — finance reconciliation.

**Verification owner:** Manager/Owner — confirm option 1/2/3 for the 68 orphans and the 8 quarantined reservation rows before the final freeze audit.
