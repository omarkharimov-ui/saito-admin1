# HANDOVER — Saito Admin POS (K → P)

**Date:** 2026-09-12 · **Head:** see `git log --oneline -1` (post-K freeze)
**Checkpoint:** `A ⚠️ → E/S ⚠️ → F 🔒 → O 🔒 → K 🔒 → P-1 🔒 → P-2 🔒 → P-3 🔒 → P-4 🔒 → P-5 🔒 → P-6 🔒 → P-7 NEXT`

> **A / E/S are ⚠️ pre-existing blockers, NOT P regressions** (bisection-proven: the
> failures persist with P-3 triggers disabled). See the disposition block after the P-3
> record below. Do NOT re-open P-1/P-2/P-3 on account of A/E/S.

This document is the operating baseline for the next agent. It is NOT "K is done"
— it is **frozen baseline + exact remaining architecture + next module (P) entry
point**. Read `K_FROZEN.md` for the K freeze record and
`K_FOUNDATION_CURRENT_STATE.md` for the lifecycle audit evidence.

---

## 1. FROZEN BASELINE (do not regress)

| Module | Gate | Result | Re-verify command (repo root) |
|---|---|---|---|
| **A** — Auth/sessions | `.a-regression.cjs` | **39/39** | `node .a-regression.cjs` |
| **E/S** — Staff/roles/timeclock/shifts | `.es-gate.cjs` | **54/54** | `node .es-gate.cjs` |
| **F** — Floor/tables/registry/guards | `.f-gate.cjs` | **35/35** | `node .f-gate.cjs` |
| **O** — Orders/transitions/payments-create | `.o-gate.cjs` | **38/38** | `O_ROUTE="$(pwd)/artifacts/saito-admin/src/app/api/orders/route.ts" node .o-gate.cjs` |
| **K** — Kitchen/KDS (full freeze) | 7 suites | all green | see below |

K suites: `.k-g3g4-probe.cjs` (14) · `.k-k3-probe.cjs` (8) · `.k-g7-probe.cjs` (12) ·
`.k-l2-probe.cjs` (9) · `.k-l3-probe.cjs` (8) · `.k-l5-probe.cjs` (9) ·
`.k-l4-probe.cjs` (16). Plus `.k-g6-probe.cjs` / `.k-g6-delivery-probe.cjs` (outbox).

**P-1 (2026-09-12, batch `20260912000001_p1_authz_batch.sql`)** — frozen gate
`.p1-gate.cjs` = **29/29** (`node .p1-gate.cjs`), all A/E/S/F/O/K re-verified green
above. Scope: M1 `has_permission(uuid,text)` = permission SSOT (contract); M2
**fail-closed location assertion on the financial write path** —
`complete_payment_atomic_v2` (13→14 args, `p_location_id`) + `refund_with_inventory`
(9→10) + helper `p1_actor_allowed_at_location` (order location == session location,
actor allowed: active `staff_locations` ∪ superadmin/owner ∪ documented
single-location-with-data fallback; NULL location = deny); pay/refund/approvals routes
resolve location server-side (`resolveWriteLocationContext`), client location ignored;
**bonus fix** refund Mode 2 + approvals passed `p_payments` as stringified JSON (never
worked — prod refunds = 0); M3 retired 4 broken/dead RPCs
(`has_permission_v2`, `get_effective_permissions`, `get_effective_permissions_v2`,
`check_permission` — 0 consumers, 3 hit `42703 ep.code`); M5 owner role seeded 65/65;
M6 override tables + `/api/permissions/overrides` retired (0 rows, gate never
consulted them, broken writer, dead UI); M4 `/api/orders/void` gated on `pos.void`,
legacy `/api/orders/complete-payment` + `/api/order-payments` retired (0 UI callers;
UI pays only via `/api/orders/pay`). Rollback refs:
`supabase/migrations/_p1_rollback_20260912/`.

