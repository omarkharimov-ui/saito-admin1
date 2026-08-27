# MIGRATION REVIEW REPORT
## Production Safety Audit — saito-admin1
**Date:** 2026-08-28  
**Project:** saito-admin1  
**Production DB:** jbxmlnsicbfkbsatnoej  
**Reviewer:** Kilo (automated)  
**Status:** DO NOT RUN — CRITICAL ISSUES FOUND

---

## EXECUTIVE SUMMARY

**DO NOT RUN ANY MIGRATION IN PRODUCTION YET.**

The migration chain contains multiple production-breaking issues:
1. **3 migrations will FAIL** because they try to CREATE TABLE for tables that already exist with DIFFERENT schemas
2. **1 migration will FAIL** because it references a non-existent table (`shifts`) in an RPC
3. **1 RPC is missing** (`has_permission`) but API code depends on it
4. **Schema drift** exists between migration files and actual production schema
5. **Open shifts exist** (3 unclosed shifts) that could be affected by schema changes

### Overall Result: DO NOT RUN

---

## PRODUCTION DB ACTUAL STATE (VERIFIED VIA PostgREST)

### migrations table
- **10 migrations** applied (all from 2026-07-29)
- **NO Phase 1 migrations** (20260901_*) are applied despite claims
- **NO 20260902 or 20260903 migrations** are applied

### Tables verified via PostgREST API

| Table | Exists | Columns (actual) | Notes |
|-------|--------|------------------|-------|
| `staff` | ✅ | id, name, role, shift, phone, created_at, full_name, pin_hash, is_active, email, hourly_rate, role_id | Already has `pin_hash`, `role_id` |
| `admin_users` | ✅ | id, role, is_active, created_at, updated_at, pin_hash, **pin** | `pin` column still exists, all values NULL |
| `sessions` | ✅ | token, user_id, role, expires_at, created_at, **revoked_at** | Already has `revoked_at` |
| `shifts` | ✅ | id, staff_id, **report_date**, opened_at, closed_at, starting_cash, expected_cash, actual_cash, difference, notes, created_at | **NO `updated_at`**, has `report_date`, **3 open shifts** |
| `clock_events` | ✅ | id, staff_id, clock_in, clock_out | **NO `created_at`**, empty table |
| `cash_drawer_log` | ✅ | id, session_id, type, amount, description, order_id, created_by, created_at | **NO `shift_id`** |
| `cash_drawer_sessions` | ✅ | id, opened_at, closed_at, opening_balance, closing_balance, expected_balance, difference, opened_by, closed_by, status, notes, created_at, register_id, approved_by, approval_note | Has extra columns vs migration |
| `roles` | ✅ | id, name, is_system, created_at | |
| `permissions` | ✅ | key, description | **NO `category` column** |
| `role_permissions` | ✅ | role_id, permission_key | |
| `operation_logs` | ✅ | (verified) | |
| `audit_logs` | ✅ | (verified) | |
| `has_permission` RPC | ❌ | — | **MISSING — API code requires it** |

### Critical Data Facts
- **shifts:** 4 rows total, **3 OPEN shifts** (closed_at IS NULL)
- **cash_drawer_log:** Has rows with `session_id` but no `shift_id` column
- **admin_users.pin:** All values are NULL (safe to drop)
- **No Phase 1 migrations applied** — tables were created outside migration system

---

## MIGRATION-BY-MIGRATION REVIEW

### 1. `20260902_permission_ssot_audit.sql`
**Purpose:** Add indexes, verify FKs, add `category` column to permissions  
**Safety:** ✅ SAFE  
**Details:**
- Only adds indexes with `IF NOT EXISTS` — idempotent
- Adds `category` column with `IF NOT EXISTS` — safe
- Verification DO blocks only raise NOTICE/WARNING — no data modification
- No DROP statements
- No destructive operations
- **Issue:** `permissions.category` column doesn't exist in production. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` handles this safely.

**Classification:** ✅ SAFE

---

