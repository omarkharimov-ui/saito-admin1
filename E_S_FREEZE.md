# 🔒 E/S — FROZEN (Staff/Shifts + Employees) — Final Validation Gate

**Date:** 2026-09-11 · **Module:** E (Employees) + S (Staff/Shifts/cash-drawer) · **A = FROZEN (read-only, 39/39 maintained)**

> Freeze is only issued when EVERY finding is FIXED + LIVE-PROVEN and the old broken
> implementations are proven unreachable. This document is the evidence record.

---

## GATE RESULTS (all live, real DB `jbxmlnsicbfkbsatnoej` + dev app :3000)

| Gate | Result |
|---|---|
| **E/S validation gate v2** (`.es-gate.cjs`) | **54 / 54 PASS** |
| **A regression** (`.a-regression.cjs`) | **39 / 39 PASS** (A read-only, unchanged) |
| Migration consistency (09–21) | file on disk + executed in `migrations` = all present |
| Residue (gate fixtures) | 0 after cleanup |
| Old-implementation reachability sweep (A1–A9) | all 9 PASS |

---

## FINDING-BY-FINDING (from `ES_FOUNDATION_CURRENT_STATE.md`)

| ID | Issue | Status | Live evidence |
|---|---|---|---|
| **S-01** | clock-in NOT NULL crash (`location_id`/`organization_id`) | ✅ FIXED + LIVE | mig `…000009`; shift `has_loc/has_org=t`, `NO_LOCATION_ASSIGNED` guard; E2E E4 clock-in success |
| **S-02** | time-clock IDOR (caller-supplied staff_id, no authz) | ✅ FIXED + LIVE | mig `…000010/11`; 6 `*_token` RPC (identity=`set_session_staff`, target=self OR `timeclock.override`); legacy uuid-identity RPCs **DROPPED**; X4 waiter→other = **403**; A1/A2/A3 sweep = 0 |
| **S-03** | PIN md5 vs PBKDF2 split (real staff couldn't clock-in) | ✅ FIXED + LIVE | mig `…000012`; md5 **removed from DB**; PIN verify in TS via A-frozen `verifyPin` (PBKDF2-260k); E2/E3 wrong/missing PIN = 401/400; A4 md5-in-S = 0 |
| **S-04** | overtime dead (no generator) | ✅ FIXED + LIVE | mig `…000014/17`; `calculate_shift_overtime` on close, day-tiered 8h/12h→1.5×/2.0×, week>40h→1.5× net, break deducted, location-local business_date, **advisory lock** (R8 parallel = 1 record), approval-lock (X9/R12 = 1 row) |
| **S-05** | timezone (0 fns used `AT TIME ZONE`) | ✅ FIXED + LIVE | mig `…000013` + `lib/timezone.ts`; `local_day()`; report_date/day/week location-local; discriminating proof (Pago Pago 09-10 vs UTC 09-11); DST 23h day correct; A5 = 0 |
| **S-06** | break RPC permission-less | ✅ FIXED (via S-02) | `start_break_token`/`end_break_token` self-or-override; X4 IDOR closed |
| **S-07** | `clock_out` closes all open shifts | ✅ ACCEPTED LOW / DEFENSIVE / NO ACTION | 1-open-shift guard (`trg_shift_no_overlap` + `clock_in*` reject) makes multi-open impossible; defensive close is safe |
| **S-08** | shift↔cash-drawer undefined + `open_cash_register` crash + `expected_cash=0` | ✅ FIXED + LIVE | mig `…000016/18`; user-frozen **1:1** bind; open crash fixed (loc/org from session); close derives `expected_cash` from **ledger SSOT**; auto shift-close; `cash_drawer_logs` revived; R4/R5 1:1 race = 1 win; E10 expected=350 derived |
| **S-09** | scheduled shift overlap not constrained | ✅ FIXED + LIVE | mig `…000015`; `btree_gist` exclusion constraint (atomic, raw-INSERT blocked); X7 DENY / X8 boundary ALLOW; R9/R10 race = 1 row / 0 overlap |

**E (Employees):** ~sound (it is the A-frozen layer: status/PIN/roles/locations/audit). No E-specific blocker; E consumes A read-only.

---

## NEW BUGS FOUND & FIXED DURING THE GATE (beyond S-01…S-09)

The gate's purpose is to prove the old broken code can't be reached **and** that the new code has no latent defects. It caught 5:

1. **G-1 (CRITICAL) — `start_break_token` inserted `shift_breaks` without `staff_id` (NOT NULL)** → **every break-start failed.** Fixed: set `staff_id`. (mig `…000021`)
2. **G-2 (authz) — `/api/time-clock/[id]/status` had NO authentication** → any client could read any staff's hours/break/OT. Fixed: `validateAuth` + self-or-`timeclock.override`. X5 = 401, X6 = 200. (route)
3. **G-3 (latent) — `start_break_token` used `currval('shift_breaks_id_seq')` but `shift_breaks.id = gen_random_uuid()` (NO sequence)** → even with G-1 fixed, break-start would crash on RETURN. Fixed: `RETURNING id INTO v_break_id`. (mig `…000021`)
4. **clock-out paths left `shifts.status='OPEN'`** while setting `closed_at` → `trg_shift_no_overlap` counted them open, **permanently blocking re-clock-in** (7 prod rows already inconsistent). Fixed: clock-out sets `status='CLOSED'` + one-time repair. Z10 = 0. (mig `…000019`)
5. **open-shift creation not serialized** → under READ COMMITTED, 2 parallel clock-ins could both insert (trigger count can't see uncommitted row). Fixed: `pg_advisory_xact_lock(hashtext(staff_id))` on the 3 open-shift insert paths. R1/R13 = 1 win. (mig `…000020`)

Also hardening: `calculate_shift_overtime` `pg_advisory_xact_lock` (R8), `clock_out*` refuse while a drawer is open (1:1 invariant on every close path), `open_cash_register` `unique_violation → DRAWER_ALREADY_BOUND` (clean, not 500).

---

## RE-AUDIT SWEEP — old implementations UNREACHABLE (all PASS)

- **A1** legacy uuid-identity clock/break RPCs (`clock_in/clock_out/start_break/end_break/clock_in_atomic/clock_out_atomic`) → **0 exist** (DROPPED, 0 source + 0 DB caller verified).
- **A2** old 4-arg `clock_in/out_token` with `p_pin` → **0** (md5 path gone).
- **A3** old `open_cash_register(numeric,text,uuid)` (caller `p_opened_by`) → **0**.
- **A4** `md5` in any clock/break/cash function → **0** (only the unrelated inventory data-hash `perform_stock_audit` remains, out of S scope).
- **A5** hardcoded `CURRENT_DATE` business-date in S clock/close fns → **0** (all location-local via `local_day`).
- **A6** `expected_cash = 0` hardcode in close paths → **0** (derived from ledger).
- **A7** TS legacy `p_pin`/`p_opened_by`/`rpc/clock_*` calls → **0** (only A-frozen `p_pin_banned` in staff-login, correctly excluded).
- **A8** all 6 time-clock routes (incl. status) authenticated → **yes**.
- **A9** no unauthenticated status/audit read → status 401, audit requires `timeclock.override`.

---

## RESIDUE AUDIT (production-wide, after gate)

- orphan shifts / orphan drawer(**new**, last 24h) / multiple open drawers per shift / shift-drawer mismatch / overlapping schedules / duplicate unapproved OT / open-break-no-shift / audit residue / cross-org leakage / closed-but-status-OPEN → **all 0** (Z1–Z10, Z2 split).
- **⚠ Business finding (NOT auto-fixed):** **3 PRE-EXISTING `cash_drawer_sessions` with NULL `opened_by`** (2 still OPEN, 1 CLOSED; dated 2026-07-26 / 2026-08-25, 17/33/2 ledger rows, real amounts 32₼/100₼+payments). These were created **before** S-08 (the old `open_cash_register` could persist NULL `opened_by`). My code always sets `opened_by` from `current_staff_id()` and adds **zero** new orphans (Z2 new=0). **These are abandoned cash drawers holding real money — closing/writing them off is a finance decision, not a code action.** Recommend: finance/manager to reconcile + close the 2 open drawers.

---

## MIGRATIONS / COMMITS (this E/S freeze)

| Migration | Scope |
|---|---|
| `20260911000009` | S-01 clock-in location/org resolve |
| `20260911000010` / `11` | S-02 token RPCs + DROP legacy |
| `20260911000012` | S-03 PIN → A-frozen verifyPin |
| `20260911000013` | S-05 timezone `local_day` + close paths |
| `20260911000014` / `17` | S-04 overtime generator + advisory lock |
| `20260911000015` | S-09 schedule overlap exclusion constraint |
| `20260911000016` / `18` | S-08 drawer 1:1 binding + clock-out drawer guard |
| `20260911000019` | shift close sets `status='CLOSED'` (+repair) |
| `20260911000020` | advisory lock on open-shift creation |
| `20260911000021` | gate fixes G-1/G-3 (break staff_id + RETURNING) |

Commits: `4fc5f9d` `96d28d2` `be09686` `875481b` `b805e73` `44b1da6` `5a1f0c9`(S-08) + gate hardening (17–21). (See `git log` for full SHAs.)

---

## FROZEN E/S CONTRACTS (for future reference / reopen conditions)

1. **Identity/authz:** every time-clock/cash action = token (A-frozen `set_session_staff`) + target = self OR `timeclock.override`. No caller-supplied identity.
2. **PIN:** PBKDF2-260k via A-frozen `verifyPin` in the TS route; DB never computes/stores a checkable PIN for clock (md5 gone).
3. **Timezone:** UTC storage; business day/week in `location.timezone` (multi-location safe, DST-aware).
4. **Overtime:** on close, `worked = actual − break`; day 8h→1.5× / 12h→2.0×; week >40h→1.5× net; location-local date; idempotent + approval-lock.
5. **Schedule:** planned overlap DENY (atomic exclusion constraint).
6. **Cash:** 1:1 shift↔drawer; open binds to the opener's open shift; close derives `expected_cash` from the ledger (SSOT) and auto-closes the shift; drawer-only close = manager (`cash.close`); no close path leaves a shift `status='OPEN'`.

**Reopen only if:** a real security vuln, data corruption, regression, or a frozen-contract defect is found (same bar as A — `AUDIT_A_FREEZE.md`).

---

## 🎯 VERDICT

> **🔒 E/S — FROZEN.** Every S-01…S-09 finding is FIXED + LIVE-PROVEN (S-07 accepted LOW/defensive). The E/S validation gate is **54/54**, **A is 39/39** (read-only, unchanged), the old broken implementations are **proven unreachable** (A1–A9 = 0), and 5 latent defects discovered during the gate were fixed and re-proven. The one outstanding item — 3 pre-existing abandoned cash drawers with NULL `opened_by` — is a **finance reconciliation decision**, not a code defect, and is flagged for the manager/owner.
