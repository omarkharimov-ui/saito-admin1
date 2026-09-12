# K — KITCHEN / KDS — 🔒 FROZEN

**Date:** 2026-09-12 · **Frozen by:** K-gate session (G1→L4) · **Head:** `413a0c9`
**Status:** ALL GATES PASS · FULL REGRESSION GREEN · TREE CLEAN (reports committed)

The K (Kitchen / KDS) module is frozen. The hardening gates G1–G7, the K-3
concurrency battery, the L1–L4 cross-module lifecycle reconciliation, and the
full A/E/S/F/O regression suite all pass with live DB + server evidence.

---

## 1. What K is (frozen contract)

- **DB = SSOT.** All kitchen state lives in `orders.kitchen_status` +
  `order_items.kitchen_status` (+ `orders.status` for the service lifecycle).
  The KDS read-models are scoped, service-role-only functions.
- **Realtime = delivery layer only.** The `kds_ticket` outbox event is the
  canonical, location/station-scoped, dup-safe, replayable KDS event; the KDS
  poll is the security boundary; on reconnect/gap the client **resyncs from DB**.
  Raw `postgres_changes` (RLS-scoped since G1) is a non-security secondary wake.
- **4-way lifecycle separation.** `TABLE` (empty/occupied/reserved + `dirty`
  post-payment cleanup), `ORDER`, `KITCHEN/ITEM`, `SERVICE`, `PAYMENT` are
  separate lifecycles that derive/synchronize — never one state machine.
  Kitchen progression never redefines table occupancy.
- **Every KDS mutation** (browser or API) goes through a **server route** with
  session identity + server-trusted location + RBAC → service-role RPC. Raw
  browser → Supabase RPC for KDS = **0** (anon is 42501).

## 2. Gate results (live evidence, zero-residue probes)

| Gate | Contract | Result | Probe |
|---|---|---|---|
| **G1** | RLS: no anon policy on KDS tables; authenticated location-scoped | 🔒 | `.f-gate.cjs` (F 35/35) |
| **G2** | KDS read scope (0 cross-location rows) | 🔒 | `.o-gate.cjs` G2r |
| **G3/G4** | token-first canonical fns; location-scoped; svc-only; raw-PATCH cancel removed | 🔒 14/14 | `.k-g3g4-probe.cjs` |
| **G5** | `get_kitchen_queue`/`stats` location/org scope + service-role-only | 🔒 8/8 (anon 42501, cross-loc 0) | § G5 evidence |
| **G6** | `kds_ticket` outbox spine (scoped, dup-safe, resync) | 🔒 11/11 + 10/10 | `.k-g6-probe.cjs` / `.k-g6-delivery-probe.cjs` |
| **G7** | browser KDS mutations → guarded server route (transport-only) | 🔒 12/12 | `.k-g7-probe.cjs` |
| **K-3** | concurrency battery (2 surfaces) | 🔒 8/8 | `.k-k3-probe.cjs` |
| **K-3-6** | finalized-order guard on 4 legacy KDS fns | 🔒 (044) | `.k-k3-probe.cjs` K3-6 |
| **L2** | P0 "No location context" fix | 🔒 9/9 | `.k-l2-probe.cjs` |
| **L5** | O floor-sync → table stays occupied (Decision A) | 🔒 9/9 | `.k-l5-probe.cjs` |
| **L6** | D1 orphan repair (tables 8/401/402) | 🔒 (043) | migration + audit rows |
| **L3** | D3 "Dismiss table failed" root cause + fix | 🔒 8/8 | `.k-l3-probe.cjs` |
| **L4** | `dirty` invariants + full lifecycle + concurrency | 🔒 16/16 | `.k-l4-probe.cjs` |

## 3. Full regression (K freeze precondition)

| Module | Result |
|---|---|
| **A** (Auth) | **39/39** |
| **E/S** (Staff/timeclock) | **54/54** (Z10 restored by 045) |
| **F** (Floor/tables) | **35/35** |
| **O** (Orders) | **38/38** (QR1 stale-test fixed for 042 semantics) |
| **K** (this module) | all suites above green |

Build: `next build` exit 0, 270/270 static. `tsc --noEmit`: 0 errors (non-test).

## 4. Migrations (this session)