### 2. `20260902_staff_audit_trail.sql`
**Purpose:** Add audit indexes, set `created_at` defaults  
**Safety:** ✅ SAFE  
**Details:**
- All `CREATE INDEX IF NOT EXISTS` — idempotent
- `ALTER TABLE ... SET DEFAULT now()` — safe, doesn't affect existing data
- No DROP statements
- No destructive operations

**Classification:** ✅ SAFE

---

### 3. `20260902_reports_hub.sql`
**Purpose:** Create `v_staff_performance` and `v_daily_staff_performance` views  
**Safety:** ✅ SAFE  
**Details:**
- `CREATE OR REPLACE VIEW` — idempotent, drops/recreates view
- Adds indexes on `orders` — idempotent
- Views use LEFT JOINs — won't break if no data exists
- No DROP statements on tables
- No destructive operations
- **Note:** `v_staff_performance` uses `o.created_by = s.id OR o.assigned_to = s.id` — may cause double counting if an order has both. This is a business logic issue, not a migration safety issue.

**Classification:** ✅ SAFE

---

### 4. `20260903_shifts_clock_events_migration.sql` ⚠️ CRITICAL
**Purpose:** Create `shifts` and `clock_events` tables  
**Safety:** ❌ NOT SAFE — WILL FAIL  
**Details:**
- **`CREATE TABLE IF NOT EXISTS public.shifts`** — Table ALREADY EXISTS with DIFFERENT schema
  - Production has: `report_date` column
  - Migration defines: NO `report_date`, but HAS `updated_at`
  - Result: `CREATE TABLE IF NOT EXISTS` will skip creation, but subsequent `ALTER TABLE` statements may fail or be no-ops
  - The FK `shifts_staff_id_fkey` will try to add a constraint that may already exist
  - `ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY` — safe if table exists
  - Policies will be created — may conflict with existing policies

- **`CREATE TABLE IF NOT EXISTS public.clock_events`** — Table ALREADY EXISTS with DIFFERENT schema
  - Production has: `clock_in`, `clock_out` columns
  - Migration defines: `clock_in`, `clock_out` — matches
  - BUT migration defines NO `created_at`, production also has NO `created_at` — matches
  - `ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY` — will enable RLS on existing table

**Critical Issues:**
1. Table exists but schema differs (`report_date` vs `updated_at`)
2. FK constraints may already exist with different names
3. RLS will be enabled on existing tables — could break existing queries if policies don't match app auth model
4. **3 open shifts exist** — any schema change could affect them

**Classification:** ❌ NOT SAFE — Requires schema reconciliation first

---

### 5. `20260903_cash_drawer_log_migration.sql` ⚠️ CRITICAL
**Purpose:** Create `cash_drawer_log` table with `shift_id` FK  
**Safety:** ❌ NOT SAFE — WILL FAIL  
**Details:**
- **`CREATE TABLE IF NOT EXISTS public.cash_drawer_log`** — Table ALREADY EXISTS with DIFFERENT schema
  - Production has: NO `shift_id` column
  - Migration defines: HAS `shift_id` column with FK to `shifts`
  - Result: Table creation skipped, but subsequent `ALTER TABLE ADD CONSTRAINT` will FAIL because `shift_id` column doesn't exist

- **Existing data:** 5+ rows in `cash_drawer_log` with no `shift_id`

**Critical Issues:**
1. `ALTER TABLE public.cash_drawer_log ADD CONSTRAINT cash_drawer_log_shift_id_fkey` will FAIL — column `shift_id` doesn't exist
2. `CREATE INDEX IF NOT EXISTS idx_cash_drawer_log_shift_id` will FAIL — column doesn't exist
3. The migration assumes `cash_drawer_log` doesn't exist, but it does

**Classification:** ❌ NOT SAFE — Requires schema reconciliation and ALTER TABLE ADD COLUMN first

---

### 6. `20260903_staff_api_security.sql` ⚠️ CRITICAL
**Purpose:** Drop plaintext PIN from `admin_users`, add `superadmin` role  
**Safety:** ⚠️ SAFE WITH CONDITIONS  
**Details:**

