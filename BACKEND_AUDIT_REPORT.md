# BACKEND AUDIT REPORT — SAITO ADMIN 1

**Project:** `saito-admin1`
**Live DB:** `jbxmlnsicbfkbsatnoej` (Supabase / PostgreSQL 17)
**Audit Date:** 2026-08-27
**Auditor:** Kilo (CLI)
**Scope:** Backend only — migrations, RPCs, API routes, tests, DB integrity

---

## 1. EXECUTIVE SUMMARY

The backend is in a **partially production-ready** state. Core atomic RPCs exist and are used by some routes (cash-drawer), but the staff API layer still relies on coarse role-based auth instead of fine-grained permission checks. Several tables (`shifts`, `clock_events`, `cash_drawer_log`) exist in production without corresponding migration files. Session and PIN security are mostly correct, but there are unauthenticated POS endpoints and plaintext PIN exposure in admin auth routes.

**Key Risks:**
- **Unauthenticated POS clock endpoints** (`/api/pos/staff/clock`, `/api/pos/staff`)
- **Staff API returns `pin_hash`** in list/detail responses
- **Admin PIN routes store plaintext** (`auth/users`, `auth/change-password`)
- **Missing migrations** for production tables (`shifts`, `clock_events`, `cash_drawer_log`)
- **Non-atomic shift operations** (no transaction, no RPC)
- **Permission-based auth not enforced** on staff/role/shift mutations

---

## 2. PRODUCTION SCHEMA VERIFICATION

### 2.1 Applied Migrations