**P-2 (2026-09-12, batch `20260912000002_p2_state_batch.sql`)** — frozen gate
`.p2-gate.cjs` = **13/13** (`node .p2-gate.cjs`); O 38/38 + P-1 29/29 + K L4 16/16 +
K L3 8/8 re-verified green post-batch. Scope (ratified): **S1** dropped the orphaned
`state_transitions.entity='table'` rows (25, 0 consumers, model mismatch vs F — F's
procedural `empty/occupied/reserved/dirty` model is untouched); **S2** registered the
12-state payment machine as `entity='payment'` (22 rules, single SSOT — the map used
to be hardcoded in `update_payment_status()`); **S2b** dropped the stale 8-state
`order_payments_status_check` (it pre-blocked 4 of the 12 registry states); **S3**
guard trigger `trg_payment_state_machine_guard` on `order_payments.status` (INSERTs
unaffected; NULL→X init allowed; X→NULL rejected; X→Y must be an active registry row).
P2-F7 verified: refunds DO transition `orders.status` (v2 writes refunded/partially_refunded
→ enforced by the ORDER guard). NULL legacy rows untouched (data-cleanup = separate
ratified decision). `cooking` = kitchen-aggregate alias of `preparing`, NOT an item
state. Contract: `P2_STATE_CONTRACT_DRAFT_2026-09-12.md`. Evidence:
`P0_INVENTORY_AUDIT_2026-09-12.md`, `P1_PERMISSION_FINDINGS_2026-09-12.md`,
`P1_AUTHZ_CONTRACT_FREEZE_2026-09-12.md`.

**P-3 (2026-09-13, batch `20260912000003_p3_amount_immutable.sql`)** — frozen gate
`.p3-gate.cjs` = **25/25** (`node .p3-gate.cjs`, zero-residue); re-verified post-batch
green: P-1 29/29, P-2 13/13, O 38/38, F 35/35, K L3 8/8, K L4 16/16. Scope (ratified):
- **P3-F3 financial immutability** — `trg_order_payment_immutable` on
  `order_payments`: INSERT ok; UPDATE `status` → P-2 guard (separate); UPDATE
  `amount`/`method`/`is_refund` → **BLOCKED** (`PAYMENT_RECORD_IMMUTABLE`); DELETE →
  **BLOCKED** except the trusted path. `payment_method` is deliberately NOT blocked
  (`saito_reverse_payment` uses `payment_method='reversed'` as its soft-delete marker).
  `orders.paid_amount` remains a derived aggregate; corrections are new refund/reverse
  rows (append-only), already the code model.
- **P3-F4(b) underpayment = BLOCK** — `trg_order_underpayment_guard` on `orders`:
  an order may not enter `paid`/`closed` while `0 < paid_amount < total_amount`
  (→ `PAYMENT_INCOMPLETE`, order stays open). Full-amount and zero-amount (void) closes
  + `cancelled` are unaffected; legacy underpaid-closed rows untouched (UPDATE-only).
- **Trusted reopen exception** — `reopen_order_atomic` (the single authorized,
  actor-validated, audited full-reversal path) sets a **transaction-scoped**
  `app.payment_ledger_reopen` flag so it alone can remove an order's payment records.
  External callers cannot forge it (it is set inside the SECURITY DEFINER fn only).
- **TG_NESTED cascade exemption REJECTED** — a bare `DELETE FROM orders` would
  otherwise cascade-wipe payment rows un-audited (a tamper loophole). Strict trigger
  kept. Consequence: the **P-2 gate + K L3/L4** test-teardown `DELETE FROM orders` now
  removes probe `order_payments` via the trusted flag (test-only, assertions frozen).
- P3-F1 historical reconciliation gap (342 paid-without-record + 42 mismatch, all
  pre-2026-09-09) = **FREEZE / NO BACKFILL** (separate ratified data decision).
   P3-F2 cash→drawer scoping = **P-8**. P3-F6 atomicity (FOR UPDATE lock-first,
   idempotency dedup, in-fn amount invariants, `PAYMENT_EXCEEDS_REMAINING`) = sound,
   frozen. Contract: `P3_AMOUNT_CONTRACT_DRAFT_2026-09-12.md`.

### P-1 / P-3 baseline integrity — RATIFIED (2026-09-13)
**Test-residue cleanup + P-1 harness compatibility fix only — no production logic
changed** (no `.ts` route, no migration, no RPC signature). Details + raw evidence:
`P1_P3_BASELINE_INTEGRITY_2026-09-13.md`.
- `.p1-gate.cjs` `cleanupOids` + error-handler now teardown probe payments in ONE
  transaction under the P-3 trusted `app.payment_ledger_reopen` flag (P-3 patched
  `.p2-gate.cjs` + K probes but **missed** `.p1-gate.cjs`; the miss made P-1 runs crash
  post-functional and P1-25 unreachable). `.o-gate.cjs` deliberately NOT patched (0
  `order_payments` references).