**Part A — Drop plaintext PIN:**
- `ALTER TABLE admin_users DROP COLUMN IF EXISTS pin` — DESTRUCTIVE but safe because all values are NULL
- `DROP INDEX IF EXISTS admin_users_pin_key` — safe
- Data migration loop: Migrates any non-NULL `pin` to `pin_hash` using `crypt()` — safe, but **irreversible**
- **Risk:** If any `pin` values exist, they will be hashed and plaintext lost forever

**Part B — Add superadmin role:**
- `INSERT INTO roles ... ON CONFLICT DO NOTHING` — safe, idempotent
- `INSERT INTO role_permissions ... ON CONFLICT DO NOTHING` — safe, idempotent

**Part C — Indexes:**
- `CREATE INDEX IF NOT EXISTS` — safe, idempotent

**Classification:** ⚠️ SAFE WITH CONDITIONS
- Condition 1: Verify `admin_users.pin` is NULL for ALL rows (confirmed: yes)
- Condition 2: Ensure application code doesn't reference `admin_users.pin` anywhere (needs verification)
- Condition 3: Ensure `superadmin` role doesn't already exist (confirmed: it does NOT exist in production roles table)

---

### 7. `20260903_permission_ssot_fix.sql` ⚠️ CRITICAL
**Purpose:** Fix `has_permission` RPC to use `role_id`  
**Safety:** ⚠️ SAFE WITH CONDITIONS  
**Details:**
- `CREATE OR REPLACE FUNCTION public.has_permission` — **REPLACES** existing function
- Existing `has_permission` uses legacy `staff.role` text column check
- New version uses `staff.role_id` + `roles.id` + `role_permissions`
- Adds `s.is_active = true` check — **NEW behavior**
- Removes legacy `staff.role = 'admin'` bypass

**Critical Issues:**
1. **Existing RPC doesn't exist in production** — but migration assumes it does
2. **Behavior change:** New RPC requires `staff.is_active = true` and `role_id` linkage
3. **API code dependency:** Multiple endpoints call `requirePermission()` which calls `has_permission()`
4. If `staff.role_id` is NULL for any active staff, the RPC returns FALSE — permission denied

**Verification needed:**
- All active staff have `role_id` (confirmed: yes, all 3 staff have role_id)
- `role_permissions` table has mappings for all roles (confirmed: 105 mappings)
- No active staff has NULL `role_id` (confirmed)

**Classification:** ⚠️ SAFE WITH CONDITIONS
- Condition: All active staff must have non-NULL `role_id` (confirmed)
- Condition: All roles used by active staff must have `role_permissions` entries (needs verification)

---

### 8. `20260903_missing_rpcs.sql` ⚠️ CRITICAL
**Purpose:** Create `clock_in_atomic` and `clock_out_atomic` RPCs  
**Safety:** ❌ NOT SAFE — WILL FAIL  
**Details:**

**`clock_in_atomic`:**
- References `staff` table — ✅ exists
- References `shifts` table — ✅ exists
- Uses `FOR UPDATE` locking — ✅ safe for concurrency
- Calls `log_audit()` — ✅ exists
- **Issue:** Assumes `shifts` table has specific columns. Production `shifts` has `report_date` but no `updated_at`. The RPC INSERT only uses `staff_id, opened_at, notes` — safe.

**`clock_out_atomic`:**
- Same table references
- `UPDATE shifts SET closed_at = now(), notes = ..., updated_at = now()` — **`updated_at` column DOES NOT EXIST in production**
- This will cause the RPC to FAIL with "column shifts.updated_at does not exist"

**Critical Issue:**
- `clock_out_atomic` references `shifts.updated_at` which doesn't exist in production
- The RPC will fail on every clock-out attempt

**Classification:** ❌ NOT SAFE — Requires `updated_at` column to be added to `shifts` first

---

## MISSING MIGRATIONS NEEDED

The following migrations do NOT exist but are required:

1. **Reconcile shifts schema** — Add `updated_at` to `shifts`, reconcile `report_date` vs `updated_at`
2. **Add `shift_id` to `cash_drawer_log`** — ALTER TABLE ADD COLUMN, not CREATE TABLE
3. **Create `has_permission` RPC** — Currently missing in production
4. **Add `created_at` to `clock_events`** — For audit consistency
5. **Add `category` to `permissions`** — Partially done in 20260902 but needs verification