| Migration | Status | Notes |
|-----------|--------|-------|
| `20260627000001_cleanup_pin_auth.sql` | Applied | sessions table created, admin_users pin added |
| `20260627000003_pin_auth.sql` | Applied | sessions recreated with different schema |
| `20260630_p6_production_fixes.sql` | Applied | table_floors, sessions, settings |
| `20260701_p7_payment_capability.sql` | Applied | payment tables |
| `20260702_p8_reservation_capability.sql` | Applied | reservation tables |
| `20260704_p10_pricing_engine.sql` | Applied | pricing engine |
| `20260705_p11_stock_automation.sql` | Applied | stock automation |
| `20260706000001_final_table_ops.sql` | Applied | table operations |
| `20260706000002_fix_02_p10_columns.sql` | Applied | missing columns |
| `20260706000003_fix_03_p10_rpcs.sql` | Applied | RPC fixes |
| `20260706000004_fix_03_p10_rpcs.sql` | Applied | RPC fixes |
| `20260706000005_fix_04_p11_inventory_logs.sql` | Applied | inventory logs |
| `20260706000006_fix_05_p11_supplier_returns.sql` | Applied | supplier returns |
| `20260706000007_fix_06_p11_stock_counts.sql` | Applied | stock counts |
| `20260706000008_fix_07_p11_rpcs.sql` | Applied | RPC fixes |
| `20260706000009_fix_08_indexes.sql` | Applied | indexes |
| `20260706000011_fix_10_reservation_cleanup.sql` | Applied | reservation cleanup |
| `20260706000012_fix_10_unify_workflow.sql` | Applied | workflow unification |
| `20260706000013_fix_11_missing_rpcs.sql` | Applied | missing RPCs |
| `20260706000014_fix_12_reverse_stock.sql` | Applied | reverse stock |
| `20260706000015_fix_13_ready_products.sql` | Applied | ready products |
| `20260706000016_fix_14_production_sweep.sql` | Applied | production sweep |
| `20260706000017_fix_15_combo_group.sql` | Applied | combo group |
| `20260706000019_fix_17_enterprise_upgrades.sql` | Applied | enterprise upgrades |
| `20260706000020_fix_18_concurrency_safety.sql` | Applied | concurrency safety |
| `20260706000022_fix_20_update_order_item_quantity.sql` | Applied | order item quantity |
| `20260713000001_admin_users_pin_hash.sql` | Applied | admin_users pin_hash |
| `20260718000002_fix_auto_apply_campaigns.sql` | Applied | auto-apply campaigns |
| `20260719000002_drop_redundant_orders_unique_index.sql` | Applied | orders unique index |
| `20260719000003_fix_payment_stock_double_deduction.sql` | Applied | double deduction fix |
| `20260730000001_create_operation_logs.sql` | Applied | operation_logs table |
| `20260730000002_create_order_payments.sql` | Applied | order_payments table |
| `20260730000003_create_inventory_transactions.sql` | Applied | inventory_transactions |
| `20260730000006_add_current_order_id.sql` | Applied | current_order_id |
| `20260730000007_complete_payment_atomic.sql` | Applied | payment RPC |
| `20260730000008_reopen_order_atomic.sql` | Applied | reopen order RPC |
| `20260730000009_cancel_reservation_atomic.sql` | Applied | cancel reservation RPC |
| `20260730000010_merge_tables_atomic.sql` | Applied | merge tables RPC |
| `20260730000011_transfer_table_atomic.sql` | Applied | transfer table RPC |
| `20260730000013_activate_table_atomic.sql` | Applied | activate table RPC |
| `20260730000014_confirm_and_checkin_atomic.sql` | Applied | checkin RPC |
| `20260730000016_update_reservation_atomic.sql` | Applied | update reservation RPC |
| `20260730000017_auto_no_show_v2.sql` | Applied | auto no-show |
| `20260730000018_calculate_order_total.sql` | Applied | order total calc |
| `20260730000019_transition_delivery_status.sql` | Applied | delivery status |
| `20260730000020_send_to_kitchen_atomic.sql` | Applied | kitchen RPC |
| `20260730000022_start_preparing_atomic.sql` | Applied | preparing RPC |
| `20260730000024_mark_served_atomic.sql` | Applied | served RPC |
| `20260730000025_reopen_kitchen_ticket_atomic.sql` | Applied | reopen kitchen |
| `20260730000027_rollback_inventory_atomic.sql` | Applied | inventory rollback |
| `20260730000028_unmerge_tables_atomic.sql` | Applied | unmerge tables |
| `20260730000029_void_order_item_atomic.sql` | Applied | void order item |
| `20260730000030_comp_order_item_atomic.sql` | Applied | comp order item |
| `20260730000031_waste_order_item_atomic.sql` | Applied | waste order item |
| `20260730000032_rpc_version_and_terminal_tracking.sql` | Applied | version + terminal |
| `20260730000033_move_reservation_table_atomic.sql` | Applied | move reservation |
| `20260730000034_merge_reservation_tables_atomic.sql` | Applied | merge reservation |
| `20260730000035_mark_no_show_atomic.sql` | Applied | mark no-show |
| `20260730000036_kitchen_item_rpc_version.sql` | Applied | kitchen item version |
| `20260730000037_kitchen_ssot_fixes.sql` | Applied | kitchen SSOT |
| `20260730000038_mark_sold_out_atomic.sql` | Applied | sold out RPC |
| `20260731000001_fix_table_clear_and_guest_count.sql` | Applied | table clear + guest count |
| `20260731000002_fix_deployed_rpc_schema.sql` | Applied | RPC schema fixes |
| `20260731000003_add_remaining_missing_columns.sql` | Applied | missing columns |
| `20260731000004_fix_rpc_runtime_behaviors.sql` | Applied | RPC runtime fixes |
| `20260731000005_fix_merge_unmerge_and_payment.sql` | Applied | merge/unmerge + payment |
| `20260731000006_fix_reservation_overload_and_no_show.sql` | Applied | reservation overload |
| `20260731000007_drop_redundant_overloads.sql` | Applied | drop overloads |
| `20260731000008_fix_pgrst203_rls_and_enum.sql` | Applied | RLS + enum fixes |
| `20260731000009_add_rpc_authorization.sql` | Applied | RPC auth (reverted later) |
| `20260731000010_create_dismiss_undo_atomic.sql` | Applied | dismiss undo RPC |
| `20260731000011_add_cash_drawer_tables.sql` | Applied | cash_drawer_sessions, cash_movements |
| `20260731000012_add_customer_addresses.sql` | Applied | customer addresses |
| `20260731000013_add_delivery_zones.sql` | Applied | delivery zones |
| `20260731000014_remove_plaintext_pins.sql` | Applied | plaintext pins removed |
| `20260731000015_fix_confirm_checkin_auth.sql` | Applied | checkin auth fix |
| `20260731000016_add_rls_to_unprotected_tables.sql` | Applied | RLS policies |
| `20260731000017_fix_rpc_grants.sql` | Applied | RPC grants |
| `20260731000018_revert_rpc_auth_checks.sql` | Applied | reverted auth checks |
| `20260731000019_create_calculate_delivery_fee.sql` | Applied | delivery fee RPC |
| `20260731000020_revert_remaining_rpc_auth.sql` | Applied | reverted auth checks |
| `20260731000021_revert_final_rpc_auth.sql` | Applied | reverted auth checks |
| `20260731000022_fix_reservation_status_enum.sql` | Applied | reservation status enum |
| `20260731000023_create_state_transitions.sql` | Applied | state_transitions table |
| `20260731000024_create_operation_logs.sql` | Applied | operation_logs recreated |
| `20260731000025_create_audit_logs.sql` | Applied | audit_logs table |
| `20260731000026_create_validate_transition.sql` | Applied | validate_transition RPC |
| `20260731000027_create_log_operation.sql` | Applied | log_operation RPC |
| `20260731000028_create_transition_table_status.sql` | Applied | transition_table_status RPC |
| `20260731000029_update_walkin_atomic.sql` | Applied | walkin RPC update |
| `20260822000003_fix_complete_payment_atomic.sql` | Applied | payment RPC update |
| `20260822000004_fix_status_flows.sql` | Applied | status flows |
| `20260822000005_remove_unused_courier_states.sql` | Applied | courier states |
| `20260822000006_delivery_payment_after_delivery.sql` | Applied | delivery payment |
| `20260822000007_add_picked_up_to_in_transit.sql` | Applied | picked_up status |
| `20260822000008_mark_order_ready_updates_table.sql` | Applied | mark ready table update |
| `20260822000009_transition_order_status_updates_table.sql` | Applied | order status table update |
| `20260822000010_add_table_ready_state.sql` | Applied | table ready state |
| `20260823000001_fix_table_state_machine.sql` | Applied | table state machine |
| `20260825090000_audit_rebuild_foundation.sql` | Applied | audit + roles + permissions + has_permission + log_audit |
| `20260825090001_staff_role_assignment.sql` | Applied | staff role_id backfill |
| `20260825090002_payment_refund_void.sql` | Applied | refund + void RPCs |
| `20260825090003_cash_register_close_audit.sql` | Applied | cash register close + reopen |
| `20260825090004_offline_reconnect.sql` | Applied | offline reconnect |
| `20260901_sessions_canonical_staff_identity.sql` | Applied | sessions FK + revoked_at |
| `20260901_staff_role_id_enforce.sql` | Applied | staff role_id NOT NULL + FK |
| `20260901_clock_events_staff_fk.sql` | Applied | clock_events FK to staff |
| `20260902_permission_ssot_audit.sql` | Applied | permission audit + indexes |
| `20260902_reports_hub.sql` | Applied | staff performance views |
| `20260902_staff_audit_trail.sql` | Applied | audit trail indexes |