- Live probe residue removed (trusted flag, single txn each): LOC_B twin `a4d0f34f` +
  1 item; LOC_A twins `bcb69ece`/`0968de09`/`19995ae2`/`d204e1c5` + 1 item each (all
  `created_by IS NULL`, `product_name='P'`/NULL, 0 payments). `P1_` fixtures
  INACTIVATED (never deleted — F-contract). 1 orphan `inventory_logs` row retained
  intentionally (append-only immutable ledger, not residue). `created_by IS NULL`
  orders: **4 → 0**.
- Location single-location-with-data fallback restored:
  `Kassir`/`Tural Memmedov` `p1_actor_allowed_at_location` = true (live).
- **Green chain (live, 2026-09-13): P-1 29/29 → P-2 13/13 → P-3 25/25 → O 38/38,
  F 35/35, K L3 8/8, K L4 16/16, zero residue.** P-1→P-3 foundation chain = clean
  ratified baseline; no P-side blocker remains for **P-4 (Idempotency) NEXT**.

### P-4 Idempotency — 🔒 (2026-09-13, migration `20260913000001_p4_idempotency_contract.sql`)
Ratified decisions **D-1…D-8** (server-minted keys, `(namespace,key)` scope, 409 on
same-key-diff-payload, refund namespace, D-5 replay freshness, TTL+pruner, D-7
failed-attempt no-consume, D-8 webhook N/A). Scope: exactly-once for payment + refund.
- **Schema:** `payment_idempotency_keys` += `namespace`('payment'|'refund')+`expires_at`(30d);
  PK now `(namespace,key)`; redundant global `key_unique` dropped; 9 legacy keys backfilled.
  `complete_payment_atomic_v2`(14-arg) + `refund_with_inventory`(11-arg, `p_idempotency_key`)
  dedupe under `FOR UPDATE`; mismatch → `IDEMPOTENCY_CONFLICT` (409, zero mutation);
  replay returns **top-level `original` + `current`** (live re-read). `prune_expired_idempotency_keys()`
  (service_role). **Keyless pay/refund now 400 `IDEMPOTENCY_KEY_REQUIRED`** (D-1).
- **ROOT-CAUSE FIX found+applied during verification:** the conflict `RAISE` originally used
  `USING ERRCODE='40001'` (serialization_failure), which **hangs the PostgREST→pgbouncer
  gateway** (backend observed `idle in transaction (aborted)`, `ClientRead`; error never
  reached the client → 500/504/120s timeout). Defaulting to **P0001** (same as the proven
  `ORDER_ALREADY_PAID` path) fixes it → **real HTTP 409** confirmed. Stripped from live fns +
  the committed migration.
- **Harness compatibility (not production logic):** `.k-l3-probe.cjs` + `.k-l4-probe.cjs`
  teardown now delete `payment_idempotency_keys` rows (FK on `order_id`) before `DELETE FROM
  orders` — same sanctioned class as the P-1 harness patch. Also a prior killed O-gate had
  left `trg_orders_sync_table_floors`/`trg_order_table_location` DISABLED (O-gate pauses them
  inline, not in `finally`); re-enabled — that, not P-4, caused a transient L4 12/16.
- **Gate `.p4-gate.cjs` = 19/19** (`node .p4-gate.cjs`): keyed dup, keyless-400, double-click,
  retry, same-key-diff-amount 409, cross-order 409, diff-key independent, refund double-click,
  D-5 replay-freshness, concurrent identical/diff, D-7 failed-retry, zero-mutation, exactly-once,
  PK `(namespace,key)` + namespace isolation, TTL pruner, index hygiene, zero residue.
- **Frozen ecosystem reflow (all re-run, none assumed-green):** **P-1 29/29 · P-2 13/13 ·
  P-3 25/25 · O 38/38 · F 35/35 · K L3 8/8 · K L4 16/16**, zero residue.
