## 12. S-1 / S-3 / S-8 READ-ONLY BLOCK — results (2026-09-14, post-ratification)

### S-1 — Reconstruction baseline (DONE)
`supabase/baseline_live_schema_2026-09-14.sql` (36,604 lines) committed = `pg_dump --schema-only`
of the live DB (154 `CREATE TABLE` + 437 `CREATE FUNCTION` + types/triggers/indexes), with an
explicit **reconstruction** header. It lives **outside** `supabase/migrations/` (not a migration
replay). H-1 is closed: the repo can now reconstruct the full live schema from scratch
(baseline file → then apply the P-1..P-6 deltas).

### S-3 — Table grant exposure (DONE, read-only)
`information_schema.role_table_grants` swept (2,194 grant rows). The exposure is far wider than
RLS alone suggested:

- **152 tables grant FULL DML to `anon`** (SELECT+INSERT+UPDATE+DELETE+TRUNCATE+TRIGGER+REFERENCES).
- **7 tables are `anon` SELECT-only**: `orders`, `order_items`, `products`, `reservations`,
  `reservation_tables`, `reservation_preorder_items`, `table_floors` — these are RLS-ON so the
  SELECT is denied for an unauthenticated caller (A-regression Z-3 confirms anon→0 rows on orders/tables).
- **`inventory_logs`** grants `anon` INSERT/TRIGGER (no UPDATE/DELETE) — an odd partial grant.
- **39 tables are BOTH anon-full-DML AND RLS-OFF** → anon can write live data via PostgREST.
  Non-empty among them (anon can corrupt): `staff_stats`(803), `v_closed_orders`(321),
  `labor_summaries`(110), `recipe_items`(60), `staff_metrics`(56), `current_stock`(34),
  `inventory_status`(34), `table_order_contract`(32), `migrations`(36), `shift_reviews`(16),
  `payment_idempotency_keys`(9), `payment_methods`(9), `reservation_tables_quarantine_2026_09`(8), …
- **9 tables are `authenticated`-only (NOT anon)**: `cash_drawer_log`, `cash_drawer_sessions`,
  `clock_events`, `payments`, `sessions`, `settings`, `shifts`, `staff`, `staff_public_view`.

**Class D, PRIORITY.** The grant model is "grant everything to anon + rely on RLS," but 41 tables
have RLS OFF, so the grants are live write holes. Cleanup (S-4 phase) should revoke anon DML on
RLS-off tables and/or enable RLS — NOT this phase.

### S-8 — SECURITY DEFINER audit (DONE, read-only)
324 definer functions. **All 324 have `search_path` PINNED** (`proconfig` non-empty on every one) —
the classic definer-escalation via an unpinned `search_path` is **not present**. Only 43/625 fns
re-check permission internally (the P-1..P-6 writers); the other definer fns are helpers/reached
via those. **Verdict: S-8 = no search_path escalation found; definer set is least-privilege on
search_path.** Residual risk is only the table-grant surface (S-3), not the definer fns.

### S-2 pre-condition (route exposure) — DONE (read-only)
`grep` across every route: **no settings route returns `admin_password`/`superadmin_password`/
`kitchen_password`/`smtp_user`/`smtp_pass`.** The code-comment claim ("secrets never exposed")
is now live-verified for the settings surface. S-2 (move to secrets + drop the 5 columns) can be
ratified in the cleanup phase. **No credential value is printed in this doc.**

## 13. STAFF LOGIN SURFACE — audit + fix (2026-09-14)

**Why the login was confusing:** the old **2–3 digit short codes are gone by design.** During the
A-freeze (commit `d84c20e`) the short seed PINs were **rotated to 4-digit PBKDF2** and `staff-login`
now hard-rejects anything that is not exactly 4 digits (`/^\d{4}$/`). So a remembered old short
code returns `401 Yanlış PIN` — it matches no hash and is the wrong length. That is correct behavior,
not a bug.