### 2.2 Schema Drift — Tables Without Migrations

| Table | Production Status | Migration Status |
|-------|------------------|------------------|
| `shifts` | EXISTS (137 rows) | **NO MIGRATION** |
| `clock_events` | EXISTS (0 rows) | **NO MIGRATION** |
| `cash_drawer_log` | EXISTS (referenced by RPCs) | **NO MIGRATION** |
| `order_counters` | EXISTS (referenced in RLS policies) | **NO MIGRATION** |
| `app_settings` | EXISTS (referenced in RLS policies) | **NO MIGRATION** |

**Action Required:** Create migrations for all production tables missing from the migration history.

### 2.3 Key Table Structures

#### staff (verified)
- `id` (uuid, PK)
- `name` (text)
- `role` (text) — legacy free-text, still used by some routes
- `role_id` (uuid, FK → roles.id, NOT NULL) — added in migration
- `shift` (text, nullable)
- `phone` (text, nullable)
- `pin_hash` (text, nullable)
- `is_active` (boolean)
- `full_name` (text, nullable)
- `email` (text, nullable)
- `hourly_rate` (numeric, nullable)
- `created_at` (timestamptz)

**Missing columns in migrations:**
- `role_id` was added via `20260825090000_audit_rebuild_foundation.sql` and enforced in `20260901_staff_role_id_enforce.sql`
- `full_name`, `email`, `hourly_rate` were added outside migrations