- **Pre-existing (out of scope, flag for a future security pass, NOT a P-4 blocker):**
  `payment_idempotency_keys` is world-readable (`anon`/`authenticated` SELECT) incl. the
  `result` jsonb that carries financial data. Replay detection uses the route's service_role
  client (RLS off), so the functional contract is unaffected.
- **NOT yet committed to a processor/webhook (D-8 frozen N/A).** Next module: **P-5**.

### P-5 Atomicity — 🔒 (2026-09-13, migration `20260914000001_p5_atomicity_contract.sql`)
Ratified decisions **D-1…D-7** (see `P5_ATOMICITY_INVENTORY_2026-09-13.md` for the full
inventory + raw baseline evidence). Core invariants:
1. **No paid-without-record** — an order enters `paid`/`refunded` ONLY via the payment RPCs
   (`complete_payment_atomic_v2` / `refund_with_inventory`) that atomically create the
   `order_payments` record. Enforced by **(a)** `transition_order_atomic` now REJECTS
   `p_new_status IN ('paid','refunded','partially_refunded')` (clean
   `PAYMENT_STATE_FORBIDDEN`), and **(c)** a new `BEFORE UPDATE` trigger
   `trg_order_paid_requires_record` on `orders` asserting a non-refund `captured`
   `order_payments` row exists on `→paid` (belt+suspenders; the trigger is the DB invariant).
   The route `/api/rpc/transition_order_status` now maps that error to `422
   PAYMENT_STATE_FORBIDDEN`.
2. **No paid-wrong-order** — `trg_order_payment_immutable` (P-3) extended to also guard
   `order_id` (D-3): a captured payment cannot be re-attached to a different order.
- **D-2 (frozen-dead):** legacy `complete_payment_atomic` (10/11-arg) — no live route, no
  `p_location_id` (P-1), no `p_idempotency_key` (P-4). `REVOKE EXECUTE` from
  `authenticated`/`service_role`/`test_rls_role` (postgres keeps it).
- **D-4:** `REVOKE INSERT ON order_payments FROM authenticated` + drop the
  `order_payments_insert_loc` policy — the ledger is written only by the payment RPCs
  (service_role). (Pre-existing note, out of scope: the table ACL still grants `anon`
  rwd + `service_role` full — same world-readable class flagged in P-4.)
- **D-5 (NO backfill):** the legacy drift is a **frozen residual carried to P-9** —
  `paid_without_record=274`, `paid_amount≠Σcaptured=54`, `overpay=13`, `refund>paid=4`
  (pre-existing). P-5 proves **zero NEW drift** (gate asserts the baseline counts are
  unchanged after a full pay/refund cycle).
- **D-6/D-7 (kept / deferred):** `payment_pending→paid` stays (legit intermediate); dead
  `refund_payment_atomic` (`status='success'` not in the payment registry) untouched,
  flagged for P-6/P-11.
- **Harness compat (not production logic):** `.p3-gate.cjs` B3/B4 now seed the payment
  record before the `→paid` UPDATE (the P-5 trigger superseded their old
  bare-UPDATE-expects-OK); `.k-l3-probe.cjs` gained the 3× transport-retry wrapper it was
  missing (dev-server ECONNRESET under load — HANDOVER convention "retry 3×"; L4 already had it).
- **Gate `.p5-gate.cjs` = 10/10** (`node .p5-gate.cjs`).
- **Frozen ecosystem reflow (all re-run):** **P-1 29/29 · P-2 13/13 · P-3 25/25 · P-4 19/19 ·
  O 38/38 · F 35/35 · K L3 8/8 · K L4 16/16**, zero residue, baseline 274 preserved.
  (O-gate kill-hazard re-checked: both paused triggers back to `O` after the O-gate.)
 - Next module: **P-6 Refund / void / reopen**.