| Mig | Scope |
|---|---|
| `000038` | G5 — KDS read-models location/org scope + service-role-only |
| `000039` | G6 — `kds_ticket` outbox event scoped payload (location/station) |
| `000040` | G6 — `kds_ticket_poll` (scoped, dup-safe, resync-able) RPC |
| `000041` | G7 — fix `log_audit` arity in 2 KDS fns (exposed by wiring) |
| `000042` | L5 (Decision A) — `transition_order_atomic` floor-sync: table stays occupied |
| `000043` | L6 — D1 orphan repair (tables 8/401/402 → empty, evidenced) |
| `000044` | K-3-6 — finalized guard on 4 legacy KDS fns + remove KDS table writes |
| `000045` | E/S — `auto_clockout_staff` + `close_shift_atomic` set `status='CLOSED'` (Z10) |

## 5. Frozen-contract exceptions (all proven regressions, ratified)

- **O** `transition_order_atomic` 6c floor-sync (042) — the 13-state registry
  churn vs 3-state table data (39 silent `status_change_failed` + 3 stuck tables).
  Decision A: keep table `occupied`; NO `occupied→in_kitchen/ready/...` edges added.
- **O** `complete_payment_atomic` `dirty` write — **preserved** (Option 1),
  reclassified as a post-payment cleanup state (L4).
- **O** create/send location resolver (L2) — server-derived single-location-
  with-data fallback (mirrors read path); genuinely multi-location orgs still
  fail closed.
- **F** DATA repair only (043) — no F contract change.
- **E/S** close-path status (045) — completes migration 019's intent.
- **K** legacy KDS fns (044) — K-boundary; stock semantics preserved.

A/E/S/F **security, permissions, atomicity, location-scope, RLS** are all
unchanged. No frozen security contract was weakened.

## 6. Known open items (NOT K blockers — documented, out of scope)

1. **F-03 cross-location `table_number` lookups** (latent): 3 fns
   (`enforce_order_table_location`, `table_release_guard`,
   `sync_table_order_aggregates`) filter by `table_number` without `location_id`
   (F-03: unique per location). **Safe today** — 0 table_numbers exist in 2
   locations (single-location deployment). Correct fix is F-boundary; deferred.
2. **`dirty` is off-registry** (not in `state_transitions` entity='table' and not
   a formal occupancy state) — by design (Option 1: operational cleanup state).
   The UI + seat-guard + clear-guard enforce its transitions. No registry edge
   added (per the ratified principle).
3. **`order_items.kitchen_status` contamination**: 89 `hot` + 9 `bar` + 2 `sushi`
   rows hold **station** values in a status column (pre-existing data hygiene;
   `station` is a separate column). Non-frozen data fix; deferred.
4. **`idx_orders_active_table`** is `UNIQUE(table_number) WHERE active` (not
   location-scoped) — F-boundary note carried from K-0; single-location prod.

## 7. Repository history note (per approved instruction)

> **Repository history note:** pre-existing missing object `709d1c59`
> (commit `1b807aeb` cannot resolve its parent); unreachable from current HEAD
> and unrelated to K-session commits. Working tree clean; all K evidence and
> commits (`94bb8cc` → `413a0c9`) are intact and verify via `git ls-tree`/`git log`.
> **Not treated as a K blocker; not repaired during K** (git history repair is
> explicitly out of scope for the K audit). `git gc`/`fsck` warnings on commit
> are the consequence of this pre-existing corruption.

## 8. Freeze checklist

- [x] G1–G7 hardened + committed (live 42501/200/0-rows/403 proof)
- [x] K-3 concurrency battery 8/8 (both KDS surfaces)
- [x] K-3-6 finalized guards (stock semantics preserved)
- [x] P0 "No location context" fixed + cross-location/fail-closed proven
- [x] Table/payment lifecycle confusion resolved (Decision A + Option 1)
- [x] Dismiss Table root cause (real PGRST202 route bug) fixed
- [x] 3 orphaned stuck tables repaired (evidenced)
- [x] Full lifecycle (seat→order→kitchen→ready→serve→pay→dirty→clear→empty)
- [x] `dirty` invariants (no NEW SEAT; Clear-only; canonical)
- [x] Concurrency (pay/seat, 2×pay no double-charge, 2×serve consistent)
- [x] Full regression: A 39/39 · E/S 54/54 · F 35/35 · O 38/38
- [x] `next build` exit 0 · `tsc` 0 (non-test)
- [x] All probes zero-residue (verified)
- [x] `git status` clean (evidence reports committed)
- [x] Pre-existing git history note recorded (§7), not a blocker

**→ K is FROZEN.** Do not reopen A/E/S/F/O or K security/perm/atomicity/
location-scope/RLS contracts without a proven regression + a new gate decision.