#### sessions (verified)
- `token` (text, PK)
- `user_id` (uuid, FK → staff.id ON DELETE RESTRICT)
- `role` (text)
- `expires_at` (timestamptz)
- `created_at` (timestamptz)
- `revoked_at` (timestamptz, nullable) — added in `20260901`

#### shifts (production, no migration)
- `id` (uuid, PK)
- `staff_id` (uuid, FK → staff.id)
- `opened_at` (timestamptz)
- `closed_at` (timestamptz, nullable)
- `expected_cash` (numeric)
- `actual_cash` (numeric, nullable)
- `difference` (numeric, nullable)
- `notes` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### clock_events (production, no migration)
- `id` (uuid, PK)
- `staff_id` (uuid, FK → staff.id ON DELETE RESTRICT)
- `clock_in` (timestamptz)
- `clock_out` (timestamptz, nullable)

#### cash_drawer_log (production, no migration)
- `id` (uuid, PK)
- `session_id` (uuid, FK → cash_drawer_sessions.id)
- `type` (text)
- `amount` (numeric)
- `description` (text)
- `created_by` (uuid)
- `created_at` (timestamptz)

---

## 3. DATABASE INTEGRITY

### 3.1 Staff Identity Verification

| Reference | Target | FK Exists | Valid |
|-----------|--------|-----------|-------|
| `sessions.user_id` | `staff.id` | YES (RESTRICT) | YES (0 orphaned) |
| `clock_events.staff_id` | `staff.id` | YES (RESTRICT) | YES (0 orphaned) |
| `shifts.staff_id` | `staff.id` | **UNKNOWN** | **NEEDS VERIFICATION** |
| `operation_logs.performed_by` | `staff.id` | NO (nullable uuid) | N/A |
| `audit_logs.staff_id` | `staff.id` | NO (nullable uuid) | N/A |
| `cash_drawer_sessions.staff_id` | `staff.id` | YES (CASCADE) | N/A |
| `cash_drawer_log.created_by` | `staff.id` | NO (nullable uuid) | N/A |

**Findings:**
- `shifts.staff_id` FK not verified — need to check production
- `operation_logs.performed_by` and `audit_logs.staff_id` are nullable uuids without FK constraints. This is acceptable for audit trails but should be documented.

### 3.2 Orphaned Records Check

- **sessions:** 0 orphaned (all reference valid staff)
- **clock_events:** 0 rows, 0 orphaned
- **shifts:** 137 rows — need FK verification
- **cash_drawer_sessions:** staff_id FK exists (CASCADE)

---

## 4. ROLES SYSTEM

### 4.1 Canonical Roles

| Role | is_system | Permissions Count |
|------|-----------|-------------------|
| owner | true | 30 |
| admin | true | 30 |
| manager | true | 22 |
| cashier | true | 12 |
| waiter | true | 4 |
| host | true | 3 |
| kitchen | true | 3 |
| bartender | true | 4 |
| stock | true | 3 |
| accountant | true | 7 |
| superadmin | **MISSING** | N/A |

**Finding:** `superadmin` role is referenced in code (`requireAuth(['superadmin'])`, `has_permission` legacy bypass) but does not exist in the `roles` table. This is a **schema drift** issue.

### 4.2 Role-Permissions Structure

- `role_permissions` table: `(role_id, permission_key)` composite PK
- FK: `role_id` → `roles.id` ON DELETE CASCADE
- FK: `permission_key` → `permissions.key` ON DELETE CASCADE
- 105 mappings exist in production

### 4.3 Staff-Role Mapping

- All 3 active staff have `role_id` assigned
- `role_id` is NOT NULL (enforced in migration)
- FK constraint: `staff_role_id_fkey` ON DELETE RESTRICT

---

## 5. PERMISSIONS SSOT

### 5.1 `has_permission` RPC

**Status:** EXISTS in production (migration `20260825090000`)

```sql
CREATE OR REPLACE FUNCTION public.has_permission(p_staff_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM staff s
      JOIN roles r ON r.id = s.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
     WHERE s.id = p_staff_id AND rp.permission_key = p_permission
  ) OR EXISTS (
    SELECT 1 FROM staff s WHERE s.id = p_staff_id AND s.role = 'admin'
  );
$$;
```