---

## MIGRATION ORDER (CORRECTED)

Based on dependencies and production state:

```
-- STEP 0: PRE-FLIGHT CHECKS (run first, no changes)
-- Verify all active staff have role_id
-- Verify no orphan sessions
-- Verify shifts data is consistent

-- STEP 1: SCHEMA RECONCILIATION (safe, idempotent)
-- Add missing columns to existing tables
-- ALTER TABLE shifts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- ALTER TABLE cash_drawer_log ADD COLUMN IF NOT EXISTS shift_id uuid;

-- STEP 2: PERMISSION SSOT FIX (safe with conditions)
-- Create/replace has_permission RPC
-- Add category column to permissions if missing

-- STEP 3: MISSING RPCS (after schema reconciliation)
-- clock_in_atomic (safe after Step 1)
-- clock_out_atomic (safe after Step 1)

-- STEP 4: SECURITY FIXES (safe with conditions)
-- Drop admin_users.pin (after verifying all NULL)
-- Add superadmin role if missing

-- STEP 5: INDEXES & PERFORMANCE (safe)
-- All IF NOT EXISTS indexes

-- STEP 6: VIEWS (safe)
-- v_staff_performance
-- v_daily_staff_performance

-- STEP 7: RLS (careful)
-- Enable RLS on shifts, clock_events, cash_drawer_log
-- Add policies matching app auth model
```

---

## DESTRUCTIVE OPERATIONS FLAG

| Migration | Operation | Table | Data Affected | Risk |
|-----------|-----------|-------|---------------|------|
| 20260903_staff_api_security | DROP COLUMN | admin_users | `pin` (all NULL) | LOW — no data loss |
| 20260903_staff_api_security | DROP INDEX | admin_users | `admin_users_pin_key` | LOW — unused index |
| 20260903_permission_ssot_fix | CREATE OR REPLACE FUNCTION | public | `has_permission` RPC | MEDIUM — behavior change |
| 20260902_reports_hub | CREATE OR REPLACE VIEW | public | `v_staff_performance` | LOW — view only |

---

## DEPENDENCY CHAIN

```
20260902_permission_ssot_audit
    └── NO dependencies — can run first

20260902_staff_audit_trail
    └── NO dependencies — can run first

20260902_reports_hub
    └── Depends on: staff, roles, orders tables existing ✅
    └── NO dependency on other migrations

20260903_permission_ssot_fix
    └── Depends on: staff.role_id, roles, role_permissions ✅
    └── BLOCKS: 20260903_missing_rpcs (if RPC used)
    └── BLOCKS: API routes using requirePermission()

20260903_staff_api_security
    └── Depends on: admin_users table ✅
    └── MUST run BEFORE: any code referencing admin_users.pin

20260903_shifts_clock_events_migration
    └── DEPENDENT ON: schema reconciliation (shifts, clock_events exist with different schemas)
    └── MUST be REWRITTEN as ALTER TABLE statements

20260903_cash_drawer_log_migration
    └── DEPENDENT ON: schema reconciliation (cash_drawer_log exists)
    └── MUST be REWRITTEN as ALTER TABLE ADD COLUMN

20260903_missing_rpcs
    └── Depends on: shifts table having updated_at column
    └── Depends on: clock_events table structure
    └── Depends on: log_audit() RPC ✅
```

---

## SECURITY CONCERNS

### A. Staff Identity
- ✅ `staff.id` is canonical identity
- ✅ `sessions.user_id` → `staff.id` (FK verified)
- ✅ `clock_events.staff_id` → `staff.id` (FK verified)
- ✅ `shifts.staff_id` → `staff.id` (FK verified via PostgREST)
- ⚠️ `cash_drawer_log.created_by` → `staff.id` (FK in migration, not verified in production)

### B. Roles
- ✅ `staff.role_id` → `roles.id` exists and is NOT NULL
- ✅ All 3 active staff have valid `role_id`
- ✅ `role_permissions` has 105 mappings
- ⚠️ `has_permission` RPC missing in production — **API will fail**

