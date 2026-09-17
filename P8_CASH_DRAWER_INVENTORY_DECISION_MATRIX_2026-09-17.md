# P-8 — CASH DRAWER: LIVE INVENTORY + DECISION MATRIX (read-only, for ratification)

**Date:** 2026-09-17 · **Status:** AWAITING RATIFICATION · **Method:** live `pg_catalog`/function-body
inventory (pooler, SELECT-only) + repo scan of routes/hooks/components. **0 DB mutation, 0 code
change.** P-1..P-7 remain frozen; nothing here reopens them (P-7 cross-check in §6, incl. one
**new** finding T-3 that must be dispositioned as P-8, not P-7).
**Verification (2026-09-17):** independent adversarial audit → PARTIAL; 3 mandatory corrections +
3 notes applied (see §9 + `P8_PHASE1_VERIFICATION_2026-09-17.md`). Both P0s independently re-confirmed real.

---

## 1. Architecture map (what EXISTS today, live-verified)

Three-layer money model, one bridge trigger, four close paths:

```
shifts (114 rows; staff time + money fields: starting_cash / expected_cash / actual_cash / difference)
   │ 1:1 (partial unique cash_drawer_open_shift_1to1: ONE open drawer per shift)
   ▼
cash_drawer_sessions (6 rows; status TEXT CHECK('open','closed'); opening/closing/expected_balance, difference)
   ▼
cash_drawer_log (195 rows; LEDGER SSOT; type CHECK: cash_in|cash_out|payment|card_payment|voucher_payment|open|close)
```

Bridge (payment → drawer): **`trg_record_cash_payment`** on `orders` `AFTER UPDATE OF status`
`WHEN new.status='paid'` → `fn_record_cash_payment()` (secdef):
- skips `payment_method != 'cash'` (reads `orders.payment_method`);
- picks session: `SELECT id FROM cash_drawer_sessions WHERE status='open' ORDER BY opened_at DESC LIMIT 1` —
  **NO location / org / shift scope, NO row lock**;
- amount = `orders.paid_amount − orders.tip_amount`;
- inserts `cash_drawer_log (type='payment')` only. **Does not update `expected_balance`, does not touch
  `shifts`, no audit, no outbox.** Refund/void/reopen do NOT fire it (trigger is `→paid` only).

Writer inventory (live function bodies dumped 2026-09-17; scratch: `.p8-audit/fns.txt`, `fns2.txt`):