**Issues:**
1. Legacy bypass for `s.role = 'admin'` — should check `role_id` or use a system role flag
2. `superadmin` role not in `roles` table but bypass exists in `requirePermission()`:
   ```ts
   if (auth.role && ['admin', 'superadmin', 'owner'].includes(auth.role)) return auth;
   ```
3. No permission caching — every call joins 3 tables

### 5.2 `requirePermission` Usage

| Route | Current Auth | Required Fix |
|-------|-------------|--------------|
| `GET /api/staff` | `requireAuth(['admin', 'superadmin'])` | `requirePermission('staff.view')` |
| `POST /api/staff` | `requireAuth(['admin', 'superadmin'])` | `requirePermission('staff.manage')` |
| `GET /api/staff/[id]` | `requireAuth(['admin', 'superadmin'])` | `requirePermission('staff.view')` |
| `PATCH /api/staff/[id]` | `requireAuth(['admin', 'superadmin'])` | `requirePermission('staff.manage')` |
| `GET /api/staff/roles` | `requireAuth(['admin', 'superadmin'])` | `requirePermission('staff.manage')` |
| `POST /api/staff/roles` | `requireAuth(['admin', 'superadmin'])` | `requirePermission('staff.manage')` |
| `GET /api/shifts` | `requireAuth(['cashier', 'admin', 'superadmin'])` | `requirePermission('cash.view')` |
| `POST /api/shifts` | `requireAuth(['cashier', 'admin', 'superadmin'])` | `requirePermission('cash.open')` |
| `PATCH /api/shifts` | `requireAuth(['cashier', 'admin', 'superadmin'])` | `requirePermission('cash.close')` |

---

## 6. SESSION SECURITY

### 6.1 Session Structure

| Column | Type | Notes |
|--------|------|-------|
| `token` | text (PK) | UUID v4, cryptographically random |
| `user_id` | uuid | FK → staff.id ON DELETE RESTRICT |
| `role` | text | Free-text role stored at login |
| `expires_at` | timestamptz | 12h expiry |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz | Added in `20260901` |

### 6.2 Security Findings

**Strengths:**
- Tokens are UUID v4 (cryptographically random)
- httpOnly, secure (production), sameSite cookies
- Session expiry enforced in `validateAuth()`
- Expired sessions deleted on validation
- Logout deletes session + clears cookies

**Weaknesses:**
1. **No revocation list** — `revoked_at` exists but logout uses DELETE, not UPDATE SET revoked_at
2. **No concurrent session limit** — staff can have unlimited active sessions
3. **No IP/device binding** — session token valid from any IP
4. **`pos/staff/clock` has NO auth** — only checks session token exists
5. **`pos/staff` has NO auth** — returns all active staff with shift info

---

## 7. PIN SECURITY

### 7.1 Staff PIN

| Aspect | Status | Notes |
|--------|--------|-------|
| `pin_hash` column | EXISTS | PBKDF2-SHA256, 260k iterations |
| Plaintext `pin` column | REMOVED | Dropped in `20260731000014` |
| Hash verification | CORRECT | `verifyPin()` in `lib/crypto.ts` |
| PIN in API responses | **EXPOSED** | `select=*` returns `pin_hash` |
| PIN reset | CORRECT | Hashes before storing |
| Rate limiting | EXISTS | `check_login_rate_limit` + `record_login_attempt` |

### 7.2 Admin PIN (CRITICAL ISSUE)

| Aspect | Status | Notes |
|--------|--------|-------|
| `pin_hash` column | EXISTS | Added in `20260713000001` |
| Plaintext `pin` column | **STILL EXISTS** | Never dropped! |
| `auth/users/route.ts` PATCH | **WRITES PLAINTEXT** | `updates.pin = newPin` |
| `auth/change-password/route.ts` | **WRITES PLAINTEXT** | `update({ pin: newPin })` |
| `auth/migrate-admin-pin/route.ts` | MIGRATION HELPER | Hashes existing plaintext pins |

**Finding:** Admin users table still stores plaintext PINs, and two API routes write plaintext PINs directly to the database. This is a **CRITICAL security vulnerability**.

---

## 8. SHIFT BACKEND

### 8.1 Shift Lifecycle

**Current Implementation:**
- Clock in: `POST /api/pos/staff/clock` → INSERT into `shifts`
- Clock out: `PATCH /api/shifts` → UPDATE `closed_at`
- No RPC — operations are non-atomic
- No transaction — crash mid-operation leaves inconsistent state
- No audit log written