### C. Auth / PIN
- ✅ `staff.pin_hash` exists
- ✅ `admin_users.pin_hash` exists
- ⚠️ `admin_users.pin` column still exists (all values NULL)
- ⚠️ Migration drops `pin` column — verify no app code references it

### D. Shifts
- ⚠️ 3 open shifts exist (from Aug 9 and Aug 22) — very old
- ⚠️ `clock_in_atomic` and `clock_out_atomic` RPCs don't exist
- ⚠️ `clock_out_atomic` references non-existent `updated_at` column
- ⚠️ No duplicate clock-in prevention in current API (relies on app logic)

### E. Cash
- ⚠️ `cash_drawer_log.shift_id` column doesn't exist
- ⚠️ Cash drawer sessions exist with extra columns (`register_id`, `approved_by`, `approval_note`)
- ⚠️ No FK from `cash_drawer_log` to `shifts`

### F. RLS
- Unknown RLS status on: shifts, clock_events, cash_drawer_log
- Migration enables RLS on these tables — could break existing queries
- Need to verify app auth model matches RLS policies

### G. Permission Bypass
- Current API routes use `requireAuth(['admin','superadmin'])` — hardcoded role check
- `requirePermission()` exists in code but `has_permission` RPC missing
- **Risk:** If `has_permission` is created with stricter checks, some operations may fail

---

## PRODUCTION DATA IMPACT

### shifts (4 rows)
- 3 open shifts (very old — Aug 9 and Aug 22)
- 1 closed shift
- **Risk:** Schema changes could affect open shift records
- **Mitigation:** Adding `updated_at` is safe (DEFAULT now())

### cash_drawer_log (5+ rows)
- All rows have `session_id` but no `shift_id`
- **Risk:** Adding `shift_id` FK is safe (NULL allowed initially)

### admin_users (2 rows)
- All `pin` values are NULL
- **Risk:** Dropping `pin` column is safe — no data loss

### clock_events (0 rows)
- Empty table
- **Risk:** Schema changes are safe — no data to preserve

---

## ROLLBACK CONSIDERATIONS

| Migration | Rollback Difficulty |
|-----------|---------------------|
| 20260902_permission_ssot_audit | EASY — indexes can be dropped, column added is harmless |
| 20260902_staff_audit_trail | EASY — same as above |
| 20260902_reports_hub | EASY — drop views, drop indexes |
| 20260903_permission_ssot_fix | MEDIUM — RPC replacement is reversible (save old function first) |
| 20260903_staff_api_security | HARD — dropping `pin` column is irreversible |
| 20260903_shifts_clock_events_migration | HARD — enabling RLS on existing tables changes query behavior |
| 20260903_cash_drawer_log_migration | MEDIUM — adding `shift_id` column is reversible |
| 20260903_missing_rpcs | EASY — drop RPCs if needed |

---

## WHAT MUST BE FIXED BEFORE PRODUCTION

### CRITICAL (Blocking)
1. **Rewrite `20260903_shifts_clock_events_migration.sql`**
   - Change from `CREATE TABLE` to `ALTER TABLE` for existing tables
   - Add `updated_at` to `shifts`
   - Reconcile `report_date` vs `updated_at` semantics

2. **Rewrite `20260903_cash_drawer_log_migration.sql`**
   - Change from `CREATE TABLE` to `ALTER TABLE ADD COLUMN`
   - Add `shift_id` column with FK
   - Backfill `shift_id` from existing data if possible

3. **Fix `clock_out_atomic` RPC**
   - Replace `updated_at = now()` with `notes = COALESCE(notes, '') || ...` only
   - Or add `updated_at` column to `shifts` first

4. **Create `has_permission` RPC in production**
   - This is MISSING and API code depends on it
   - Current code will return 500 errors

### HIGH (Should fix)
5. **Verify `admin_users.pin` is truly unused**
   - Search codebase for any reference to `admin_users.pin`
   - Ensure dropping it won't break anything

6. **Add `created_at` to `clock_events`**
   - For audit consistency
   - Safe to add (table is empty)

7. **Handle 3 open shifts**
   - These are from Aug 9 and Aug 22 — very old
   - Decide: close them automatically or notify staff

### MEDIUM (Nice to have)
8. **Reconcile `report_date` in shifts**
   - Is it derived from `opened_at` or manually set?
   - Ensure consistency