**Where the login state actually lives (verified correct table/column):**
| Concern | Table / column | Status |
|---|---|---|
| PIN hash | `staff.pin_hash` (`pbkdf2_sha256$260000$<salt>$<hash>`) | ✅ correct home, PBKDF2-260k |
| active flag | `staff.is_active` / `staff.status` | ✅ |
| rate-limit / lockout | `login_attempts` + `staff.failed_login_attempts` / `locked_until` | ✅ |
| session | `sessions` (token, `status` ACTIVE/REVOKED) | ✅ |
| audit | `security_events` + `audit_logs_canonical` | ✅ |
| banned defaults | `BANNED_PINS` in `staff-login` (0000/1111/1234/0001/2222) | ✅ |

**Live staff PIN coverage (exact):** 803 total staff, **53 active**; of those 53 → **50 have a valid
pbkdf2 hash** (can log in), **2 had `pin_hash IS NULL`** (could NEVER log in), **1 had a weak
non-pbkdf2 hash** (hard-rejected). 47 distinct PINs among the 51 with hashes (1 shared-PIN pair).

**Fix applied (this turn, the only DB change in the block):** the 3 un-authenticatable active staff
were **INACTIVATED** (F-contract: `is_active=false, status='INACTIVE'`, NOT deleted) and their **1
orphan `sessions` row REVOKED**. They were all test/stray residue (`edefdfas`, `Security Test`,
`GATE_T`) — zero references in any gate (verified). After the fix: **0 active staff left un-authenticatable.**

**Login verified healthy (live):** full `.a-regression.cjs` re-run this turn = **39/39 PASS**,
including **A03 correct-PIN → 200 + token**, A02 wrong-PIN → 401, A04 IP brute-force 429,
A07 banned-1234 → 401, A21/22 login audited. The superadmin login is the A-harness admin
(`4e25370a…`, PIN recorded in `.a-regression.cjs:87`), the test waiter is `bc2cda50…`
(PIN at `.a-regression.cjs:51`). **Both active, both valid pbkdf2, both able to log in.**

**Parallel login paths (noted, NOT changed — P-9 cleanup):** `staff-login` (canonical, used by the
`/staff/login` UI + `StaffLogin.tsx`) vs the legacy `pin-login` (4-digit, 24h session, **not called
by any UI** — an unused weaker parallel path) and `verify-pin` (4–6 digit, action-verification,
used by `PinGuard.tsx`/`CashDrawerPanel.tsx` for mid-session privileged actions — a different
purpose, not account login). `migrate-admin-pin` is already a 410 stub. Recommend: keep `staff-login`
as the single account-login path, freeze `pin-login` (unused, weaker) in cleanup.

### S-4b — settings secrets → env + drop, dead code removal, pin-login freeze (DONE 2026-09-14)

Ratified order (user): ref-scan FIRST, then drop. Executed:

1. **Reference scan (step 1/6, moved first per ratification):** 0 code/DB/UI references to the
   8 credential columns (only i18n label strings + a doc comment in settings-svc.ts; 0 fn/
   trigger bodies; 0 route exposure re-confirmed). **The set is 8 columns, not 5** — the
   sweep showed `smtp_host`, `smtp_port`, `smtp_from_name` alongside `smtp_user`/`smtp_pass`
   (email goes through Supabase Auth, not SMTP — `send-code` is the auth flow; all smtp_* dead).
2. **Values preserved** to `artifacts/saito-admin/.env.local` (gitignored, untracked) as
   `SETTINGS_LEGACY_*` (8/8 non-empty) BEFORE the drop. Values never printed to chat/logs.
3. **Migration `20260914000004`**: `ALTER TABLE settings DROP COLUMN` ×8. Post-verify:
   `credential cols remaining = 0`, settings still 1 row, 51 cols.
4. **Dead code removed**: `useReports.createExpense` (never called; anon-key write that S-4a
   would have broken) deleted; `fetchExpenses` (read) retained.
5. **`pin-login` FROZEN**: route now returns **410** with a pointer to `/api/auth/staff-login`
   (previously: no CSRF, no rate-limit/lockout, no audit, 1000-staff client-side scan).
   0 UI callers, 0 gate callers. Middleware PUBLIC_PATHS entry KEPT deliberately: the route
   is stateless now, and an anon 410 "use staff-login" beats a 401 redirect for old clients.
6. Live smoke: `pin-login → 410`; `POST /api/expenses` (unauth) → **401** (auth gate first,
   not a 500 — the createAuthClient() switch in S-4a is intact).