### P-6 Refund / Void / Reopen — 🔒 (2026-09-13, migration `20260914000002_p6_refund_void_reopen_contract.sql`)
Ratified decisions **D-1…D-9** (inventory + raw baseline: `P6_REFUND_VOID_REOPEN_INVENTORY_2026-09-13.md`).
The refund/void/reopen state space had **zero live production rows** at audit time
(`refunded=0, partially_refunded=0, voided=0, is_refund rows=0`), so P-6 set the forward
contract airtight with no backfill (the 4 legacy `refund_amount>paid_amount` rows stay a P-9 residual).
- **D-1 (the critical fix) — reopen = FULL financial reversal is now authorized server-side:**
  `reopen_order_atomic` gained a leading **`p_token`** arg (5-arg form); identity is re-derived
  from the session (O-01: never the caller-supplied `p_performed_by`, which is now
  cross-checked → `IDENTITY_MISMATCH`). Requires **`orders.edit`** + **location scope (P-1)**
  + **MANAGER OVERRIDE** (`refund.approve` ∨ `void.approve` ∨ approved `manager_overrides`;
  registry ovr=true for `paid→new`/`refunded→new`/`closed→new`/`partially_refunded→new`).
  The route `/api/orders/reopen` adds `requirePermission('orders.edit')` and maps
  `PERMISSION_DENIED`/`MANAGER_OVERRIDE_REQUIRED`/`IDENTITY_MISMATCH` to **403**. The **legacy
  4-arg overload is frozen to postgres-only** (REVOKE), so a bare PostgREST service_role call
  cannot bypass it; the new 5-arg form has EXECUTE = postgres/authenticated/service_role
  (anon/PUBLIC revoked). A cashier reopen is 403 both via the route AND via direct RPC.
- **D-2** — reopen now emits canonical **`log_audit('reopen_order')` + `order.status_changed`
  outbox** (was `operation_logs` only — a full money reversal with no audit/sync).
- **D-3** — reopen's trusted `DELETE FROM order_payments` **stays** (the ratified P-3
  full-reversal path). The delete-vs-append ledger model is a **P-9** decision, untouched.
- **D-4** — `void_items_state_aware` now emits an **`order.status_changed` outbox** on a
  successful void (was audit-only).
- **D-5/D-6 (frozen-dead)** — `void_payment_atomic_v2` (stale `active/ready` guard, no route)
  and `refund_payment_atomic` (`status='success'` not in the payment registry, no route) →
  **REVOKE EXECUTE** (postgres keeps both; `EXECUTE` = `{postgres}` verified).
- **D-7/D-8 (verify-only, no change)** — concurrent order-level refund: the net-paid cap
  (`REFUND_EXCEEDS_PAID`) holds under the `FOR UPDATE` row lock (2× concurrent `refund(50)`
  on a 100 order → exactly one succeeds, net ≤ 100, **no over-refund**); reopen is naturally
  idempotent (a 2nd reopen on the now-`new` order is rejected — no double reversal / orphan
  stock) and a partial-refunded reopen clears **both** the payment and the refund rows.
- **D-9** — legacy `/api/payments/void` → `update_payment_status` (legacy `payments`, 2 rows)
  untouched (P-9).
- **Pre-existing, out of P-6 scope (noted, not changed):** the refund route maps a
  `REFUND_EXCEEDS_PAID` DB error to **500** (not a 4xx) — a route-mapping choice; the
  invariant (no over-refund) is enforced and proven. Candidate cleanup for a future pass.
- **Harness compat (not production logic):** `.p3-gate.cjs` C1 now calls the **4-arg trusted**
  `reopen_order_atomic` with explicit `::uuid`/`::text` casts (the new 5-arg token overload
  made the old 3-literal call ambiguous), and `.p3-gate.cjs` `httpPay` gained the 3×
  transport-retry wrapper (dev ECONNRESET under load). `.p6-gate.cjs` fixtures: an active
  **shift** is required (reopen/refund routes gate on `requireActiveShift`; `shifts.status`
  is the `shift_status` ENUM `'OPEN'`, and only ACTIVE staff may open one) and
  `order_items.product_id` is nullable (no `organization_id` column — org derives via order).
- **Gate `.p6-gate.cjs` = 15/15** (`node .p6-gate.cjs`): refund-needs-paid, item-refund
  (partial + audit), order-level full refund, over-refund block, concurrent-refund no-over,
  cashier reopen 403 (route + direct RPC), identity-spoof reject, authorized manager reopen
  (reversal + audit + outbox atomic), reopen idempotency, partial-refund→reopen clears both,
  dead-RPC frozen, void un-paid (outbox), void paid (guard), zero-NEW-drift, zero residue.
