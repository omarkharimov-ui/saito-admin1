# P-8 Phase-1 — Independent Verification Report (for oversight agent)

**Date:** 2026-09-17 · **Subject under audit:** `P8_CASH_DRAWER_INVENTORY_DECISION_MATRIX_2026-09-17.md`
(read-only cash-drawer inventory + decision matrix, Phase 1 of the P-8 module)
**Auditor:** independent adversarial verification agent (fresh context; read-only tools + SELECT-only psql
via pooler; 15 tool calls; **0 DB mutations, 0 repo modifications**).
**Auditor posture:** default suspicion that the inventory missed something; every claim re-checked against
live `pg_catalog` data or function bodies before acceptance.

---

## 1. Verdict per section

| § | Check | Verdict | Key evidence (auditor's own queries) |
|---|---|---|---|
| A | Evidence traceability (D-1..D-21) | **PARTIAL** | All P0 exposure claims reproduce: `cash_drawer_sessions status='open'` = **4 rows** (ab751905, ca90e940, 4d5aa595, a0ff4659); `proacl` re-run confirms `close_cash_register_v2` anon+authenticated EXECUTE, `cash_in/out_atomic` authenticated EXECUTE, `open_cash_register` anon EXECUTE; `pg_policies` confirms `shift_reviews`/`tip_shortfalls` RLS OFF, `time_clock_entries/audit` policies `Allow all for authenticated` TO `{public}`. **One factual error found:** the 138 payment rows (12,900.00) belong to session `4d5aa595` (opener 2127ae5d = `G2mtwuj3zt_CASH`, shift `1b49757b`), **not** `a0ff4659` as written in D-1/D-2b (that session has 0 payment rows; its 50.00 `expected_balance` = opening float only). |
| B | Writer-map completeness | **PASS** | Independent re-scan of ALL public fns + all triggers on `shifts`, `cash_drawer_sessions`, `cash_drawer_log`, `orders` matches the matrix; no omitted money writer. |
| C | Route completeness | **PARTIAL** | Two LIVE legacy writer routes missing from the matrix: `POST /api/time-clock/[id]/clock-in` and `/clock-out` (call `clock_in_token`/`clock_out_token`), plus sibling read routes `/time-clock/[id]/status`, `/audit`, `/breaks`, `/breaks/adherence`, `/overtime`, `/finance/close-day`, `/cron/tip-shortfall`, `/cash/reconciliation/[id]`. No new money writer, but they broaden the D-7 revoke surface (`clock_out_token` is a legacy anon+auth writer not on the D-15 revoke list). |
| D | Severity sanity (P0 framing) | **PASS** | Confirmed the anon exposure path is browser `supabase-js` → PostgREST RPC direct (NOT through the cookie-gated Next.js routes) — the matrix frames it correctly; middleware cannot block it. |
| E | P-7 freeze integrity | **PASS** | git log: only `4f6672c` (matrix) added after P-7 freeze `de21561`; no migrations; P-7 gate untouched; T-3 correctly classified as a NEW P-8 finding on the drawer-close surface, not a P-7 reopen. |
| F | Audit left no DB residue | **PASS** | 0 new rows in the last 24h across `cash_drawer_sessions`/`shifts`/`cash_drawer_log`; `log_audit` last row = 2026-09-16 23:11 (pre-audit). |
| G | Internal numeric consistency | **PASS** | 195 ledger rows = 185 payment + 6 open + 1 cash_in + 1 cash_out + 2 close (185 = 138+32+15 ✓); 6 sessions; 114 shifts; 7 legacy `cash_drawer_logs` = 1 real + 6 P-7 residue ✓. |
| H | T-3 TOCTOU analysis | **PASS** | Verified against live bodies: `fn_record_cash_payment` picks the session with NO `FOR UPDATE`; `close_cash_register_v2` locks the session, reads the ledger, then locks the shift — the orphan-row interleaving is real; the proposed fix (FOR UPDATE in the trigger) demonstrably closes the race. |

## 2. Mandatory corrections (3) — APPLIED to the matrix on 2026-09-17

1. **D-1 / D-2b session-id swap.** 138 `payment` rows / 12,900.00 ₼ → session **`4d5aa595`**
   (opener `G2mtwuj3zt_CASH`, shift `1b49757b`), not `a0ff4659`. `a0ff4659` (opener `ESGmtwse8zs_CASH`,
   shift `234ad6bc`) has 0 payment rows.
2. **D-7 grant list.** `recalculate_cash_session` REMOVED (auditor's proacl: anon=f, authenticated=f —
   already service-only; the matrix overstated). `close_shift_atomic` ADDED (authenticated EXECUTE, no
   token, client-supplied `p_actual_cash` — a real unbound writer). Note added: `log_audit` carries
   authenticated EXECUTE (spoofable audit rows).
3. **D-15 / Phase-2 step 1.** `clock_out_token` ADDED to the REVOKE list (legacy anon+auth writer;
   surfaced by the missed routes in C).

## 3. Non-blocking recommendations (3) — APPLIED as notes to the matrix on 2026-09-17

4. Add the missed routes (legacy time-clock writers + read routes) to the route list.
5. D-8: `operation_logs(action, old_values, new_values, …)` columns DO exist — `close_day_atomic` breaks
   only on missing `shifts.report_id`. (Matrix over-claimed.)
6. D-4 / Q2: `cash_drawer_log.amount` CHECK enforces `amount >= 0` → the "signed `reopen` reversal row"
   option requires relaxing/extending that CHECK — fold into the Q2 decision.

## 4. Overall verdict

**PARTIAL → corrections applied → matrix is now consistent with live evidence.**

- The two P0s (D-7 direct-RPC exposure incl. anon `close_cash_register_v2`; D-9 RLS holes incl.
  `{public}` ALL on timeclock tables) are **independently re-confirmed REAL** with quoted live evidence.
- The writer map, trigger map, invariant matrix, T-1..T-8 TOCTOU plan, and P-7 freeze boundary all held
  under adversarial re-check.
- No scope inflation: nothing in the matrix touches frozen P-1..P-7 contracts; T-3 is properly a new P-8
  finding.

## 5. State for oversight review

- Audited + corrected matrix: `P8_CASH_DRAWER_INVENTORY_DECISION_MATRIX_2026-09-17.md` (§9 = correction log).
- Raw evidence scratch: `.p8-audit/fns.txt`, `.p8-audit/fns2.txt` (live function-body dumps, 2026-09-17).
- Git: matrix committed `4f6672c`; corrections committed alongside this report; `main == origin/main`.
- **Still pending user ratification (unchanged):** D-1..D-21 decision rows, Phase-2 scope (§7), and
  open questions Q1–Q6 (§8). Phase-2 implementation must NOT start before explicit GO.