9. **Add `category` to `permissions`**
   - UI expects it, but DB column may not exist

---

## API CONTRACT IMPACT

### Affected Endpoints

| Endpoint | Current Auth | Required Auth | Impact |
|----------|-------------|---------------|--------|
| `/api/staff` | `requireAuth(['admin','superadmin'])` | `requirePermission('staff.view')` | Will break if `has_permission` missing |
| `/api/staff/[id]` | `requireAuth(['admin','superadmin'])` | `requirePermission('staff.view')` | Same |
| `/api/staff/roles` | `requireAuth(['admin','superadmin'])` | `requirePermission('staff.manage')` | Same |
| `/api/shifts` | `requireAuth(['cashier','admin','superadmin'])` | `requirePermission('cash.view')` | Same |
| `/api/pos/staff/clock` | **NONE** (CRITICAL) | Session + permission | Will break if session validation added |
| `/api/pos/staff` | **NONE** (CRITICAL) | `requireAuth(['admin','superadmin'])` | Will break if auth added |

### Breaking Changes Summary
1. **`has_permission` RPC missing** → All `requirePermission()` calls fail
2. **`staff.role_id` required** → If any staff has NULL role_id, auth fails
3. **`staff.is_active` check added** → Inactive staff get permission denied
4. **`admin_users.pin` dropped** → Any code reading `admin_users.pin` fails
5. **RLS on shifts/clock_events** → Direct queries may be blocked if policies don't match app auth

---

## RECOMMENDED ACTION PLAN

### Phase 1: Schema Reconciliation (SAFE)
Create new migration: `20260903_schema_reconciliation.sql`
- Add `updated_at` to `shifts`
- Add `created_at` to `clock_events`
- Add `shift_id` to `cash_drawer_log`
- Verify all existing columns match expectations

### Phase 2: Security Foundation (SAFE WITH CONDITIONS)
Create new migration: `20260903_security_foundation.sql`
- Create `has_permission` RPC
- Drop `admin_users.pin` (after verifying unused)
- Add `superadmin` role if missing
- Add permission indexes

### Phase 3: Missing RPCs (AFTER Phase 1)
Create new migration: `20260903_rpc_fixes.sql`
- Fix `clock_in_atomic` (safe)
- Fix `clock_out_atomic` (remove `updated_at` reference or add column first)

### Phase 4: Indexes & Views (SAFE)
Create new migration: `20260903_performance.sql`
- All audit/report indexes
- Performance views

### Phase 5: RLS (CAREFUL)
Create new migration: `20260904_rls.sql`
- Enable RLS on shifts, clock_events, cash_drawer_log
- Add policies matching app auth
- Test thoroughly before applying

---

## FINAL VERIFICATION CHECKLIST

Before ANY migration runs in production:

- [ ] Backup production database
- [ ] Verify `admin_users.pin` is NULL for ALL rows
- [ ] Verify ALL active staff have non-NULL `role_id`
- [ ] Verify ALL roles used by active staff have `role_permissions` entries
- [ ] Verify no application code references `admin_users.pin`
- [ ] Verify no application code references `shifts.updated_at` (doesn't exist)
- [ ] Verify no application code references `cash_drawer_log.shift_id` (doesn't exist)
- [ ] Decide what to do with 3 open shifts from Aug 9/Aug 22
- [ ] Test all migrations in staging first
- [ ] Prepare rollback scripts for each migration
- [ ] Schedule maintenance window for RLS changes
- [ ] Notify team of API contract changes

---

## CONCLUSION

**The migration chain as currently written is NOT READY for production.**

Key blockers:
1. Migrations assume tables don't exist — they do, with different schemas
2. `has_permission` RPC is missing — API will fail
3. `clock_out_atomic` references non-existent column
4. Open shifts exist that could be affected

**Required actions:**
1. Rewrite failing migrations as ALTER TABLE / IF NOT EXISTS
2. Create missing `has_permission` RPC
3. Fix RPC column references
4. Test in staging
5. Then apply in production with monitoring

**DO NOT RUN until all CRITICAL issues are resolved.**