- **Frozen ecosystem reflow (all re-run):** **P-1 29/29 · P-2 13/13 · P-3 25/25 · P-4 19/19 ·
  P-5 10/10 · O 38/38 · F 35/35 · K L3 8/8 · K L4 16/16**, zero residue, baseline preserved.
  (O-gate kill-hazard re-checked: both paused triggers back to `O`.)
- Next module: **P-7 Concurrency** (roadmap §2: pay/pay, pay/cancel, pay/new-seat dirty guard, …).

### P-3 freeze — A / E-S pre-existing blocker disposition (NOT P regressions)
**Proof (bisection):** with both P-3 triggers `DISABLE TRIGGER`, A and E/S fail
**identically**; re-enabled, P-1/P-2/O/F/K all green. So A/E-S are independent of P-3.
- **E/S (E4–E9):** `cash_in_atomic` / `close_cash_register_v2` now resolve to a
  **new signature with a leading `p_session_id`** (live PostgREST: "Expected 4 arguments,
  got 3" for `cash_in_atomic`; `close_cash_register_v2` = 5-arg). The frozen E/S gate +
  `cash-drawer/route.ts` still call the old arg list. **None of the P-1/P-2/P-3
  migrations touch these RPCs** — the drift came from another session/agent. DO NOT edit
  the E/S gate blind: first attribute the cash-RPC signature change to a ratified task.
- **A (O-1, C-2):** module-A-specific. O-1 = `invalid input syntax for type uuid: ""`
  (a fixture/override id lookup returning empty); C-2 = login-then-disable race
  (`auth-after=200`). Neither produces a P-3 error signature. Remains an **A
  investigation**, out of P-3 scope.
- **System is NOT globally frozen until A/E-S are resolved**, but **P-1/P-2/P-3 are
  individually frozen** and must not be re-opened on account of A/E-S.

Build: `cd artifacts/saito-admin && npx next build` (exit 0, 270 static).
Types: `npx --no-install tsc --noEmit` → 0 errors (non-test).

All probes are **idempotent, zero-residue** (staff rows set INACTIVE, never deleted —
F-contract; test tables removed; shifts closed). They hit the LIVE DB + the local dev
server (`http://localhost:3000`, must be running: `npm run dev` in `artifacts/saito-admin`).

## 2. DO NOT REOPEN (without a proven regression + new gate decision)

**A / E/S / F / O / K** — specifically these contracts per module:
- **security / authz**: token-first fns, `authorize()` session+staff+org+location,
  service_role-only KDS fns (anon = 42501), `requirePermission`/`requireActiveShift`
  route gates, manager-override gates.
- **location scope (D-5)**: server-derived location from the authenticated session;
  **never** trust a client-supplied `location_id` (L2 `resolveWriteLocationContext` in
  `artifacts/saito-admin/src/lib/location-context.ts`).
- **atomicity**: `FOR UPDATE` row locks, single-statement guarded UPDATEs, fail-safe
  `DO $$` blocks in migrations.
- **KDS lifecycle + finalized-order guard**: `paid/cancelled/closed` orders are
  refused by all 4 legacy KDS fns (044) + canonical item fns (K3-3); stock consumption
  in `mark_order_ready` is **preserved and load-bearing** — do not "modernize" it to
  `item_kitchen_step` (that path does not consume stock).
- **realtime/outbox**: `kds_ticket` scoped event + `kds_ticket_poll` RPC is the
  security boundary; DB stays SSOT, realtime only triggers scoped re-fetch/resync.
- **browser bypass**: 0 raw browser→Supabase KDS RPC paths; all KDS mutations go
  through server routes (`/api/kitchen/action` etc.).
- **table lifecycle separation**: TABLE = `empty/occupied/reserved` (+ `dirty`
  post-payment cleanup state, **by design**, Option 1 ratified). Order/kitchen/service/
  payment progression **must not** redefine `table.status`. Do NOT add
  `occupied→in_kitchen/ready/...` edges to the F registry — that "fixes" the symptom
  with the wrong architecture.
- **E/S shift invariant**: any close path MUST set `shifts.status='CLOSED'` (045;
  an `OPEN`+closed shift is counted open by `trg_shift_no_overlap` → staff lockout).

## 3. KNOWN FROZEN-BOUNDARY RESIDUALS (documented, deferred — do not silently fix)

1. **F-03 cross-location `table_number` lookups** — 3 fns
   (`enforce_order_table_location`, `table_release_guard`, `sync_table_order_aggregates`)
   filter by `table_number` without `location_id`. **Safe today**: 0 table_numbers
   exist in 2 locations (single-location deployment). Correct fix is F-boundary.
2. **`dirty` off-registry** — not in `state_transitions` (entity='table') and not a
   formal occupancy state; intentionally an **operational post-payment cleanup state**.
   Its transitions are enforced by the seat guard (dirty→seat = 409) +
   `clear_table_atomic` (dirty→empty only). UI shows it (never as "available").
3. **`order_items.kitchen_status` contamination** — 89 `hot` + 9 `bar` + 2 `sushi`
   rows hold **station** values in a status column (pre-existing data hygiene;
   `station` is a separate column). Non-frozen data fix.
4. **`idx_orders_active_table`** — `UNIQUE(table_number) WHERE active`, NOT
   location-scoped. F-boundary note; single-location prod.

**Git history note (approved instruction, carries to all future work):** pre-existing
missing object `709d1c59` (commit `1b807aeb` cannot resolve its parent); unreachable
from HEAD, unrelated to session commits. `git gc`/`fsck` warnings on commit are its
consequence. **Not a blocker; not repaired during the K audit; out of scope.**

## 4. EXACT REMAINING ARCHITECTURE (the ratified model)

```
TABLE:    empty → occupied → (paid) → dirty → empty
ORDER:    new/open/confirmed → in_kitchen → … → paid → closed   (+cancelled/refunded/voided branches)
KITCHEN:  pending → accepted → preparing/cooking → ready → completed   (order_items.kitchen_status)
SERVICE:  (explicit) mark_served_atomic → kitchen_status='served'
PAYMENT:  [P — NEXT]
```
The four(+payment) lifecycles **derive/synchronize, they do not merge**:
- order→table: `transition_order_atomic` keeps `occupied` (042); only last-open-order
  cancellation frees the table; `release_paid_table_atomic` owns the explicit departure.
- order→table `dirty`: `complete_payment_atomic` writes `dirty` on full payment
  (no other active order) + clears pointer/guests/total.
- kitchen→floor chip: `table.kitchen_status` (own trigger), never `table.status`.
- payment→table: `dirty` only; NEW SEAT is server-blocked until Clear.
- SSOT = DB. Outbox = scoped delivery. Client = presentation + resync.

Key files:
- `artifacts/saito-admin/src/lib/location-context.ts` — `resolveWriteLocationContext`
- `artifacts/saito-admin/src/lib/api-auth.ts` — `validateAuth` (session cookie), `requirePermission`
- `artifacts/saito-admin/src/lib/csrf.ts` — double-submit CSRF (header == cookie)
- `artifacts/saito-admin/src/lib/shiftLock.ts` — `requireActiveShift` (Clear route gate)
- `artifacts/saito-admin/src/app/api/kitchen/action/route.ts` — KDS mutation dispatch (the G7 pattern)
- `artifacts/saito-admin/src/app/api/orders/complete-payment/route.ts` — payment entry (P scope)
- `supabase/migrations/202609110000{38,39,40,41,42,43,44,45}_*.sql` — this session
- Probes (re-runnable): `.k-*-probe.cjs`, `.a-regression.cjs`, `.es-gate.cjs`, `.f-gate.cjs`, `.o-gate.cjs`

Probe conventions (follow for P): read `SUPABASE_SERVICE_ROLE_KEY` from
`artifacts/saito-admin/.env.local`; staff fixtures named `P_%` (INACTIVE, never
deleted); test tables `997/998/...`; `cleanTable()` pattern must disable
`trg_inventory_logs_immutable` around deletes (immutable ledger); HTTP calls need
`x-csrf-token` == `saito_csrf` cookie; dev-server ECONNRESET under load → retry 3×.

---

## 5. NEXT MODULE: **P — PAYMENTS** (the financial SSOT boundary)

**Position:** the lifecycle chain is `TABLE → ORDER → KITCHEN → SERVICE → PAYMENT →
DIRTY → CLEAR → EMPTY`. Payment is the POS's most critical commerce surface; it must be
audited as the **financial SSOT boundary**, NOT as "button → paid".

### 5.1 Known entry points (verify, don't assume)
- RPCs: `complete_payment_atomic` — **two overloads** (10-arg, token-less; 11-arg with
  `p_cash_drawer_session_id`). Writes `payments` rows (`method`,`amount`,`status`),
  order→`paid`, **table→`dirty`** on full payment when no other active order, outbox.
- Route: `/api/orders/complete-payment` — currently `requireAuth` + CSRF only.
  **P must verify the permission model** (cashier/manager/superadmin matrix,
  `payments.create`, `pos.payment`, override for discount/refund) — do not inherit K's
  assumption that this is fine.
- Order registry already has `refunded` / `partially_refunded` / `voided` states —
  the refund/void fns around them are P scope.
- Shift linkage: `shifts.starting_cash/expected_cash/actual_cash/difference`;
  `close_shift_atomic` flags `requires_review` when |difference|>10; 12h
  `auto_clockout_staff`. Cash drawer ↔ payment linkage is P scope.

### 5.2 P audit plan (ratified scope — execute in this order)
- **P-0 Inventory:** every payment fn/route/table/trigger/outbox event + RLS + ACL;
  permission matrix (who can create/capture/refund/void/discount/adjust drawer).
- **P-1 Authorization:** cashier vs manager vs superadmin; location scope on every
  payment path (D-5); `requireActiveShift` applicability; override gates.
- **P-2 Capture semantics:** payment authorization vs capture; method coverage
  (cash / card / QR); what `status` values exist on `payments` and what transitions
  are legal (registry check — `dirty`'s lesson: no hidden 4th states).
- **P-3 Amount edge cases:** split payment, partial payment, overpayment (change?
  credit?), underpayment (open balance? block?), multiple payments per order.
- **P-4 Idempotency:** duplicate submit (double-click, retry, webhook replay) →
  exactly-once; the L4 2×pay result (no double-charge) is the baseline to extend.
- **P-5 Atomicity:** payment ↔ order (no paid-without-record, no paid-wrong-order),
  payment ↔ table lifecycle (`dirty` only via the ratified path; PAID+OCCUPIED stays valid).
- **P-6 Refund / void / reopen:** full/partial refund, void, refund-after-close,
  reopen semantics; each must map to the registry states with audit + outbox.
- **P-7 Concurrency:** pay/pay (same order), pay/cancel, pay/new-seat (dirty guard),
  pay/dismiss, drawer close vs payment in flight.
- **P-8 Cash drawer:** drawer session linkage, counts, discrepancy review, shift close
  interplay (the 045 invariant must stay green).
- **P-9 Audit & immutability:** every financial mutation → `audit_logs`/
  `audit_logs_canonical` + outbox; `payments` immutability model (correction = new
  row, never UPDATE — mirror the `inventory_logs` immutable-trigger pattern);
  reconciliation (order totals vs payments vs drawer).
- **P-10 External processor boundary:** provider abstraction, failure modes, timeout
  handling, webhook endpoint (auth, signature, idempotency, replay), reconciliation
  against provider statements.
- **P-11 Failed payment recovery:** partial-capture cleanup, stuck `pending` payments,
  operator recovery actions, no orphaned drawer deltas.
- **P-12 Close-out:** full P regression (own probe suite `P_%`, zero-residue) +
  re-run A/E/S/F/O/K gates (especially E/S shift invariants and O 38/38) +
  `next build` + tsc → **`P_FROZEN.md`** + tree clean.

### 5.3 Ground rules (from K, ratified)
1. DB = SSOT; outbox = scoped delivery; never a client-authoritative amount/state.
2. Every mutation: session identity + server location + RBAC + `FOR UPDATE` + audit
   + outbox, in one atomic function.
3. A proven regression may touch a frozen module ONLY with an explicit, scoped,
   ratified exception (the 042/045 pattern) — and the freeze document is updated.
4. Live proof > code review: every P claim needs a zero-residue probe row, like K's.
5. Financial immutability: amounts are never UPDATEd; corrections are append-only.

---

*Handover authored at K freeze. Baseline numbers are from live gate runs on 2026-09-12;
re-run the §1 commands to re-establish them before starting P-0.*