| Writer | Route (production) | Identity | Lock | Writes | Idem | Audit | Outbox |
|---|---|---|---|---|---|---|---|
| `open_cash_register(p_token,…)` | `POST /api/cash-drawer {action:open}` → `cash.open` | session token (A-frozen) | `shifts` FOR UPDATE | `cash_drawer_sessions` + `shifts.starting_cash` + `cash_drawer_log('open')` | unique open-drawer/shift backstop (Q10) | `log_audit` | — |
| `close_cash_register_v2(p_session_id,…,p_manager_id,p_performed_by)` | `POST /api/cash-drawer {action:close}` → `cash.close` | **`p_performed_by`/`p_manager_id` = client args (role-checked only)** | `cash_drawer_sessions` FOR UPDATE → `shifts` FOR UPDATE | session close + ledger('close') + bound shift close + **legacy `cash_drawer_logs`('close_day')** + overtime | natural (status check) | `log_audit` ×2-3 | — |
| `cash_in_atomic` / `cash_out_atomic` | `POST /api/cash-drawer {action:cash_in/cash_out}` → `cash.in`/`cash.out` | **`p_performed_by` client arg (unverified)** | session FOR UPDATE | ledger row | **none** | `log_audit` | — |
| `recalculate_cash_session` | **no app caller (dead in app)** | — | session FOR UPDATE | `expected_balance` (snapshot; formula ≠ close's) | n/a | — | — |
| `reopen_cash_register` | **no app caller (dead in app)** | **`has_permission(p_performed_by,'cash.reopen')` — p_performed_by client-supplied** | session FOR UPDATE | session reopen + **new 'open' ledger row** | natural | `log_audit` | — |
| `clock_in_atomic_token` | `POST /api/shifts` → `cash.open` (+ `POST /api/pos/staff/clock` self) | session token + `timeclock.override` | advisory(staff) + staff/shift FOR UPDATE | `shifts` INSERT | trigger no-overlap | `log_audit` | — |
| `clock_out_atomic_token` | `PATCH /api/shifts` → `cash.close` (+ pos/staff/clock self) | session token + override | staff/shift FOR UPDATE; drawer check **unlocked** | shift close + overtime | natural | `log_audit` | — |
| `auto_clockout_staff` | `POST /api/cron/auto-clockout` (CRON_SECRET) | **none** | **none (no FOR UPDATE)** | closes shifts >12h, `auto_closed=true` | natural | **none** | — |
| `force_clock_out` | `POST /api/staff/force-clock-out` → `timeclock.override` | `p_performed_by` client arg | none | shift + break + **drawer `status='force_closed'` → violates CHECK constraint → whole fn errors** | natural | `log_audit` | — |
| `close_shift(p_token,…)` / `close_shift_atomic` / `open_shift` / `close_cash_register(v1)` | `close_shift_atomic` only via `POST /api/shifts/live` (**no route auth**); v1 via **browser hook** `useReports.closeCashRegister` | v1/atomic: **none token-based (v1)** / token (close_shift) | shift FOR UPDATE | shift close (+v1: broken cols) | natural | mixed | — |
| `start/end_break_token` | `/api/time-clock/[id]/break` + `/api/staff/clock` | session token + override | **none** | `shift_breaks` + `time_clock_entries` + `time_clock_audit` | none | none | — |
| `create_reconciliation` / `get_reconciliation_summary` | `POST/GET /api/cash/reconciliation` → `cash.view` | client args | none | **`cash_reconciliations`/`denomination_counts` TABLES DO NOT EXIST → broken**; `v_reconciliation_id` used before assignment | n/a | none | — |
| `submit_shift_review` / `approve_shift_review` | `POST /api/shifts/review` → `requireAuth` (any role) | client/self | none | **`ON CONFLICT (shift_id) WHERE review_status='pending'` → no matching partial unique index → broken** | n/a | none | — |
| `get_z_report` | browser `supabase.rpc` (useReports) | anon EXECUTE? no — authenticated EXECUTE | none (read) | — | — | — | — |

Readers: `get_live_shifts`, `is_shift_active` (**global, no scope**), `get_shift_detail` (reads legacy
`audit_logs`), `get_shift_audit_log`, `get_staff_shifts`, `get_time_clock_status`, `get_reconciliation_summary`,
`get_role_specific_metrics`, `get_staff_directory(_v2/_v3)`, `get_staff_kpis` (drawer-table reads;
verification-added). Route completeness (verification, 2026-09-17): legacy LIVE writers
`/api/time-clock/[id]/clock-in` + `/clock-out` (via `clock_in_token`/`clock_out_token`) and sibling read
routes `/api/time-clock/[id]/status|audit|breaks|breaks/adherence|overtime`, `/api/finance/close-day`,
`/api/cron/tip-shortfall`, `/api/cash/reconciliation/[id]`.

Related tables: `cash_registers` (3 rows, hardware), `cash_drawer_logs` (7 rows, **legacy snapshot**,
no FKs), `shift_breaks` (2), `shift_reviews` (16), `shift_swap_requests` (0, FK → `schedule`),
`overtime_records` (1), `overtime_thresholds` (3), `time_clock_entries`/`time_clock_audit`, `daily_reports`.

## 2. Permissions (live `role_permissions`, word-scan `cash|shift|drawer|register|overtime|reconcil|clock`)

- `cash.open` / `cash.in` / `cash.out` / `cash.view`: admin, cashier, manager, owner, superadmin
- `cash.close` / `cash.close.approve`: admin, manager, owner, superadmin (**cashier cannot**)
- `cash.reopen`: admin, owner, superadmin (**no manager**)
- `own.shifts`: ALL 9 roles (incl. kitchen/host/bartender/waiter) — **unused by any route**
- `timeclock.use`: all 9 · `timeclock.override`: admin/manager/owner/superadmin
- `shiftswap.manage`: owner/superadmin · `invoices.reconcile`: admin/owner/superadmin

## 3. Findings & decision rows

Severity: **P0** = unauth/any-role can mutate money or close state · **P1** = spoofable identity /
reconciliation-breaking / cross-location · **P2** = inconsistency, dead code, hygiene.

| # | Sev | Finding (evidence) | Recommendation | Phase |
|---|---|---|---|---|
| **D-1** | P1 | **Unscoped drawer selection.** `fn_record_cash_payment`: `WHERE status='open' ORDER BY opened_at DESC LIMIT 1` — no loc/org/shift. LIVE PROOF: 4 orphan open sessions; `4d5aa595` (opened 2026-09-11 by E/S fixture `G2mtwuj3zt_CASH`, shift `1b49757b`) holds **138 `payment` rows = 12,900.00 ₼**; `ab751905` 32 rows/736.00; `ca90e940` 15 rows/264.78; `a0ff4659` (fixture `ESGmtwse8zs_CASH`, shift `234ad6bc`) 0 payment rows (ledger = opening float 50 only). *(session ids verification-corrected 2026-09-17)* `/api/cash-drawer` GET returns the same global newest-open session. | Session pick scoped by `location_id + organization_id` (from the paying order's location), and only `shift_id`-bound-or-location sessions; no matching open session → **no ledger row** (documented skip, no silent global booking). Route GET: location filter + `cash.view`. | P-8 |
| **D-2** | P1 | **Orphan-open drawers + missing guards.** `auto_clockout_staff` closes shifts >12h with **no drawer guard, no FOR UPDATE, no audit** → the 3 open fixtures' shifts (22:05/23:05 closes) went CLOSED while drawers stayed OPEN forever. `clock_out_atomic_token`/`close_shift` have the guard; `force_clock_out`/`auto_clockout` don't. All 6 live sessions are fixture/legacy (openers `ES*_CASH`/`G2*_CASH`, still ACTIVE; 2 have NULL opened_by) — **no real production drawer flow ever ran**. | (a) `auto_clockout_staff`: skip shifts with an open bound drawer (or guard like close_shift) + FOR UPDATE + audit row; (b) data repair (ratified): close the 4 orphan open sessions via `close_cash_register_v2` with `actual_cash = computed expected` (diff 0) + note `P-8 orphan repair`, or a dedicated ratified repair — decision below; (c) the 138+47 leaked `payment` rows are historically mis-attributed → document as **P-9 reconciliation residual** (do not back-delete ledger rows — immutability ground rule). | P-8 |
| **D-3** | P1 | **Cash refund/void/reopen invisible to drawer ledger.** Trigger fires only `→paid`. `cash_drawer_log.type` CHECK has **no refund/void type**. A cash-paid order refunded 60 → physical cash leaves the drawer but ledger never records it → `expected_balance` overstated at close. | Add `refund` (+`void`) to the CHECK; extend trigger (or add sibling triggers) on `→refunded`/`→partially_refunded`/`→voided` and on `reopen_order_atomic` full reversal, booking only when the refunded/voided money was CASH (per `order_payments.method`/refund `p_method`), location-scoped per D-1. | P-8 |
| **D-4** | P1 | **Four divergent expected-cash formulas.** close v2: `+(cash_in,payment,open) −(cash_out,close)` from ledger; `recalculate_cash_session`: `+(payment,cash_in,card_payment,open) −(cash_out)` (**counts card as cash!**); `close_shift_atomic`: `starting_cash + expected_cash`; `get_z_report`: `prev_report.actual_cash + cash_total − expenses`. LIVE DRIFT: `ca90e940.expected_balance=140.00` vs its ledger sum under recalc formula = **354.78** (snapshot stale). **Reopen double-count**: `reopen_cash_register` inserts a second `open` row → close v2 sums opening float twice. | Single canonical formula = close v2's ledger walk (documented); `recalculate_cash_session` rewritten to it (or REVOKE + dead); reopen: insert a **signed `reopen` reversal row** (−previous close) or recompute from ledger excluding superseded close (decision below); `get_z_report` stays report-only (its formula is a *reporting* definition — document, don't unify). NOTE (verification): `cash_drawer_log.amount` CHECK enforces `amount >= 0` → a *signed* reversal row needs the CHECK relaxed/extended (fold into the Q2 decision). | P-8 |
| **D-5** | P1 | **Client-supplied approver identity.** `POST /api/cash-drawer {action:close}` passes `body.manager_id` straight to `close_cash_register_v2`; RPC checks the manager has a manager role + is_active — **not that it is the authenticated principal, not same org/location**. UI does PIN-verify via `/api/auth/verify-pin` (second layer), but the API is directly callable with a guessed active manager uuid by any `cash.close` holder. | RPC: add `p_manager_token` (manager's own session, validated server-side) OR keep PIN path and make the route derive `manager_id` only from a fresh verify-pin server call (drop `body.manager_id`); add same-org check. | P-8 |
| **D-6** | P1 | **No CSRF on any P-8 write route** (`cash-drawer` POST, `shifts` POST/PATCH, `cash/reconciliation` POST, `staff/force-clock-out`, `shifts/review`, `time-clock/[id]/break`, `staff/clock`) while P-4..P-7 money routes use double-submit CSRF. | Add `validateCsrfToken` to all P-8 write routes (P-4 pattern). | P-8 |
| **D-7** | P0 | **Direct-RPC exposure (EXECUTE grants).** anon: `close_cash_register_v2`, `open_cash_register`, `open_shift`, `close_shift`, `clock_in/clock_out_token`, `clock_in/clock_out_atomic_token`, `calculate_shift_overtime`, `get_overtime_summary`. authenticated (no token arg → client-identity writers): **`cash_in_atomic`, `cash_out_atomic`, `close_shift_atomic` (client-supplied `p_actual_cash`!), `reopen_cash_register` (permission checked against client-supplied `p_performed_by`!), `create_reconciliation`, `approve_shift_review`, `force_clock_out`, `close_cash_register` v1, `request/respond_shift_swap`, `submit_shift_review`**. *(verification-corrected: `recalculate_cash_session` is already service-only; `log_audit` also carries authenticated EXECUTE — spoofable audit rows, noted.)* Chain proof: any staff → GET `/api/cash-drawer` (requireAuth only) → `session_id` → browser `supabase.rpc('cash_in_atomic', {p_session_id, p_amount, p_performed_by: <anyone>})`. | S-4a-class **REVOKE anon EXECUTE** on all drawer/shift fns; **REVOKE authenticated EXECUTE** on every tokenless writer (keep only for secdef fns that take `p_token` and enforce identity); `reopen_cash_register`/`cash_in/out_atomic`/`recalculate`: require `p_token` (A-frozen identity pattern). Keep service_role + postgres. | P-8 (S-4a scoped exception, ratified here) |
| **D-8** | P2 | **Broken fns (latent landmines).** `close_cash_register` v1 → UPDATEs non-existent `shifts.manager_approved/manager_id` (called by `useReports.closeCashRegister` in reports UI → currently 500s); `create_reconciliation` → `cash_reconciliations`/`denomination_counts` **tables don't exist** + `v_reconciliation_id` used before assignment; `get_reconciliation_summary` → same missing table; `end_break_token` → `shift_breaks.is_compliant/violation_reason` columns don't exist (crashes on >30min unpaid break); `force_clock_out` → `status='force_closed'` violates `cash_drawer_sessions_status_check` (fn errors whenever the staff has any open drawer); `submit_shift_review` → `ON CONFLICT (shift_id) WHERE review_status='pending'` has no matching index (always errors); `close_day_atomic` → `shifts.report_id` column doesn't exist (verification note: `operation_logs(action,old_values,new_values,…)` DOES exist — breakage is `report_id` only). UI: `admin/shifts/page.tsx:69` calls `/api/shifts/[id]/close` — **route does not exist (404)**. | Per-fn decision (ratify individually): fix / REVOKE+document-dead / drop. Defaults proposed: v1 close → REVOKE anon/auth + retire (UI switch to v2 route); reconciliation trio → fix only if the feature is wanted (else REVOKE); end_break compliance cols → drop the branch; force_clock_out → fix guard to use close_cash_register_v2 or REVOKE; submit_shift_review → add the partial unique index (feature is live UI); close_day_atomic → REVOKE (client-authoritative amounts = ground-rule #1 violation). | P-8 |
| **D-9** | P0 | **S-4a-class RLS exposure (missed by S-4a).** `shift_reviews`: RLS **OFF**, `authenticated` full DML, `anon` SELECT. `tip_shortfalls`: RLS **OFF**, `authenticated` full DML, `anon` SELECT. `time_clock_entries` + `time_clock_audit`: RLS ON but policy **`Allow all for authenticated` TO `{public}` ALL = true** → **anon INSERT/UPDATE/DELETE on timeclock entries** (shift-hours tampering). | Enable RLS + location/org-scoped policies (shifts pattern) on `shift_reviews`/`tip_shortfalls`; replace the `{public}` ALL policies on `time_clock_*` with service-role-only + authenticated location-scoped SELECT; REVOKE anon DML grants (S-4a pattern). | P-8 (S-4a scoped exception, ratified here) |
| **D-10** | P1 | **No location binding on drawer writes.** close/cash_in/cash_out take a client `session_id`; RPCs never verify `session.location_id/org` == actor's session loc/org (P-1 M2 pattern absent). Cross-location close by id-guessing is possible for any `cash.close` holder. | Add org/location equality check in the 4 drawer writers (session row vs `current_org_id()`/`app.current_location_id` from `p_token`) — P-1 frozen pattern. | P-8 |
| **D-11** | P1 | **No idempotency on drawer money moves.** cash_in/cash_out/close: double submit = double ledger row (P-4 pattern absent). | `payment_idempotency_keys` namespace `drawer` (P-4 frozen mechanism) for cash_in/cash_out/close. | P-8 |
| **D-12** | P2 | **No outbox events on the entire drawer/shift surface** (only `deactivate_location_atomic` among them emits). Ground rule #2: every mutation = audit + outbox. | `emit_outbox_event` for open/close/cash_in/cash_out/shift open/close (metadata-scoped, P-1 pattern). | P-8 |
| **D-13** | P2 | **No drawer state-machine guard.** `cash_drawer_sessions.status` = CHECK only; `open→closed→open` (reopen) allowed by any caller reaching the row; no BEFORE trigger equivalent to P-2's order guard. | BEFORE trigger: legal transitions `open→closed`, `closed→open` (reopen via trusted `app.drawer_reopen` flag set by the RPC), `closed→closed` blocked; else RAISE (P0001). | P-8 |
| **D-14** | P2 | **Three audit surfaces mixed.** `log_audit`→`audit_logs_canonical` (v2, clock in/out), `operation_logs` (open_shift, close_shift, deactivate), legacy `cash_drawer_logs` dual-write in close v2 ('close_day'), `get_shift_detail` reads legacy `audit_logs`. | Keep canonical+outbox as P-8 norm for all NEW writes; the v2 legacy dual-write = **document-keep now, structural strip in P-9** (D-Q4/D-Q6 ratified pattern). | P-8/P-9 |
| **D-15** | P2 | **Parallel shift-open paths.** `open_shift` (operation_logs, `local_day` report_date, no DB permission) vs `clock_in_atomic_token` (log_audit, default `CURRENT_DATE`, override perm) vs legacy `clock_in_token`/`clock_in_atomic_fixed`. Two different report_date semantics (server tz vs location tz). | Production writer = `clock_in_atomic_token` only; align its `report_date` to `local_day(now(), v_loc)` (D-16); REVOKE `open_shift`/`clock_in_token`/`clock_in_atomic_fixed`/`clock_out_token` (legacy anon+auth writers; verification-corrected) from anon/authenticated (keep service). | P-8 |
| **D-16** | P2 | **report_date timezone** — see D-15 (fix: `local_day`). | — | P-8 |
| **D-17** | P2 | **Global `settings` row** (1 row): `payment_cash=t, cash_close_variance_threshold=0, cash_close_manager_required=f`. Threshold 0 ⇒ **every non-zero variance requires manager approval** (current effective policy — confirmed working via v2). Not org-scoped. | Document as current policy; org-scoping deferred (single-org today). | document |
| **D-18** | P2 | **auto-clockout invocation mismatch.** `/api/cron/auto-clockout` requires `Bearer CRON_SECRET` but the path is behind the `saito_token` **cookie** middleware (not in PUBLIC_PATHS) → an external cron without a staff cookie gets 401 at the edge; yet 40 shifts are `auto_closed` ⇒ it is being invoked some other way (direct RPC? cookie?). | Ratify the intended trigger: (a) add `/api/cron/*` to PUBLIC_PATHS (secret-gated) — recommended, or (b) pg_cron. Verify current caller first (read-only). | P-8 (decision) |
| **D-19** | P2 | **`active_role_id` spoofing.** `POST /api/pos/staff/clock` accepts client `role_id` → raw service-role PATCH `shifts.active_role_id` (no check the role belongs to the staff), `.catch(()=>{})` swallows. | Validate `role_id ∈ staff's role(s)` server-side (or derive) before PATCH. | P-8 |
| **D-20** | P2 | **P-7 gate residue (data, not contract).** 6 zero-amount `cash_drawer_logs` 'close_day' rows (2026-09-14/15, shifts `c4811bbd…b2a57fdb` deleted by P-7 cleanup; table has no FK → orphans). P-7 cleanup's 10-surface list omitted the legacy table. | Delete the 6 orphan rows (ratified data hygiene — does NOT reopen P-7 contracts). | P-8 data |
| **D-21** | P2 | **Grant hygiene.** anon+authenticated full-DML grants on `time_clock_entries`, `time_clock_audit`, `daily_reports` (RLS ON, policy service-only ⇒ currently blocked, but grants wider than S-4a posture). `test_rls_role` DML on `shifts`/`cash_drawer_sessions`. | REVOKE anon DML (S-4a pattern); drop/revoke `test_rls_role` grants if the role is dead. | P-8 data |

## 4. Invariant & atomicity matrix (target state after P-8)

| INV | Statement | Now |
|---|---|---|
| INV-1 | ≤1 open drawer per shift (partial unique) | ✅ holds (Q10) |
| INV-2 | A shift cannot close while its bound drawer is open | ⚠️ holds for clock_out/close_shift; **violated by auto_clockout & force_clock_out** |
| INV-3 | `expected_balance` = canonical ledger walk (single formula) | ❌ 4 formulas + reopen double-count + stale snapshots |
| INV-4 | Every cash payment books to exactly ONE location-scoped open session; none → no row | ❌ global newest-open (138 rows leaked to fixture session) |
| INV-5 | Cash refund/void/reopen books a ledger reversal | ❌ missing (no type, no trigger) |
| INV-6 | Drawer close atomic (session+shift+ledger+audit, 1 txn); double-close impossible | ✅ holds (v2) |
| INV-7 | Approver identity = authenticated principal, same org | ❌ client uuid, role-only check |
| INV-8 | Every drawer/shift mutation → audit + outbox | ⚠️ audit partial, outbox absent |
| INV-9 | No anon/authenticated direct-RPC path to money writers (token-bound identity) | ❌ D-7 grant matrix |
| INV-10 | `report_date` = location business day | ⚠️ split between the two open paths |

## 5. Concurrency / TOCTOU plan (→ `.p8-gate.cjs` battery, T-1..T-8)

- **T-1 open ∥ open (same staff, 2 tokens):** serialize on `shifts` FOR UPDATE; loser = `DRAWER_ALREADY_BOUND` (Q10 unique backstop). Expect: 1 session, 1 ledger 'open'.
- **T-2 close v2 ∥ cash_in (same session):** session FOR UPDATE serializes; loser = `Session is not open`. Expect: ledger +1 exactly if in-flight before close lock, else 0; expected_balance consistent with final ledger.
- **T-3 close v2 ∥ in-flight CASH PAYMENT (orders→paid) — NEW vs P-7 surface.** Trigger picks the session **without a lock**; close v2 reads the ledger **while holding** the session lock. Interleaving: close reads ledger → payment tx commits (row inserted post-read) → close commits ⇒ **orphan 'payment' row on a closed session, expected_balance stale**. P-7's battery tested close_SHIFT ∥ pay (045), not close_DRAWER ∥ pay-trigger — this is a **new P-8 finding on a P-7-adjacent surface** (the trigger `trg_record_cash_payment` is part of the 045 boundary contract; per P-7 freeze rule it is dispositioned here as a P-8 regression report, not by reopening P-7). Fix candidate: trigger does `SELECT … FOR UPDATE` on the chosen session (blocks until close commits → sees 'closed' → skips) ⇒ race closes atomically.
- **T-4 double close (2× v2):** 2nd = `Session already closed` (natural idempotency).
- **T-5 clock_out ∥ close v2 (same shift's drawer):** clock_out locks shift first, drawer check unlocked; close v2 locks drawer then shift. Verify: no deadlock (clock_out takes no drawer lock ⇒ no 2-cycle), final state consistent (shift closed once; drawer either closed or still open per lock order).
- **T-6 auto_clockout ∥ clock_out (12h shift):** lost-update window (no FOR UPDATE in auto). After fix (D-2): serialized; single close; `auto_closed` flag accurate.
- **T-7 recalculate ∥ close:** both lock session ⇒ serialized; post-state `expected_balance` = close's value (close last-wins is acceptable, document).
- **T-8 break start ∥ break end (same shift):** no locks today ⇒ TOCTOU on 'active break'; low money impact (overtime only). Decide: fix with FOR UPDATE or document-accept.

Classification discipline = P-7: PASS / EXPECTED-CONFLICT / REAL-RISK / HARNESS-FAILURE; relational
final-state asserts; zero-residue teardown (extend the 10-surface residue check with `cash_drawer_log`
and `cash_drawer_logs` — D-20 proved the gap).

## 6. P-7 frozen-contract cross-check (no reopen)

- 045 boundary (close_shift ∥ pay) — frozen, unchanged; P-7 C-battery result stands.
- **NEW (T-3):** `trg_record_cash_payment` × `close_cash_register_v2` race — belongs to P-8 (drawer
  close surface); reported here, fixed (if ratified) in P-8; P-7 gate untouched.
- `orders.paid_amount` net-of-refunds / C-10 gross invariant — untouched by any D-row.
- P-7 writer surface (pay/refund/transition/seat/release/dismiss) — **none of these writes to the
  drawer surface directly**; the only P-7↔P-8 contact is the trigger on `→paid` (T-3) and the P-5
  paid-requires-record interplay (a `→paid` order books a drawer row even if no drawer exists — silent
  skip, D-1 fix keeps the skip but makes it scoped + logged).
- Residue: D-20 (6 legacy rows) — data hygiene only.

## 7. Proposed Phase-2 implementation scope (for ratification — nothing executes before GO)

**One migration** (P-4/P-5/P-6 pattern) + **route changes** + **data repair** + **`.p8-gate.cjs`**:
1. REVOKEs (D-7, D-8, D-15, D-21): anon EXECUTE on all drawer/shift fns; authenticated EXECUTE on
    tokenless writers (incl. `close_shift_atomic`, `clock_out_token`); anon DML on
    time_clock_*/daily_reports; test_rls_role grants.
2. RLS (D-9): enable + location policies on `shift_reviews`, `tip_shortfalls`; replace `{public}` ALL
   policies on `time_clock_*` with service + location-scoped.
3. `fn_record_cash_payment` rewrite (D-1, D-3, T-3): location/org scope, `FOR UPDATE` on chosen
   session, refund/void/reopen sibling triggers + `refund`/`void` CHECK types.
4. Formula unification (D-4): `recalculate_cash_session` = canonical walk; reopen reversal-row
   semantics; `force_clock_out` drawer branch fix (or REVOKE + route retirement).
5. Identity/location/idempotency (D-5, D-10, D-11): `p_token` on cash_in/out/recalculate/reopen;
   org/loc equality checks; `payment_idempotency_keys` namespace `drawer`; manager via verified
   session (p_manager_token) — route drops `body.manager_id`.
6. State guard + outbox + audit normalization (D-12, D-13, D-14).
7. `auto_clockout_staff` guard + lock + audit (D-2a); cron path decision (D-18).
8. Routes: CSRF on all P-8 write routes (D-6); `cash.view` on `/api/cash-drawer` GET + location
   filter (D-1); `/api/shifts/live` — add RBAC or retire (no UI caller found); fix
   `admin/shifts` dead close call (D-8); `active_role_id` validation (D-19); `end_break_token`
   compliance branch removal (D-8).
9. Data repair (ratified, audited, single txn): close 4 orphan open sessions (D-2b — exact
   actual_cash/note to be ratified); delete 6 P-7 legacy rows (D-20); `submit_shift_review`
   partial-unique index (D-8).
10. `.p8-gate.cjs` T-1..T-8 true-parallel battery (P-7 harness: warmup/healthGate/flake guards,
    `P8_ALL=1`, zero-residue incl. ledger surfaces) → full frozen reflow (A/E-S/F/O/K/P-1..P-7) →
    commit → freeze.

**Not in P-8 (deferred, listed for no silent pickup):** UX (principle: backend frozen first),
multi-location `settings` scoping (D-17), legacy-table structural strip `cash_drawer_logs`/
`audit_logs`/`payments` mirror (P-9), `get_z_report` reporting-formula unification (P-9/P-12),
reconciliation feature rebuild (D-8 decision), historical 138-row mis-attribution repair (P-9
reconciliation residual). **Final Supabase schema normalization (user-ratified boundary,
2026-09-17): `settings` decomposition, duplicate columns, legacy models — explicitly P-9 /
final normalization, NOT P-8; P-8 fixes only the cash-drawer contract.**

## 8. Open questions for ratification

Q1. D-2b orphan repair: close via `close_cash_register_v2` (actual = expected, diff 0, note 'P-8
orphan repair') — OK? Or leave 2 NULL-opened_by sessions (ab751905/ca90e940, Jul/Aug) closed-with-note
vs deleted (CHECK allows no delete — rows must be 'closed', never removed)?
Q2. D-4 reopen semantics: signed `reopen` reversal row vs exclude-superseded-close in the walk?
Q3. D-8 per-fn dispositions (proposed defaults above) — ratify as listed or override?
Q4. D-18 cron: PUBLIC_PATHS + secret (recommended) vs pg_cron — and verify current caller.
Q5. Reconciliation feature (`/api/cash/reconciliation` + CashReconciliation.tsx): fix-and-keep
(requires creating `cash_reconciliations`/`denomination_counts` + fixing the fn) vs retire (REVOKE +
hide UI) — which?
Q6. `/api/shifts/live`: add `cash.view` RBAC + keep, or retire (no UI caller found)?

## 9. Verification corrections (2026-09-17, applied)

Independent adversarial audit (`P8_PHASE1_VERIFICATION_2026-09-17.md`) → **PARTIAL**; applied:
1. D-1 session-id swap — 138 payment rows belong to `4d5aa595` (not `a0ff4659`).
2. D-7 grant list — removed `recalculate_cash_session` (already svc-only); added `close_shift_atomic`;
   noted `log_audit` authenticated EXECUTE.
3. D-15 / Phase-2 step 1 — `clock_out_token` added to the REVOKE list.
4. Missed routes added (legacy time-clock writers + read routes).
5. D-8 `operation_logs` claim corrected (columns exist; `close_day_atomic` breaks on `shifts.report_id` only).
6. D-4 — `amount >= 0` CHECK constraint noted against the signed-reversal option (Q2).
Overall: findings substantively sound; both P0s independently re-confirmed real.

## 10. Ratification (2026-09-17)

**Phase-2 = EXPLICIT GO.** Q rulings: **Q1=A** (4 orphan open sessions closed via
`close_cash_register_v2`, actual=expected, diff 0, fixture-repair note; ledger rows **NOT deleted**;
12,900.00 ₼ mis-attribution documented as P-9 reconciliation residual) · **Q2=A** (signed `reopen`
reversal row; `amount < 0` permitted ONLY for `type='reopen'`; ledger stays SSOT) · **Q3=matrix
defaults** (v1 `close_cash_register` REVOKE+retire; reconciliation trio RETIRE per Q5;
`end_break_token` compliance branch drop; `force_clock_out` drawer branch FIXED to v2 close
semantics; `submit_shift_review` partial-unique index ADD; `close_day_atomic` REVOKE) ·
**Q4=A** (`/api/cron/*` → PUBLIC_PATHS + CRON_SECRET; no pg_cron) · **Q5=B** (reconciliation
feature RETIRED in P-8: REVOKE + UI hide; rebuild = separate P-9/P-12 scope) · **Q6=A**
(`/api/shifts/live` retired/removed; `close_shift_atomic` no longer a client writer).
Sequence: the ratified 12 steps (REVOKEs → RLS → trigger rewrites → formula unification →
identity/idempotency/location → state guards+outbox → auto_clockout → route cleanup → Q1 data
repair → `.p8-gate.cjs` T-1..T-8 → full frozen reflow → P-8 FREEZE). Boundaries: **P-7 not
reopened; P-9 schema normalization not started; no silent scope additions; ledger immutability
preserved.**