### 8.2 Issues

1. **Non-atomic clock in/out** — no FOR UPDATE locks, no transaction
2. **No shift validation** — staff can clock in multiple times
3. **No cash reconciliation** — `shifts` route doesn't use `cash_drawer_log`
4. **No manager approval** — variance not enforced
5. **Missing `starting_cash`** — shift POST doesn't set it

---

## 9. RPC AUDIT

### 9.1 Existing RPCs

| RPC | Purpose | Used By |
|-----|---------|---------|
| `has_permission` | Permission check | `api-auth.ts` |
| `log_audit` | Canonical audit | Multiple RPCs |
| `log_operation` | Operation log | Table/kitchen RPCs |
| `validate_transition` | State validation | Table state machine |
| `transition_table_status` | Table state transition | Table routes |
| `complete_payment_atomic` | Payment completion | cash-drawer route |
| `recalculate_order_payment_state` | Ledger reconciliation | Payment RPCs |
| `recalculate_cash_session` | Cash session balance | Cash register RPCs |
| `open_cash_register` | Open cash register | cash-drawer route |
| `close_cash_register_v2` | Close cash register | cash-drawer route |
| `reopen_cash_register` | Reopen cash register | Cash routes |
| `refund_payment_atomic` | Refund payment | Payment routes |
| `void_payment_atomic` | Void payment | Payment routes |
| `sync_operation` | Offline sync | Sync routes |
| `check_login_rate_limit` | Rate limiting | verify-pin route |
| `record_login_attempt` | Rate limiting | verify-pin route |
| `normalize_role` | Role normalization | verify-pin route |
| `deduct_stock_for_order` | Stock deduction | Payment RPCs |
| `deduct_stock_on_order` | Stock deduction | Trigger + RPCs |
| `reverse_stock_deduction_for_items` | Stock reversal | Cancel RPCs |
| `calculate_order_total_v2` | Order total | Order routes |
| `walkin_atomic` | Walk-in creation | Reservation routes |
| `reserve_table_atomic` | Table reservation | Reservation routes |
| `seat_guests_atomic` | Seat guests | Reservation routes |
| `confirm_and_checkin_atomic` | Checkin | Reservation routes |
| `cancel_table_orders` | Cancel orders | Table routes |
| `merge_tables_atomic` | Merge tables | Table routes |
| `transfer_table_atomic` | Transfer table | Table routes |
| `unmerge_tables_atomic` | Unmerge tables | Table routes |
| `dismiss_table_atomic` | Dismiss table | Table routes |
| `activate_table_atomic` | Activate table | Reservation routes |
| `auto_no_show_v2` | Auto no-show | Cron |
| `mark_ready_atomic` | Mark ready | Kitchen routes |
| `start_preparing_atomic` | Start preparing | Kitchen routes |
| `mark_served_atomic` | Mark served | Kitchen routes |
| `reopen_kitchen_ticket_atomic` | Reopen kitchen | Kitchen routes |
| `transition_delivery_status` | Delivery status | Delivery routes |
| `create_delivery_order` | Create delivery | RPC route |
| `create_takeaway_order` | Create takeaway | RPC route |
| `calculate_delivery_fee` | Delivery fee | Pricing route |
| `process_order_payment` | Process payment | Legacy route |
| `close_day_atomic` | Close day | Finance routes |
| `atomic_apply_invoice` | Apply invoice | Invoice routes |
| `atomic_receive_goods` | Receive goods | Procurement routes |
| `deduct_inventory_atomic` | Deduct inventory | Inventory routes |
| `cancel_delivery_order` | Cancel delivery | Delivery routes |
| `cancel_takeaway_order` | Cancel takeaway | Takeaway routes |
| `mirror_audit_log_to_audit_logs` | Audit mirror | Trigger |
| `operation_logs_normalize` | Log normalize | Trigger |
| `clear_table_atomic` | Clear table | Table routes |
| `update_guest_count` | Update guest count | POS routes |
| `effective_admin_role` | Get admin role | Legacy RPCs |
| `hash_password` | Hash password | Auth |

### 9.2 Missing RPCs

| RPC | Purpose | Priority |
|-----|---------|----------|
| `clock_in_atomic` | Atomic clock in with validation | HIGH |
| `clock_out_atomic` | Atomic clock out with validation | HIGH |
| `shift_close_atomic` | Atomic shift close + reconciliation | HIGH |

