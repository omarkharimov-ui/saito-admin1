# E/S Cash-RPC Drift — Attribution & Live Path Audit (2026-09-13)

Scope (per user directive): **attribute + impact only, zero contract changes.**
P-3 untouched, P-4 not started. All evidence below is raw live output (pooler `psql` 6543,
live PostgREST, `git show` on HEAD `2a3152f`) + one committed E/S gate run (its own
zero-residue harness).

---

## VERDICT (TL;DR)

The recorded blocker **"E/S E4–E9: Expected 4 arguments, got 3 (cash_in_atomic) / 5-arg
(close_cash_register_v2)" does not reproduce on any live path.** Neither case A nor case B
from the original framing is the true state:

- **A (production path broken): FALSE.** Live E2E through the real
  `route.ts → PostgREST → DB` chain passed 54/54 (run 2026-09-13 21:48 UTC, this audit).
- **B (old overload still exists, gate fails on stale cache): FALSE.** `pg_proc` and the
  PostgREST schema cache **agree** — each function has exactly ONE signature, both leading
  with `p_session_id`. There is no old overload to be stale about.

**The real, evidence-backed findings are:**

1. **The HANDOVER/P-3 blocker text is stale relative to committed code.** It claims "the
   frozen E/S gate + `cash-drawer/route.ts` still call the old arg list" — but the committed
   gate (`f44b890`, 2026-09-11) and the committed route (since S-08 `16287a9`, actually since
   first wiring `b1e3e0e`/`b7fffb8`, 2026-08-26) **both send the full `p_session_id`-leading
   argument list**. No committed artifact in the repo contains an old-arg call.
