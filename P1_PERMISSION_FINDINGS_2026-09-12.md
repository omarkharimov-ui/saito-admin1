# P-1 FINDINGS — AUTHORIZATION / PERMISSION MATRIX (LIVE EVIDENCE)

**Date:** 2026-09-12 · **Source:** LIVE Supabase (`jbxmlnsicbfkbsatnoej`) — staff/roles/role_permissions/overrides rows + live RPC calls (service_role). No changes made (evidence-only, per P-1 instruction).
**Question asked:** does `staff_permission_overrides` compensate the owner-role `payments.create` gap?

## VERDICT UP FRONT

**The override question is moot — and it exposed a fractured permission layer (bigger than the owner gap).**

| # | Finding | Evidence (live) |
|---|---|---|
| **P1-F1** | `staff_permission_overrides` = **0 rows** (entire table empty) | `GET /rest/v1/staff_permission_overrides?select=*` → `[]` |
| **P1-F2** | `location_permission_overrides` = **0 rows** (entire table empty) | same → `[]` |
| **P1-F3** | **No staff of ANY status holds the owner role** (0 of 385; active 0; owner role exists in `roles`, unassigned) | `staff?role_id=eq.<owner>` → `[]` (count 0); all 8 distinct role_ids on staff map to real roles (no orphans) |
| **P1-F4** | `has_permission()` (the ACTUAL runtime gate used by `/api/orders/pay` + 12 other routes) = **role_permissions × staff.is_active only. It does NOT consult either override table.** | Live calls: active manager → `payments.create=true, payments.refund=true, void.approve=true`; active cashier → `payments.create=true, payments.refund=false`; **disabled admin → `false` for everything** (activity check) |
| **P1-F5** | `get_effective_permissions()` is **BROKEN**: returns 65 rows but 12–36 "granted" rows have `permission_code=NULL`, and reports `payments.create=false` for the same active manager for whom `has_permission()` returns **true**. All LOCATION-scoped keys (44/65) missing from named grants. **0 app consumers** (dead) | Live: MGR = 17 named grants (campaigns, floor, order.void, pos.*, own.*, schedule, timeclock, tips) + 27 NULL; SUPERADMIN = 26 + 36 NULL; CASHIER = 9 + 12 NULL. Zero `cash.*`/`payments.*`/`discount.*`/`refund.approve` named-grants for ANY active staff |
| **P1-F6** | `get_staff_permissions()` = raw role_permissions list (admin → 53 incl. `payments.create`, cashier → 21 incl. `payments.create`); used by **1** consumer (`/api/staff/[id]/detail`) | Live calls |
| **P1-F7** | **6 permission RPCs, 1 live, 3 runtime-broken.** `has_permission_v2`, `get_effective_permissions_v2`, `check_permission` all fail `HTTP 400 / 42703: column ep.code does not exist` (v2 code joins legacy `permissions.code`; catalog column is `key`), 0 consumers. `get_effective_permissions` 200-but-wrong, 0 consumers. **Only `has_permission` is consumed (13 sites) and correct.** | §4 matrix + live error captures |
| **P1-F8** | `/api/permissions/overrides` route reads `location_permission_overrides`, but its DELETE filter uses `role_id=eq.…` — **column does not exist on that table** (live cols: id, location_id, permission_id, is_granted, created_at) → override save would error/be no-op; and nothing in the app consumes these overrides into the gate | Source: `artifacts/saito-admin/src/app/api/permissions/overrides/route.ts`; live schema |
| **P1-F9** | No `expires_at` / `location_id` / `active` column on `staff_permission_overrides` (cols: id, staff_id, permission_key, is_allowed, reason, created_by, created_at) → "active/expired/location-scoped override" cannot exist even in principle; overrides are permanent, org-wide, allow/deny | Live schema |
| **P1-F10** | Owner role catalog gap stands: `roles × role_permissions` — owner (33/65) has `pos.use/pos.payment/pos.void/pos.discount` but **NOT** `payments.create/refund/void`, `cash.*` (0 of 7), `refund.approve`, `void.approve`, `reports.view`-family | Live `role_permissions` (owner id `9fd098d0…`) |
| **P1-F11** | Route gates (re-confirmed): `/api/orders/pay` → `requirePermission('payments.create')` ✓; `/api/orders/refund` → `payments.refund` ✓; `/api/orders/void` → **`requireAuth()` only** ⚠; `/api/orders/complete-payment` + `/api/order-payments` (legacy v1 path) → **`requireAuth()` only** ⚠ | Source |