### 9.3 Race Conditions

1. **`complete_payment_atomic`** — Uses `FOR UPDATE` on order, idempotency keys protect against double-payment. **SAFE**.
2. **`close_cash_register_v2`** — Idempotency key + `FOR UPDATE` on session. **SAFE**.
3. **`open_cash_register`** — No idempotency, could create duplicate sessions if called twice rapidly. **RISK**.
4. **Shift clock in/out** — No RPC, no transaction. **UNSAFE**.

---

## 10. API CONTRACT DOCUMENTATION

### 10.1 Staff API Endpoints

#### `GET /api/staff`
- **Auth:** `requireAuth(['admin', 'superadmin'])` → should be `requirePermission('staff.view')`
- **Query Params:** `search`, `role`, `status` (active/inactive)
- **Response:** Array of staff with meta (activeShift, todayOrders, totalShifts, totalHours, lastAction)
- **DB Reads:** `staff`, `shifts`, `operation_logs`
- **Side Effects:** None
- **Security Issue:** Returns `pin_hash` in response

#### `POST /api/staff`
- **Auth:** `requireAuth(['admin', 'superadmin'])` → should be `requirePermission('staff.manage')`
- **Body:** `name`, `role` (string), `role_id` (uuid), `shift`, `phone`, `pin` (4-digit), `is_active`
- **Response:** Created staff object
- **DB Writes:** `staff` (insert)
- **Side Effects:** None (no audit log)
- **Security Issue:** Accepts plaintext `pin` but hashes before storing — OK

#### `GET /api/staff/[id]`
- **Auth:** `requireAuth(['admin', 'superadmin'])` → should be `requirePermission('staff.view')`
- **Query Params:** `period` (today/week/month/all)
- **Response:** Staff detail with stats, shifts, recent actions
- **DB Reads:** `staff`, `shifts`, `operation_logs`
- **Side Effects:** None
- **Security Issue:** Returns `pin_hash` in response

#### `PATCH /api/staff/[id]`
- **Auth:** `requireAuth(['admin', 'superadmin'])` → should be `requirePermission('staff.manage')`
- **Body:** `name`, `role`, `role_id`, `shift`, `phone`, `pin`, `is_active`
- **Response:** Updated staff object
- **DB Writes:** `staff` (update)
- **Side Effects:** None (no audit log)
- **Security Issue:** Accepts plaintext `pin` but hashes before storing — OK

#### `GET /api/staff/roles`
- **Auth:** `requireAuth(['admin', 'superadmin'])` → should be `requirePermission('staff.manage')`
- **Response:** `{ roles: [...], permissions: [...] }`
- **DB Reads:** `roles`, `permissions`, `role_permissions`
- **Side Effects:** None

#### `POST /api/staff/roles`
- **Auth:** `requireAuth(['admin', 'superadmin'])` → should be `requirePermission('staff.manage')`
- **Body:** `action` ('create' or 'update'), `role_id`, `permissions[]`, `name`, `is_system`
- **Response:** Success or created role
- **DB Writes:** `roles`, `role_permissions`
- **Side Effects:** None (no audit log)

### 10.2 Shift API Endpoints

#### `GET /api/shifts`
- **Auth:** `requireAuth(['cashier', 'admin', 'superadmin'])`
- **Query Params:** `staff_id`, `active` (true/false), `period` (today/week/month/all)
- **Response:** Array of shifts
- **DB Reads:** `shifts`
- **Side Effects:** None

#### `POST /api/shifts`
- **Auth:** `requireAuth(['cashier', 'admin', 'superadmin'])` → should be `requirePermission('cash.open')`
- **Body:** `staff_id`, `expected_cash`, `notes`
- **Response:** Created shift
- **DB Writes:** `shifts`, `cash_drawer_logs`
- **Side Effects:** None (no audit log)
- **Issue:** Non-atomic, no transaction

#### `PATCH /api/shifts`
- **Auth:** `requireAuth(['cashier', 'admin', 'superadmin'])` → should be `requirePermission('cash.close')`
- **Body:** `id`, `closed_at`, `actual_cash`, `manager_approved`, `manager_id`, `notes`
- **Response:** Updated shift
- **DB Writes:** `shifts`
- **Side Effects:** None (no audit log)
- **Issue:** Non-atomic, no transaction