2. **Provenance gap (the genuine "drift"): `cash_in_atomic` + `cash_out_atomic` exist live
   with ZERO committed migration creating them** (grep over every `*.sql` in both migration
   dirs = 0 mentions). The 2026-08-26 atomic batch (`b7fffb8`: "cash_in_atomic() /
   cash_out_atomic() / void_payment_atomic() …") was applied to the live DB by ad-hoc psql,
   never recorded in git. Direction of drift is **DB→git missing**, not git→DB changed.
3. **Latent (conditional) break — real but not live:** any future/external caller invoking
   `cash_in_atomic` with 3 named params (or `close_cash_register_v2` with 4) via PostgREST
   gets hard `PGRST202` (500). Reproduced below. Current app + all gates send full lists,
   so nothing hits this today. **On a fresh Supabase restore built only from committed
   migrations, these functions would not exist at all** → drawer in/out path dead. That is
   the concrete risk to fix.

---

## 1. Live DB RPC inventory (pg_proc, run 2026-09-13)

### 1.1 Overloads — exactly one each, `p_session_id` LEADING

```
cash_in_atomic            oid=31211  n=4  {p_session_id, p_amount, p_description, p_performed_by}
                                            uuid numeric text uuid   → jsonb, SECURITY DEFINER, owner postgres
close_cash_register_v2    oid=41152  n=5  {p_session_id, p_actual_cash, p_notes, p_manager_id, p_performed_by}
                                            uuid numeric text uuid uuid → jsonb, SECURITY DEFINER, owner postgres
cash_out_atomic           n=4  {p_session_id, p_amount, p_description DEFAULT NULL, p_performed_by DEFAULT NULL}
close_shift_atomic        n=4  {p_shift_id, p_actual_cash, p_reason DEFAULT NULL, p_performed_by DEFAULT NULL}
open_cash_register        n=3  {p_token, p_opening_balance, p_notes}
```

- **No 3-arg `cash_in_atomic`, no 4-arg `close_cash_register_v2`, no other overload of any of
  them exists live.** (The only other `close_cash_register` is the separate legacy v1,
  4-arg `{p_shift_id, p_actual_cash, p_notes, p_manager_id}` — different name, not an overload.)
- Defaults (from live `pg_get_functiondef`): `p_description` and `p_performed_by` are
  `DEFAULT NULL` on both `cash_in_atomic`/`cash_out_atomic` — so a 2-param SQL-level call
  `(p_session_id, p_amount)` resolves, but **PostgREST requires named params and only exposes
  the full 4-param signature** (see 1.3).

### 1.2 Function bodies (live)

`cash_in_atomic` = open-session check (`FOR UPDATE`) → positive-amount check →
`cash_drawer_log` insert (`type='cash_in'`) → `log_audit('cash_in', …)` → jsonb result.
No permission/location logic inside (identity carried in `p_performed_by`); authz is the
route's `requirePermission('cash.in')`. Matches the design documented in S-08 and the
b7fffb8 commit message.

### 1.3 PostgREST exposure (live resolution probe, service_role)

- Old 3-arg call `{p_amount, p_description, p_performed_by}` →
  `PGRST202: Could not find the function public.cash_in_atomic with parameters p_amount,
  p_description, p_performed_by … hint: Perhaps you meant to call the function
  public.cash_in_atomic(p_amount, p_description, p_performed_by, p_session_id)`.
- Old 4-arg call to `close_cash_register_v2` (without `p_performed_by`) → same PGRST202
  pattern, hint = full 5-param signature.

The hint shows the **schema cache itself holds the single full signature** → **NOT a stale
cache** (case B eliminated). The "Expected N arguments" class of error can only be produced
by a caller sending the wrong named-param set.

---

## 2. Git provenance — who changed the contract

**Nobody did. The committed history contains no signature change for these RPCs.**

Timeline (all `git show` verified at HEAD `2a3152f`):

| Date | Commit | State of `cash_in_atomic` |
|---|---|---|
| 2026-08-25 | `c42378d` | `close_cash_register_v2` created **already 5-arg, p_session_id leading** (migration `20260825100000_cash_register_close_audit.sql`, artifacts/) |
| 2026-08-26 | `5f8ccb1` | route cash_in/cash_out = **direct `cash_drawer_log` INSERT** (pre-atomic era) |
| 2026-08-26 | `b1e3e0e` / `b7fffb8` | "6 new atomic RPCs" — commit message introduces `cash_in_atomic()`, `cash_out_atomic()`. Route at `b7fffb8` **already sends `{p_session_id, p_amount, p_description, p_performed_by}`** (git show b7fffb8:route.ts L119-124) |
| 2026-09-11 | `16287a9` (S-08) | `close_cash_register_v2` DROP+CREATE **same 5-arg signature** (body: expected_cash from ledger SSOT, atomic shift close). Route unchanged (full list). |
| 2026-09-11 | `f44b890` (E/S frozen) | Committed `.es-gate.cjs` E8 sends `{action:'cash_in', session_id: drawerId, …}` via HTTP; L131 direct SQL is 5-arg. |
| 2026-09-12/13 | P-1 `9a4546d`, P-2 `1184b69`, P-3 `2a3152f` | **None of the three P migrations mention cash functions** (grep over the 3 migration files = 0 hits). P-3 bisection itself states "no P migration touches them". |

Decisive provenance checks:

- `grep -r "cash_in_atomic" artifacts/saito-admin/supabase/migrations supabase/migrations`
  over ALL committed `*.sql` → **0 matches**. No committed migration ever created
  `cash_in_atomic` (or `cash_out_atomic`).
- Sanity of the method: `open_cash_register` (same family) IS found in committed SQL
  (`20260826180000_close_ssot_bypasses.sql`, `20260911000016_s08_cash_drawer_binding.sql`).
- `git log --all -S "cash_in_atomic"` → only `b7fffb8` (2026-08-26), P-1/P-3 (message/report
  text only), never a migration file.

**Conclusion:** the live `p_session_id`-leading signature is the ORIGINAL signature from
2026-08-26. There was no "change" — there is a **missing migration record** for the
08-26 atomic batch applied to the live DB outside the migration pipeline.

---

## 3. Production caller chain (request → route → RPC)

`src/app/api/cash-drawer/route.ts` (HEAD, lines 79-124):

| action | permission | RPC | args sent | live signature | match |
|---|---|---|---|---|---|
| open | `cash.open` | `open_cash_register` | p_token, p_opening_balance, p_notes (3) | 3 | ✅ |
| close | `cash.close` | `close_cash_register_v2` | p_session_id, p_actual_cash, p_notes, p_manager_id, p_performed_by (5) | 5 | ✅ |
| cash_in | `cash.in` | `cash_in_atomic` | p_session_id, p_amount, p_description, p_performed_by (4) | 4 | ✅ |
| cash_out | `cash.out` | `cash_out_atomic` | same 4 | 4 | ✅ |

Frontend `CashDrawerPanel.tsx`: `handleCashMove` is guarded `if (!session || !cashAmount)
return` and always sends `session_id: session.id`; `handleCloseDrawer` guarded `if
(!session) return`. **The real user path cannot emit an old-arg call** — `session_id` is
structurally always present.

Only other call-sites in the repo: `.es-gate.cjs` L131 (direct SQL, 5-arg ✅) and the
historical artifacts/ migration (internal, 5-arg ✅). **No old-arg caller exists in any
committed file.**

---

## 4. Live functional probe (real production path, zero-residue)

Ran the **committed, frozen** `.es-gate.cjs` (no edits) against the live dev server
(localhost:3000) + live DB, 2026-09-13 ~21:48 UTC:

```
TOTAL 54 | PASS 54 | FAIL 0  — ALL GREEN
E7  drawer open → success + bound to shift (S-08 1:1)          PASS  {id:347cc561…, shift bound}
E8  cash movement (cash_in 150) → success                       PASS  {type:cash_in, amount:150, success:true, session_id:101d3145…}
E9  drawer close by MANAGER (cash.close) → success + shift auto-closed  PASS
E10 shift expected_cash DERIVED from ledger (350), status CLOSED   PASS  350.00|350|CLOSED
E13 cashier self-close drawer → FORBIDDEN (manager-only)          PASS  status=403
R4/R5 2x drawer-open/close races → exactly 1 success              PASS
Z1–Z10 residue sweep (production-wide)                            PASS (4 pre-existing abandoned drawers, known, pre-S-08)
```

Residue from this run verified independently afterward: `G2_staff=0, G2_shifts=0,
G2_sessions=0, new_open_drawers_10min=0`. The gate refreshed `.es-gate-report.json`; it was
restored via `git checkout --` (worktree back to committed state; only pre-existing
untracked `.audit-*` scripts remain).

**The production cash path works live, end to end, through the exact route that real users
hit.**

---

## 5. Reconciliation: where did "Expected 4 arguments, got 3" come from?

Facts (evidence above):
- The error class is real and reproducible **only with a hand-rolled 3-param PostgREST call**
  (§1.3) — nothing in the repo makes such a call.
- The E/S report committed **inside the P-3 commit `2a3152f` itself** is 54/54 green (run
  21:14 UTC); `24fefaf` ("re-verified green post-P-2") also committed 54/54.
- The P-3 commit message + HANDOVER.md (01:31 UTC) describe E4–E9 as failing on signature
  drift, and claim the gate+route "still call the old arg list" — which is false for every
  committed revision of both files.

Reconstruction (inference, marked as such): the "got 3" observation most plausibly came
from an **uncommitted, transient state** — either a hand-rolled probe/SQL variant used
during the P-3 bisection session, or a dev-server run against an interim (uncommitted)
route edit — and the summary text in HANDOVER was written from that observation. A dev
server serving a stale/intermediate route build is a documented pitfall of this repo
(route edits mid-session → stale Next manifest). It is **not attributable to any ratified
commit**, and it does not exist in the current live state.

What IS certain and worth recording: the P-3 bisection's operational conclusion stands on
its own (with P-3 triggers disabled, whatever the A/E-S failure was, it was identical →
P-3 not the cause). Only the **E/S characterization text** ("signature drift", "old arg
list") is unsupported by the evidence.

---

## 6. Disposition (no changes made — recommendations only)

### 6.1 Immediate (documentation, zero-risk)
- **Correct HANDOVER.md §P-3 blocker text**: replace "E/S signature drift / old arg list"
  with: "E/S live-verified 54/54 green on 2026-09-13 (this audit, §4); the 'Expected 4
  args' error was not reproducible from any committed caller; the residual action is
  migration provenance (§6.2)." Remove E/S from the "pre-existing blockers" list, or
  re-scope it to §6.2.
- A (O-1 `uuid:""` fixture, C-2 login/disable race) remains a **separate module-A
  investigation** — untouched by this audit, still queued.

### 6.2 Ratified fix (separate change, needs explicit go-ahead) — the actual gap
**Backfill the missing migration record for the 08-26 atomic batch** (cash family first):
1. `supabase/migrations/2026MMDD_cash_atomic_rpcs.sql` containing the **live**
   `CREATE OR REPLACE FUNCTION` bodies of `cash_in_atomic`, `cash_out_atomic`
   (`pg_get_functiondef`-captured), + `GRANT EXECUTE … TO service_role` + REVOKE from
   anon/authenticated (mirroring the S-08 house style).
2. Extend the same audit to the rest of the `b7fffb8` "6 atomic RPCs" batch — inventory
   every function listed in that commit message against committed SQL (this audit covered
   the cash pair; the full batch inventory is a P-4-adjacent item).
3. Gate it: the committed E/S gate (54/54) already covers the cash path end-to-end —
   re-run after the backfill to prove green-on-restore.

**Why this is the right fix and not an app change:** app + gate + live DB are already
mutually consistent; the only inconsistency in the system is git vs DB. Backfilling the
migration makes a fresh restore reproduce the live contract, and removes the only path by
which the cash drawer could actually break (rebuild / environment recreation).

### 6.3 Explicitly NOT doing (per standing rules)
- No signature changes, no app edits, no E/S gate edits.
- P-3 triggers/migrations: untouched. P-4: not started (idempotency audit will consume the
  §6.2 full-batch inventory as input).

---

## Evidence index
- §1 live pg_proc + function bodies: pooler 6543, 2026-09-13, `pg_get_functiondef` outputs above.
- §1.3 PostgREST PGRST202: direct service_role calls to `rest/v1/rpc/{fn}` (raw JSON captured).
- §2 `git show b7fffb8:route.ts` L119-124; `git show 16287a9` (S-08 full file); `git log --all -S`; grep over both migration dirs.
- §3 `artifacts/saito-admin/src/app/api/cash-drawer/route.ts` L79-124 (HEAD); `CashDrawerPanel.tsx` L96-154.
- §4 `.es-gate.cjs` run 2026-09-13 21:48 UTC, report 54/54 (restored to committed state afterward); residue re-check via live SQL.
- Committed green reports: `git show 2a3152f:.es-gate-report.json` (54/54, E8/E9 evidence) and `24fefaf:.es-gate-report.json` (54/54).