## 2. EFFECTIVE PERMISSION MATRIX (as the LIVE GATE computes it — `has_permission()`)

Permission catalog: 65 keys = 44 LOCATION + 14 ORGANIZATION + 3 GLOBAL + 4 SELF scope.

| permission | owner (33 keys) | admin (53) | manager (53) | superadmin (62) | cashier (21) | waiter/host/kitchen/bartender/stock/accountant |
|---|---|---|---|---|---|---|
| pos.use / pos.payment | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | waiter ✓ use |
| **payments.create** (gate of `/api/orders/pay`) | **✗** | ✓ | ✓ | ✓ | ✓ | ✗ |
| payments.refund / payments.void | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| cash.open/in/out/view | ✗ | ✓ | ✓ | ✓ | ✓ (view/in/out/open) | ✗ |
| cash.close / cash.close.approve / cash.reopen | ✗ | ✓ / ✓ / ✓ | ✓ / ✓ / ✗reopen | ✓ / ✓ / ✓ | ✗ | ✗ |
| void.approve / refund.approve | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| pos.void / pos.discount / discount.create | ✓ / ✓ / ✓ | ✓ | ✓ | ✓ | ✓ / ✓ / ✓ | ✗ |

**Who can actually run production POS today (17 ACTIVE staff):** superadmin ×2, manager ×3, cashier ×6 → **all 11 hold `payments.create` → can take payments.** waiters ×4 (pos.use only) cannot. **owner: 0 staff — the owner catalog gap has ZERO live impact today** (no owner to block).

## 3. THE REAL P-1 ISSUES (re-prioritized)

1. **P1-F5/F7 — broken permission RPC zoo (P0-candidate for cleanup).** 6 permission-calculation RPCs exist; only `has_permission` is live-consumed and working. `has_permission_v2`, `get_effective_permissions_v2`, `check_permission` are **runtime-broken** (`42703 column ep.code does not exist` — v2 code still joins on the legacy `permissions.code` column while the catalog's current column is `permissions.key`) and have **0 app consumers**. `get_effective_permissions` "works" (HTTP 200) but emits NULL-code granted rows (12–36 per role) and misses all LOCATION-scoped grants — also 0 consumers. Decision: fix-or-retire the 5 broken/unused variants (retire = cheapest, they're dead), and make `has_permission` the declared SSOT.
   - **UNVERIFIED:** whether `has_permission()` enforces LOCATION scope (44/65 perms are LOCATION-scoped; active `sessions.active_location_id` is null for 318/319 sessions — single-active-location deployment today, so latent only). Needs `pg_get_functiondef` body read (direct 5432 gated from this machine; Supabase SQL editor).
2. **P1-F10 — owner role catalog gap (latent).** Not a blocker today (0 owner staff, P1-F3). If anyone is ever promoted to owner → instantly blocked from payments/drawer. Fix = seed `role_permissions` for owner (payments.create/refund/void + cash.* + approve gates). Low urgency, cheap, should be ratified before any owner-role assignment.
3. **P1-F1/F2/F9 — override mechanism is dead.** Tables exist (empty, no expiry/scoping columns), `has_permission()` ignores them, the only admin route that writes them has a broken DELETE filter (P1-F8). Either wire `staff_permission_overrides` into `has_permission()` (make it a real override layer: deny/allow, staff-scoped) or delete the tables + route (dead weight). No live data → no migration cost to retire.
4. **P1-F11 — authz bypass routes (kept as separate P-1 finding per instruction).** `/api/orders/void` + legacy `/api/orders/complete-payment` + `/api/order-payments` are `requireAuth()`-only. Any ACTIVE staff (incl. waiters with no payment perms) can reach void/legacy-pay endpoints; the DB-layer guards (finalized-order guard, KDS fns) still apply, but the RBAC gate is missing at the route level. Fix: `requirePermission('pos.void')` on void (approver override already inside), `payments.create` on the legacy pay routes — or retire the legacy routes if unreachable from UI.