### 10.3 POS Staff Endpoints

#### `POST /api/pos/staff/clock`
- **Auth:** **NONE** — CRITICAL ISSUE
- **Body:** `action` ('in' | 'out')
- **Response:** `{ success, action }`
- **DB Writes:** `shifts` (insert or update)
- **Side Effects:** None
- **Issues:**
  - No authentication
  - No authorization
  - Non-atomic operations
  - No validation (inactive staff can clock in)
  - No audit log

#### `GET /api/pos/staff`
- **Auth:** **NONE** — CRITICAL ISSUE
- **Response:** `{ activeStaff, count }`
- **DB Reads:** `shifts`, `staff`
- **Side Effects:** None
- **Issues:**
  - No authentication
  - Returns internal staff data to unauthenticated users

---

## 11. MISSING MIGRATIONS TO CREATE

1. **`20260903_shifts_clock_events_migration.sql`** — Create `shifts` and `clock_events` tables with proper schema, FKs, indexes, and RLS
2. **`20260903_cash_drawer_log_migration.sql`** — Create `cash_drawer_log` table with proper schema, FKs, indexes, and RLS
3. **`20260903_staff_api_security.sql`** — Fix admin_users plaintext PIN, add staff API response sanitization, fix pos endpoints auth
4. **`20260903_missing_rpcs.sql`** — Add `clock_in_atomic`, `clock_out_atomic` RPCs

---

## 12. MISSING RPCs TO CREATE

### `clock_in_atomic(p_staff_id uuid, p_notes text DEFAULT NULL)`
- Validates staff is active
- Checks no open shift exists
- Creates shift atomically
- Writes audit log

### `clock_out_atomic(p_staff_id uuid, p_notes text DEFAULT NULL)`
- Validates staff is active
- Finds open shift
- Closes shift atomically
- Writes audit log

---

## 13. API ROUTES TO UPDATE

1. **`staff/route.ts`** — Replace `requireAuth` with `requirePermission('staff.view')` / `requirePermission('staff.manage')`, exclude `pin_hash` from responses
2. **`staff/[id]/route.ts`** — Same as above
3. **`staff/roles/route.ts`** — Replace `requireAuth` with `requirePermission('staff.manage')`
4. **`shifts/route.ts`** — Add audit logging, use `requirePermission`, add transaction
5. **`pos/staff/clock/route.ts`** — Add auth, use new RPCs, validate staff active
6. **`pos/staff/route.ts`** — Add auth
7. **`auth/users/route.ts`** — Fix plaintext PIN writes
8. **`auth/change-password/route.ts`** — Fix plaintext PIN writes

---

## 14. TESTS TO CREATE

1. `tests/unit/lib/crypto.test.ts` — PIN hash/verify tests
2. `tests/unit/lib/api-auth.test.ts` — Auth validation tests
3. `tests/integration/api/staff.test.ts` — Staff CRUD + permission tests
4. `tests/integration/api/shifts.test.ts` — Shift lifecycle tests
5. `tests/integration/api/auth.test.ts` — Login, logout, session tests
6. `tests/db/rpc.test.ts` — RPC integrity tests

---

## 15. IMMEDIATE ACTION ITEMS

| Priority | Action | File(s) |
|----------|--------|---------|
| P0 | Add auth to `/api/pos/staff/clock` | `artifacts/saito-admin/src/app/api/pos/staff/clock/route.ts` |
| P0 | Add auth to `/api/pos/staff` | `artifacts/saito-admin/src/app/api/pos/staff/route.ts` |
| P0 | Fix admin_users plaintext PIN | `auth/users/route.ts`, `auth/change-password/route.ts` |
| P0 | Exclude `pin_hash` from staff API responses | `staff/route.ts`, `staff/[id]/route.ts` |
| P1 | Create missing migrations | `supabase/migrations/20260903_*` |
| P1 | Create `clock_in/out_atomic` RPCs | New migration |
| P1 | Add `superadmin` role to roles table | New migration |
| P1 | Replace `requireAuth` with `requirePermission` on staff routes | `staff/*`, `shifts/route.ts` |
| P2 | Add audit logging to all mutations | All staff/shift routes |
| P2 | Create backend tests | `tests/` directory |

---

*End of Report*