## 4. LIVE RPC BEHAVIOR MATRIX (evidence)

| RPC | live arg signature | active manager `payments.create` | active cashier `payments.create` | disabled admin `payments.create` | **app consumers** |
|---|---|---|---|---|---|
| `has_permission` (GATE) | `(p_staff_id, p_permission)` + 2nd overload `(p_permission, p_token)` | **true** | **true** | false | **13 call-sites** (all route gates) |
| `has_permission_v2` | `(p_staff_id, p_active_role_id, p_permission_code)` | **HTTP 400 `42703: column ep.code does not exist` — runtime-broken for ALL staff/perms** | 400 | 400 | **0** |
| `get_effective_permissions` | `(p_staff_id)` | **false + 27 NULL-code "granted" rows (broken output)** | false + 12 NULL | false + 36 NULL | **0** |
| `get_staff_permissions` | `(p_staff_id)` | 53 keys incl. true (raw role list) | 21 keys incl. true | 53 keys | **1** (`/api/staff/[id]/detail`) |
| `check_permission` | `(p_staff_id, p_permission_code)` | false (source:"role") | — | false | **0** |
| `get_effective_permissions_v2` | `(p_staff_id, p_active_role_id, p_location_id)` | returns `{code:null,name:null,key:…}` rows — same broken join | — | — | **0** |

**Conclusion: the only live permission path in the entire app is `has_permission(p_staff_id, p_permission)` (role × active). Everything else is dead (0 consumers) and 3 of the 6 variants are runtime-broken (`42703 ep.code` — a `permissions` table column split: catalog has both legacy `code`/`name` and current `key` columns, and the v2-family RPCs still join on the old `code` column).**

> Probe-hygiene note: an earlier "all false / 404" batch was a **client-side bug in my probe wrapper** (double-wrapped JSON body → PostgREST `PGRST202` "parameter body"). Re-run with single-wrap body gives the results above. The all-false admin row is genuine: that admin staff row is `is_active=false` (disabled) and `has_permission` correctly returns false for disabled staff — and `validateAuth()` in the app would reject their session anyway.

## 5. DECISIONS NEEDED (no changes made, per instruction)

1. **SSOT decision:** which RPC is authoritative for (a) the route gate [keep `has_permission`], (b) admin UI display [fix or replace `get_effective_permissions`]? — requires reading `pg_get_functiondef('has_permission')` + `get_effective_permissions` bodies (SQL editor / 5432 from dashboard-egress box).
2. **Owner role:** ratify seeding owner `role_permissions` (payments.*/cash.*/approve) — 0 live impact today, cheap insurance.
3. **Override layer:** wire into `has_permission` (with `is_allowed` deny-wins semantics + optional expiry column) OR drop tables+route.
4. **Bypass routes:** gate `/api/orders/void` with `pos.void`/`void.approve` logic; gate or retire legacy pay routes.
5. **Location scope:** verify `has_permission` body enforces LOCATION-scoped perms against `session.active_location_id` (latent in single-active-location prod).

## 6. DEFERRED (explicitly out of P-1 scope, per instruction)

- 20/25 paid-without-`order_payments` reconciliation gap → **P-5/P-9**, needs ratified backfill decision.
- 16 stuck `pending` order_payments + 4 open `cash_drawer_sessions` → P-8/P-11.
- `payments`/`cash_drawer_log` legacy table disposition → P-9.

## 7. EVIDENCE ARTIFACTS

- `.audit-p1-probe.cjs` (probe battery; note: its `call()` helper double-wraps body — the corrected inline probes in this session's shell are the source of truth for §4)
- Live endpoints used: `/rest/v1/staff_permission_overrides`, `/rest/v1/location_permission_overrides`, `/rest/v1/staff?role_id=…`, `/rest/v1/role_permissions`, `/rest/v1/permissions`, `/rest/v1/sessions`, `rpc/has_permission`, `rpc/get_effective_permissions`, `rpc/get_staff_permissions`, `rpc/check_permission`.
