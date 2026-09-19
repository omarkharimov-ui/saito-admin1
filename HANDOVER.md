# HANDOVER — Saito Admin POS (P-series)

**Date:** 2026-09-14 · **Head:** `0c59227` (post-P-6 freeze; `main == origin`)
**Checkpoint (2026-09-19):** `P-9 🔒 → W-A1 🔒 (QR guest identity + M0 loyalty repair) → W-A2 🔒 (add-to-check + QR price hardening + D17 prod fix) · narrowed reflow green: W-A2 14/14, O 38/38, W-A1 18/18, F 35/35 — P-7 half-2 + P-8 BLOCKED by Supabase incident 6q5902p2xd9f (API Gateway degraded; re-run commands in W_A1_FREEZE_REPORT_2026-09-19.md §4) · W-A2 UI (menu "continue your check") = HARD STOP, user-collaborative`

> **A / E/S are ⚠️ pre-existing blockers, NOT P regressions** (bisection-proven: the
> failures persist with P-3 triggers disabled). See the disposition block after the P-3
> record below. Do NOT re-open P-1…P-6 on account of A/E/S.

This document is the operating baseline for the next agent. It is the **frozen baseline
+ exact remaining architecture + next module (P-7) entry point**. The P-0…P-6 per-module
contracts/inventories (the source-of-truth for each ratified decision) are the
`P?_*.md` files next to this file; the K/A/E-S freeze records were archived out of the
repo (they live in git history if ever needed).

---

## 1. FROZEN BASELINE (do not regress)

Latest full reflow (2026-09-13, after P-6) — **all re-run green, zero residue**:

| Module | Gate | Result | Re-verify command (repo root) |
|---|---|---|---|
| **A** — Auth/sessions | `.a-regression.cjs` | **39/39** ⚠️* | `node .a-regression.cjs` |
| **E/S** — Staff/roles/timeclock/shifts | `.es-gate.cjs` | **54/54** ⚠️* | `node .es-gate.cjs` |
| **F** — Floor/tables/registry/guards | `.f-gate.cjs` | **35/35** | `node .f-gate.cjs` |
| **O** — Orders/transitions/payments-create | `.o-gate.cjs` | **38/38** | `O_ROUTE="$(pwd)/artifacts/saito-admin/src/app/api/orders/route.ts" node .o-gate.cjs` |
| **K** — Kitchen/KDS (full freeze) | 7 suites | all green | see below |
| **P-1** — Authorization (location scope, permission SSOT) | `.p1-gate.cjs` | **29/29** | `node .p1-gate.cjs` |
| **P-2** — State machine (registry, payment 12-state) | `.p2-gate.cjs` | **13/13** | `node .p2-gate.cjs` |
| **P-3** — Amount immutability (ledger, underpayment) | `.p3-gate.cjs` | **25/25** | `node .p3-gate.cjs` |
| **P-4** — Idempotency (exactly-once payment/refund) | `.p4-gate.cjs` | **19/19** | `node .p4-gate.cjs` |
| **P-5** — Atomicity (paid requires a record) | `.p5-gate.cjs` | **10/10** | `node .p5-gate.cjs` |
| **P-6** — Refund/Void/Reopen (authorized full reversal) | `.p6-gate.cjs` | **15/15** | `node .p6-gate.cjs` |

⚠️* A and E/S are **pre-existing blockers** (cash-RPC signature drift + an A-specific
fixture race) — NOT P regressions; their historical 39/39 · 54/54 were green before that
drift. Do NOT re-open any P module because of them.

K suites: `.k-g3g4-probe.cjs` (14) · `.k-k3-probe.cjs` (8) · `.k-g7-probe.cjs` (12) ·
`.k-l2-probe.cjs` (9) · `.k-l3-probe.cjs` (8) · `.k-l5-probe.cjs` (9) ·
`.k-l4-probe.cjs` (16). Plus `.k-g6-probe.cjs` / `.k-g6-delivery-probe.cjs` (outbox).

**How to run the P chain in order (solo, drained pooler):** start the dev server
(`cd artifacts/saito-admin && npm run dev`), then run each gate above sequentially.
Each gate is **idempotent + zero-residue** (P6_ staff INACTIVATED, probe orders/op-rows
removed under the P-3 trusted `app.payment_ledger_reopen` flag, idempotency keys deleted).
See §5.3 conventions.

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
 PAYMENT:  AUTHZ(P-1) · STATE(P-2) · IMMUTABLE(P-3) · IDEMPOTENT(P-4) · ATOMIC(P-5) ·
          REFUND/VOID/REOPEN(P-6) — all frozen; concurrency is NEXT (P-7)
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

## 5.5.5 — PRE-P7 CHECKPOINT: schema reality audit (2026-09-14, ratified)

**P-7 is PAUSED** until the schema cleanup below lands (user ratification 2026-09-14).
The full audit: `PRE_P7_SCHEMA_REALITY_AUDIT_2026-09-14.md` (+ `_ADDENDUM.md` for
S-1/S-3/S-8 + login). Headline, with raw counts:

- **H-1 FIXED:** repo migrations never recreated the live schema (167/169 tables
  LIVE_ONLY). Now `supabase/baseline_live_schema_2026-09-14.sql` (pg_dump --schema-only,
  154 tables + 437 fns, 36.6k lines) is the **reconstruction baseline** (outside
  `supabase/migrations/`, NOT a migration replay). Fresh-DB restore = baseline → then
  P-1..P-6 deltas.
- **H-2/D (PRIORITY, not yet fixed):** **152 tables grant FULL DML to `anon`**; 39 of them
  are also RLS-OFF (25 with live data — anon can write via PostgREST). `settings` holds
  ≥5 plaintext credential columns (no route exposes them — live-verified). S-8: all 324
  SECURITY DEFINER fns have pinned `search_path` (no escalation found).
- **H-4:** 47 empty tables with zero app + zero DB-fn refs (C-candidates, frozen-not-dropped).
- **H-5:** 7 duplicate/parallel structures (3 audit tables, 4 op-logs, 2 ledgers, …) → P-9.
- **Login surface (fixed):** 3 un-authenticatable active staff (2 null `pin_hash`, 1 weak
  hash — test residue: `edefdfas`, `Security Test`, `GATE_T`) INACTIVATED (F-contract) + 1
  orphan session REVOKED; now **0** active staff left un-authenticatable. Old 2–3-digit
  short codes are **gone by design** (A-freeze rotated to 4-digit PBKDF2; `staff-login`
  rejects non-4-digit). Working account-login = `/staff/login` → `staff-login` (4-digit
  PIN only). `.a-regression.cjs` re-run 39/39 (A03 correct-PIN→200). Legacy `pin-login`
  is an unused weaker parallel path → freeze in cleanup.

**S-4a DONE (2026-09-14, ratified):** anon DML revoked on the 39 RLS-OFF targets
(migration `20260914000003_prep7_s4a_anon_dml_revoke.sql`; anon SELECT retained;
verified: anon DML on targets 0/39, anon-fullDML schema-wide 152 → 114). Pre-check
caught **one live anon-client write**: `POST /api/expenses` used `@/lib/supabase`
(= anon-key client re-export) → switched to `createAuthClient()` (service_role),
matching `/api/payment-methods`. `useReports.createExpense` is dead code (never
called) — flagged for removal in S-4b. `inventory_logs` (ratified item 4): RLS-ON,
anon = SELECT/INSERT/TRUNCATE/REF/TRIGGER (no UPDATE/DELETE), 6 triggers — NOT in
the 39; separate decision needed (client anon INSERT to a RLS-ON table = blocked by
RLS unless a policy allows it → check before any change).

**S-4b DONE (2026-09-14, ratified):** settings plaintext-credential columns dropped — the set
was **8, not 5** (smtp_host/port/from_name are also dead; email = Supabase Auth). Values
preserved to `.env.local` (gitignored) as SETTINGS_LEGACY_* first (0 printed). Migration
`20260914000004`. Dead `useReports.createExpense` deleted (never called). `pin-login` FROZEN
→ 410 (weak legacy login: no CSRF/rate-limit/audit; canonical = staff-login). Post-verify:
0 credential cols on settings, 1 row intact; live 410 smoke OK; expenses POST → 401 (auth
gate, service client intact).

**C-class DONE (2026-09-14, ratified):** of 61 empty objects the comprehensive
dependency scan (`.from()` + REST `/rest/v1/<t>` URLs + raw SQL + fn/trigger/view +
FKs + gates) kept 29 live-referenced (incl. 11 rescued by the REST-URL pass) and
**dropped 32** (migrations `20260914000005` freeze → full reflow green →
`20260914000006` child-first DROP CASCADE). `dining_groups` retained (live FK
`orders.group_id`; P-9 candidate). Post-drop: 169→137 objects, FKs 233→183,
P-6/O/A re-verified green, zero residue. **P-7 UNPAUSE is now authorized.**

**P-7 dependency-contamination gate (2026-09-15, read-only, 0 DB mutation): 4 NO /
2 YES — writer freeze BLOCKED until D-Q4 + D-Q6 dispositioned.**
(`P7_DEPENDENCY_CONTAMINATION_GATE_2026-09-15.md`). Method: word-boundary app scan
(REST URLs included) + all 625 live fn bodies + triggers + row-count deltas vs the
P-6 baseline. NO: Q1 `orders.total_price` (0 writers — all use `total_amount`), Q2
`table_floors.payment_status` (0 decisions/writes/triggers), Q3 `staff_stats`
(display-only join in `get_staff_directory_v2`), Q5 `inventory_status` (reads only).
YES: **Q4** `refund_with_inventory` dual-writes canonical `order_payments` + legacy
`payments` mirror in ONE txn (unique idempotency_key) → **D-Q4**; **Q6**
`transition_order_atomic` writes legacy `audit_logs` in the same txn as canonical
(audit_logs 333→357 since P-6 baseline, 182 order.transition rows/30d) → **D-Q6**.
Recommended: (a) document-keep in the P-7 contract now, (b) structural strip in P-9.
Awaiting ratification.

**Ratified order:** S-1 ✅ · S-3/S-8 ✅ · S-4a ✅ · S-4b ✅ · C-class ✅ — all done · S-10 ✅ KEEP
(240 never-written columns, no touch) · S-5/S-6/S-7/S-9 ⏸ (P-9 / cleanup backlog).
**P-7 inventory + decision matrix (2026-09-15, read-only, for ratification):**
`P7_WRITER_INVENTORY_DECISION_MATRIX_2026-09-15.md`. Live A-class writer surface
mapped (route→RPC→lock-order): all money/state writers lock `orders` FIRST; the only
cross-table order is `orders → table_floors` (single direction — no 2-cycle; `dismiss`
locks only `table_floors`). Keyed idempotency writers = exactly 2 (pay v2, refund
v11 — P-4). Cancel UI verified = `transition_order_atomic('cancelled')` (canonical
machine). 16-test concurrency battery (C-1..C-16: pay∥pay/cancel/add/seat/dismiss/
drawer, transition∥transition, refund∥refund/pay + D-Q4 mirror parity, reopen∥pay,
duplicate-RPC, stale-state, deadlock smoke, rollback-atomicity) + P7-1..P7-8
verify/fix decision rows. **Awaiting user ratification of the battery → step 4 live
concurrency proof.**

 **P-7 (next)** = ratify C-1..C-16 battery → live concurrency proof (`.p7-gate.cjs`) →
 decision matrix → ratification → live concurrency proof → gate/reflow → commit.
 each followed by the P-1..P-6 reflow. THEN P-7 (A-class writer surface only).

**P-7 LIVE CONCURRENCY PROOF (2026-09-15, `.p7-gate.cjs` = 16/16, GO):**
`.p7-gate.cjs` ran the ratified C-1..C-16 battery as true-parallel HTTP
(`Promise.allSettled`, 5 staff: MGR/CASH/MGR2/OWN/CASH2, fresh collision-free
`table_floors` block per run, live Supabase). Asserts FINAL RELATIONAL STATE (not
just "no deadlock"); classifies PASS / EXPECTED-CONFLICT / REAL-RISK / HARNESS-FAILURE.
Result: **PASS=9, EXPECTED-CONFLICT=7, REAL-RISK=0, HARNESS-FAILURE=0**, zero-residue
verified on all 10 surfaces (orders/items/op/payments-mirror/outbox/oplog/order_events/
audit/staff/sessions/shifts/products/drawer/keys). No deadlock (40P01) in any race; the
`orders`-first lock order + P-2 BEFORE guard + P-5 paid-requires-record hold under load.

Key live-verified corrections (kept in the gate + this doc — do NOT revert):
- **C-5 = `release_paid_table_atomic`**, NOT `activate_table_atomic`. `activate_table_atomic`
  only fires on **reserved** tables (creates a new order); a paid `occupied` table is
  released/closed by `release_paid_table_atomic` (floor.manage). C-5's dirty guard = a paid
  order is never orphaned when its table is released.
- **`transition_order_atomic` writes `order_events + audit_logs (compat) + operation_logs +
  outbox_events` — it does NOT write `audit_logs_canonical`** (only `log_audit` does). The
  earlier D-Q6 "canonical SSOT" assumption is superseded for this path. **C-16 asserts the
  4 tables the transition fn actually writes** (strict rollback: illegal transition → all 4
  unchanged); it deliberately does NOT wait for a canonical row. The discrepancy is
  documented in the test, not hidden.
- **`orders.paid_amount` is NET-of-refunds** (makePaid sets gross; a refund decrements it:
  100 → refund 60 → paid_amount 40). C-10's over-refund invariant therefore compares
  `refund_amount` against **GROSS paid** (captured non-refund `order_payments` rows), not the
  net `paid_amount` — the first draft compared to net and false-positived (60 > 40) though
  the product was correct (capped 60 at pre-refund gross 100). `grossPaid()` reader added.

**Environmental note (root-caused, NOT a product bug):** the 2-day-old `next dev` process
intermittently drops Supabase REST fetches under parallel load (15-way auth probe: 14×200 +
1×500 "fetch failed"). Inside `validateAuth` a dropped session lookup → `401 "Invalid
session"` for a VALID token (api-auth.ts:26, the `!session` branch — `security_events` stays
empty, confirming it's not revoked/expired/disabled). The gate absorbs this via per-token
warmup + a per-test `healthGate` (stalls until the auth path is 200) + flake-retry, and
classifies any surviving flake as **HARNESS-FAILURE (never a hollow PASS, never a false
REAL-RISK)** so a race that never reached the DB can never masquerade as a pass. `P7_ALL=1`
runs all 16 in one process (no cross-process degraded window).

Full frozen reflow GREEN post-P-7: **A 39/39 · E/S 54/54 · F 35/35 · O 38/38 · K L3 8/8 +
L4 16/16 · P-1 29/29 · P-6 15/15**. **P-7 is FROZEN — formally ratified by the user on
2026-09-17** (final: 16/16 = 9 PASS + 7 EXPECTED-CONFLICT, 0 REAL-RISK, 0 HARNESS-FAILURE,
zero-residue, commit `09119e5`, `main == origin/main`). **Freeze boundary:** P-7 is NOT
reopened to "fix something" — any new finding against the P-7 writer/lock/state contract
requires its own concrete regression report + classification before any change. The three
preserved facts are binding on all future modules: (1) C-5 = `release_paid_table_atomic`;
(2) `transition_order_atomic` writes `order_events + audit_logs + operation_logs +
outbox_events`, NOT `audit_logs_canonical`; (3) `orders.paid_amount` = net-of-refunds —
C-10 asserts the GROSS refund invariant. Next module: **P-8 (cash drawer)** per the §5.5
deferred list — **not auto-started**; it begins only on a separate user ratification.
Sequence: read-only audit → live writer/state/permission map → invariant & atomicity
matrix → concurrency/TOCTOU plan → ratification → implementation → adversarial gate →
frozen reflow → freeze. Principle unchanged: backend/business logic fully frozen before
any UX.

**P-8 status (2026-09-17):** Phase-1 read-only audit **COMPLETE + independently VERIFIED**
(`P8_CASH_DRAWER_INVENTORY_DECISION_MATRIX_2026-09-17.md` + `P8_PHASE1_VERIFICATION_2026-09-17.md`;
verification verdict PARTIAL → 3 mandatory corrections applied, matrix commit `e15deda`; NO
re-audit of Phase 1 needed). Confirmed for Phase-2 fix: **P0-1** direct-RPC EXECUTE exposure
(anon `close_cash_register_v2`/`open_cash_register`; authenticated tokenless writers incl.
`cash_in/out_atomic`, `close_shift_atomic`, `reopen_cash_register`, legacy `clock_out_token`);
**P0-2** timeclock RLS (RLS-OFF `shift_reviews`/`tip_shortfalls`; `{public}` ALL policies on
`time_clock_entries`/`time_clock_audit`); **T-3** lockless unscoped drawer selection in
`fn_record_cash_payment` (fix: FOR UPDATE + location/org scope). **Phase-2 = WAITING FOR user
Q1–Q6 rulings + explicit GO.** **Scope boundary (user, 2026-09-17):** final Supabase schema
normalization — `settings` decomposition, duplicate columns, legacy models — is **OUT OF P-8**,
 stays P-9/final normalization; P-8 fixes ONLY the cash-drawer contract. P-1..P-7 remain frozen
(verification §E: T-3 is a new P-8 finding, not a P-7 regression).

**P-8 LIVE CONCURRENCY PROOF (2026-09-17, `.p8-gate.cjs` = 8/8, GO → FROZEN):**
Phase-2 implemented and ratified (Q1–Q6): migration `20260917000001_p8_cash_drawer_contract.sql`
(ledger SSOT + canonical walk, state-machine guard, T-3 FOR UPDATE serialization, D-5 server-side
`manager_pin`, D-11 drawer idempotency, D-12 outbox events, Q4 cron public paths, Q3/Q5/Q6 route
retires, CSRF on all P-8 write routes) + gate-fix migrations `20260917000002` (D-11 FK drop +
`emit_outbox_event` NULL-metadata COALESCE — both real defects found by gate run 1) and
`20260917000003` (D-11 idempotency **replay checked BEFORE** the session-status check, P-4
ordering — found by gate run 2 T-4). `.p8-gate.cjs` (P8_ALL=1, true-parallel, relational
final-state asserts, zero-residue teardown): **PASS=2 (T-1, T-4), EXPECTED-CONFLICT=6
(T-2/T-3/T-5/T-6/T-7/T-8 — both interleavings legal), REAL-RISK=0, HARNESS-FAILURE=0**, no
40P01 in any race, residue 0/0/0/0/0/0/0/0 post-cleanup (evidence `.p8-audit/`).

Approved Q1 data repair (single audited txn, pre/post snapshots in `.p8-audit/`): 4 orphan
fixture sessions closed at `actual = cash_session_expected` (diff 0.00, note "P-8 orphan repair
(fixture session)"), 6 zero-amount P-7 legacy rows deleted (D-20); ledger 195→199 append-only.
Residual for P-9: the 12,900.00₼ misattributed fixture amount on session 4d5aa595 (closed clean;
underlying attribution = P-9).

Full frozen reflow GREEN post-P-8: **A 39/39 · E/S 54/54 · F 35/35 · O 38/38 · K L3 8/8 +
L4 16/16 · P-1 29/29 · P-2 13/13 · P-3 25/25 · P-4 19/19 (mandatory reflow after FK drop) ·
P-5 10/10 · P-6 15/15 · P-7 16/16 (9P+7EC)**. Two reflow incidents were root-caused as
**environment/harness, NOT P-8 code**: (1) A gate O-1/C-2 = pre-existing `A_RT_*` staff
residue with valid PBKDF2 hashes contaminated the `login_preflight` candidate pool (A's
cleanup deactivates only 3 of its N ids) — fixed by a data-only purge of `A_RT_%` staff,
A gate code untouched (re-run 39/39); (2) O gate R7 crash = missing `O_ROUTE` env in the
reflow driver (env now documented in `.p8-audit/reflow_driver2.sh`).

**P-8 is FROZEN (2026-09-17).** Freeze boundary: P-8 is NOT reopened to "fix something" — any
new finding against the cash-drawer/timeclock writer/lock/state contract requires its own
concrete regression report + classification first. Preserved facts (binding):
(1) cash SSOT = `cash_drawer_log` + canonical walk `cash_session_expected` — refund/void subtract
positive amounts; `reopen` rows carry SIGNED negative amounts (amount<0 allowed only for
type='reopen'); (2) idempotent replay is checked BEFORE the session-status check (P-4 ordering),
and `payment_idempotency_keys.order_id` has NO FK to orders (drawer namespace stores session ids;
integrity = (namespace,key) unique + per-namespace binding check + P-4 key-after-write rule);
(3) `emit_outbox_event` COALESCEs NULL jsonb args (outbox_events.metadata/payload NOT NULL);
(4) `close_cash_register_v2`: FOR UPDATE session lock, closes bound shift inside close,
`clock_out` is blocked by DRAWER_OPEN, `auto_clockout_staff` skips shifts with open drawers (D-2a),
manager approval = server-verified `manager_pin` (verifyPin + cash.close.approve + same-org;
`body.manager_id` is rejected); (5) trusted 5-arg path (`p_token NULL`) = service/postgres
context, pre-P-8 semantics (used by E/S R5 + the Q1 repair).
New findings for later modules (NOT P-8, no change made): `{public}`-ALL RLS on
`overtime_records`/`schedule`/`shift_breaks`/`shift_swap_requests` (P-2 RLS-OFF class, → P-9
regression report); A-gate cleanup weakness (→ its own hardening, A stays frozen).
Next module: **P-9 — schema normalization** per the ratified boundary (settings decomposition,
duplicate columns, legacy models, FK cleanup) — **not auto-started**.

**P-9 SCHEMA NORMALIZATION — COMPLETE + FROZEN (2026-09-18):**
8 migrations applied live (`20260918000001…0008_p9_*`, each with rollback; see
`P9_FREEZE_REPORT_2026-09-18.md` §2): M1 RLS/GRANT + auth revokes, M2 settings views, M3
app_settings cleanup, M4 orders_items drop, M5 dead tables **archive-then-drop** (17
`p9_archive_%` copies retained; drops incl. `audit_log`), M6 **10 safe FKs** (7 CASCADE /
SET-NULL class / **1 RESTRICT** = `p9_fk_table_floors_current_order_id`), M7 staff fixture
purge (neutralize, never delete). New gate `.p9-gate.cjs` (S1–S7 + S5.4a–d, GO-2): **25/25
PASS**. Full ratified 12-step reflow GREEN (evidence `.p9-audit/reflow/`): **A 39/39 ·
E/S 54/54 · F 35/35 (Option A) · P-9 25/25 · O 38/38 (O-A+O-B) · K-L3 8/8 · K-L4 16/16
(K4-A) · P-1 29/29 · P-2 13/13 · P-3 25/25 · P-4 19/19 · P-5 10/10 · P-6 15/15 · P-7 16/16
(9P+7EC) · P-8 8/8 (2P+6EC, 0 risk)**.

The one recurring conflict class (documented, resolved, frozen): **M6's RESTRICT FK vs
pre-M6 frozen teardown order** hit three frozen gates (F, O, K-L4) — each resolved by a
teardown-only correction with its own ratified GO (Option A 2-line swap in `.f-gate.cjs`;
O-A swap + O-B pointer-null in `.o-gate.cjs`; K4-A 1-line pointer-null in
`.k-l4-probe.cjs`). No assertions changed, no manual DB deletes (crash residues
self-cleared by each gate's own START cleanup). Preserved facts (binding):
(1) M6 FK stays `ON DELETE RESTRICT`; (2) 53-ID DENY53 staff denylist intact, active pool
exactly 9, 0 active/pinned outside it (S5.4a–d); (3) `p9_archive_%` tables = pre-drop
copies (drop needs a separate GO); (4) legacy drift rows (274/54/13/4 paid-without-record,
`refund_amount>paid_amount` legacy 4, 12,900.00₼ session 4d5aa595) = frozen data
residuals, no backfill (D-5). Calibration note: `.p8-gate.cjs` L167 `DELETE FROM
audit_log` is a dead line after M5 (gate still 8/8, zero-residue; exit code depends on
RISK only) — micro-fix needs its own GO. **P-9 is FROZEN (2026-09-18).** Next module:
**P-10** (external processor/webhook) — not auto-started.

## 5. NEXT MODULE: **P-7 — CONCURRENT MUTATION** (the financial SSOT boundary, continued)

**Where we left off (2026-09-14):** P-1…P-6 are **all frozen, committed, and pushed**
(`main == origin == 0c59227`). The single financial-write path is now:
**UI → API route (RBAC + CSRF + shift) → atomic RPC (session identity + location scope +
`FOR UPDATE`) → DB triggers/guards → audit + outbox**, and each mutation class has a
frozen gate that proves it live. The one thing **not yet proven is what happens when two
of these race** — that is P-7. (P-4 already proved the *idempotent-replay* axis; P-6
proved the *concurrent-refund* axis in isolation. P-7 is the general cross-mutation matrix.)

### 5.1 The ratified P-7 scope (execute in this order)
- **Pay / Pay (same order, different or same key):** two `complete_payment_atomic_v2`
  in flight → exactly one captures; the other gets `ORDER_ALREADY_PAID`/`PAYMENT_EXCEEDS_
  REMAINING`/`IDEMPOTENCY_CONFLICT`. No double `captured` row, no overpaid order.
- **Pay / Cancel (same order):** pay `→paid` vs `cancel` racing → one wins; the order
  cannot end `cancelled` with a captured payment, nor `paid` while cancelled.
- **Pay / New-seat on a dirty table:** payment writes `dirty`+clears pointer; a concurrent
  new-seat must be **server-blocked** (the F `dirty` guard) until Clear — prove no
  double-occupancy of a table.
- **Pay / Dismiss (table):** `dismiss_table_state_aware` vs an in-flight payment.
- **Drawer close / Payment in flight (045 boundary):** `close_shift_atomic` must not
  close a shift while a cash payment is mid-capture (the 045 OPEN+closed invariant stays).
- **Reopen / Payment (post-P-6):** a `reopen_order_atomic` (full reversal) racing a new
  `pay` on the just-reopened order → no lost update / no orphan payment row.
- **Duplicate RPC across the matrix:** any two same-key calls → exactly-once (P-4 holds).
- **Stale-state:** a mutation built on a pre-read `version` that is no longer current →
  optimistic/lock rejection, no silent overwrite.

**Method (P-0…P-6 pattern, ratified):** **read-only inventory first** (map every writer
that can reach `orders.status` / `order_payments` / `tables` concurrently + its lock +
its guard) → **decision matrix for ratification** → **implement only ratified changes**
→ **live proof** (a `.p7-gate.cjs` concurrency battery: N parallel workers per pair,
assert the exact invariant + zero mutation on the loser) → **full frozen reflow**
(P-1…P-6 + O/F/K) → **atomic commit/push**. Do **NOT** touch the DB before ratification.

### 5.2 Repo / Supabase / how-to (the practical wiring a new agent needs)
- **App root:** `artifacts/saito-admin/` (Next.js). Routes under `src/app/api/**`.
  Key libs: `src/lib/api-auth.ts` (`validateAuth`/`requirePermission`),
  `src/lib/location-context.ts` (`resolveWriteLocationContext` — server-side location,
  **never** trust a client `location_id`), `src/lib/csrf.ts`, `src/lib/shiftLock.ts`.
- **DB (Supabase, pooler for psql):** 
  `psql -h aws-1-eu-central-1.pooler.supabase.com -p 6543 -U postgres.jbxmlnsicbfkbsatnoej -d postgres`
  (password in prior session notes / `.env.local`). **Use the pooler (6543), not direct.**
  PostgREST base: `https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/`. The
  **service-role key** is in `artifacts/saito-admin/.env.local` (`SUPABASE_SERVICE_ROLE_KEY`).
- **Live financial writer fns (the P surface):** `complete_payment_atomic_v2` (14-arg,
  `p_location_id`), `refund_with_inventory` (11-arg), `reopen_order_atomic` (**5-arg**,
  `p_token` leading — the legacy 4-arg form is frozen to postgres-only),
  `transition_order_atomic`, `void_items_state_aware`, `recalculate_order_payment_state`,
  `authorize()` (token→staff+location+permission SSOT), `has_permission(uuid,text)`,
  `p1_actor_allowed_at_location`, `log_audit` (→ `audit_logs_canonical`),
  `emit_outbox_event`.
- **Ledger + invariants (frozen):** `order_payments` is **immutable** (UPDATE
  `amount`/`method`/`is_refund`/DELETE blocked except the trusted
  `app.payment_ledger_reopen` flag that `reopen_order_atomic` sets). A `→paid` order
  **must** have a non-refund `captured` row (`trg_order_paid_requires_record`).
  Idempotency = `payment_idempotency_keys` PK `(namespace, key)` (namespaces:
  `payment`/`refund`); a conflict `RAISE` is **P0001** (never `40001` — see §5.4).
- **Migrations:** `supabase/migrations/20260913000001_p4_…sql`,
  `20260914000001_p5_…sql`, `20260914000002_p6_…sql`; pre-state backups in
  `supabase/migrations/_p?_rollback_202609*/`.
- **Gates:** `.p1-gate.cjs`…`.p6-gate.cjs`, `.o-gate.cjs`, `.f-gate.cjs`,
  `.k-*-probe.cjs`. All **idempotent, zero-residue**, hit the **LIVE DB + local dev
  server** (`http://localhost:3000`, must be running: `cd artifacts/saito-admin &&
  npm run dev`).

### 5.3 Probe conventions (follow exactly — they are load-bearing)
1. `SUPABASE_SERVICE_ROLE_KEY` from `artifacts/saito-admin/.env.local`.
2. Staff fixtures named `P?_%` — set **INACTIVE at teardown, never deleted** (F-contract).
3. HTTP probes need **`x-csrf-token` == `saito_csrf` cookie** (double-submit) + a valid
   `saito_token` session; `requireActiveShift()` is gated on an **open shift** — so
   refund/reopen/void probes must **create an open shift** for an ACTIVE staff first.
4. `shifts.status` is the **`shift_status` ENUM** (`'OPEN'`/`'CLOSED'`), not free text;
   only **ACTIVE** staff may open a shift (`trg_shift_active_staff`).
5. `order_items` has **no `organization_id` column** and a **nullable `product_id`**
   (org derives via the order FK) — fixtures use `NULL`.
6. **Dev server ECONNRESET / `socket hang up` under load → retry 3×** (the P-4/P-5/P-6
   pattern). A single transient `500 "upstream request timeout"` (pooler) on one leg of
   a *concurrency* test is infra, not a contract failure — assert the **invariant**
   (e.g. "never over-refund"), not the exact per-leg status.
7. **Drain the pooler + settle** between heavy gate runs (`kill` stray `psql`, wait);
   run gates **solo** (not in parallel) and **backgrounded** (the foreground 5-min cap
   kills long batteries).
8. **O-gate kill-hazard:** `.o-gate.cjs` pauses `trg_orders_sync_table_floors` +
   `trg_order_table_location` inline (not in `finally`). A **killed** O-gate leaves them
   DISABLED → the next K-L4 shows `G_CLEAR_ORDER_POINTER` 12/16. **Re-enable both to `O`**
   after the O-gate; verify `pg_trigger.tgenabled='O'` on `orders`.
9. Financial teardown: remove probe `order_payments`/`orders` **in one transaction under
   the trusted `app.payment_ledger_reopen` flag** (else the P-3 immutability trigger
   blocks the DELETE).
10. `log_audit` writes to **`audit_logs_canonical`** (not `audit_logs`).
11. Build gate for any `.ts` change: `cd artifacts/saito-admin && npx next build`
    (expect exit 0) and `npx --no-install tsc --noEmit` (0 non-test errors).

### 5.4 Ground rules (from K, ratified — unchanged)
1. DB = SSOT; outbox = scoped delivery; never a client-authoritative amount/state.
2. Every mutation: session identity + server location + RBAC + `FOR UPDATE` + audit
   + outbox, in one atomic function.
3. A proven regression may touch a frozen module ONLY with an explicit, scoped,
   ratified exception (the 042/045 pattern) — and the freeze document is updated.
4. Live proof > code review: every P claim needs a zero-residue probe row, like K's.
5. Financial immutability: amounts are never UPDATEd; corrections are append-only.
6. **Never `RAISE … USING ERRCODE='40001'`** — `40001` (serialization_failure) **hung the
   PostgREST→pgbouncer gateway** (backend stuck `idle in transaction (aborted)`, the error
   never reached the client → 500/504/120s-timeout on every 409). Use the default `P0001`
   (the proven `ORDER_ALREADY_PAID` path) → a real HTTP 409. (Root-caused + fixed in P-4.)

### 5.5 Out-of-scope / deferred (do not silently pick up)
- **P-10** external processor/webhook · **P-11** failed-payment recovery · **P-12** close-out.
  P-8 and P-9 are **FROZEN** (see their blocks above); their frozen data residuals — the 4
  `refund_amount>paid_amount` legacy rows, the 274/54/13/4 paid-without-record drift, the
  12,900.00₼ misattribution on session 4d5aa595 — stay deferred (no backfill, D-5); the
  ledger **delete-vs-append** model remains an open P-9-adjacent decision; the 17
  `p9_archive_%` tables await a separate drop-GO after a retention window.
- **`git gc` warning:** pre-existing missing object `709d1c59` (commit `1b807aeb` cannot
  resolve its parent; unreachable from `main`). **Not a blocker; do NOT `git gc`/prune
  without user sign-off** (destructive).

### 5.6 Repo hygiene (2026-09-14)
Archived 41 superseded top-level `*.md` (A/E-S/F/O/K freeze + foundation reports, old
POS/audit/torture reports, scratch `plan-*.md`, `.aider.chat.history.md`,
`artifacts/saito-admin/HANDOFF.md`) — all recoverable from git history. **Kept:** this
file, `README.md`, `replit.md`, `ARCHITECTURE.md`, `BACKEND_ROADMAP.md`,
`MASTER_FEATURE_MAP.md`, and the P-0…P-6 contract/inventory docs. An untracked
`ES_CASH_RPC_DRIFT_AUDIT_2026-09-13.md` (the E/S cash-RPC drift note) is left for the
E/S blocker owner, deliberately not committed here.

---

## 6. W-A1 — QR GUEST IDENTITY + M0 LOYALTY REPAIR — 🔒 (2026-09-19)

> **⛔ DAIMİ İCRA QAYDASI (user-ratified, 2026-09-19) — BÜTÜN WAVE-LƏRƏ KEÇƏRLİ:**
> Backend / logic / schema / migration / gate hissələri **avtonom** icra olunur
> (freeze-and-audit, gate, reflow, commit). **UI hissəsinə çatanda HARD STOP** —
> UI istifadəçi ilə **BİRLİKDƏ** edilir (birgə nəzərə Alma, lay-out/qərar
> istifadəçinin təsdiqi ilə). Agent UI-ni tək-təlikə commit etmir.

**Full record:** `W_A1_FREEZE_REPORT_2026-09-19.md` · **Plan/decisions D1–D11:** `W_A1_PLAN.md`.

- **Shipped:** M0 (loyalty tables repair — P-7 09-14 latent regression, earn broken since 09-14), M1 (`customers_phone_uq` + `guest_link_customer`), QR route `customer_phone` extension, new `GET /api/orders/qr/status`, menu phone capture + status card, `CustomerSelect` D10 explicit counters.
- **Gate evidence:** W-A1 18/18 + route E2E 5/5 (residue 0); P-9 25/25 (REAL-RISK=0); full reflow re-run green on 13/15 units (table in freeze report §2).
- **Production hardening KEPT:** `src/middleware.ts` (probe 5xx/empty → transient → route re-check; genuine revokes still hard-401) + new `src/instrumentation.ts` (GET socket-race retry, nodejs runtime). Both proven by the P-7 half-2 investigation (§3 freeze report).
- **Harness alignment:** 7 gate teardowns now clear `pin_hash` (house contract); 66 inert 09-18 fixture rows neutralized (script + asserts in `.w-a1-audit/w_a1_staff_neutralize.cjs`); P-7 gate retry budgets env-tunable (defaults unchanged).
- **OUTSTANDING (external blocker — Supabase incident 6q5902p2xd9f, "401 errors due to JWT rejections", API Gateway degraded; vendor rollout weekend of 09-18/19):**
  1. `node .p7-gate.cjs && P7_HALF=2 node .p7-gate.cjs` → expect 16 accounted, 0 REAL-RISK, 0 HARNESS.
  2. `P8_ALL=1 node .p8-gate.cjs` → expect 2 PASS + 6 EXPECTED-CONFLICT.
  When both land green, W-A1's freeze is complete in full; no code change expected.
- **Secret hygiene:** `.audit-*` (09-12 audit artifacts, plaintext service_role key inside) are gitignored + never committed; junk redirect fragments trashed.

### W-A2 — ADD-TO-CHECK + QR PRICE HARDENING — 🔒 (2026-09-19)

**Full record:** `W_A2_FREEZE_REPORT_2026-09-19.md` · **Plan/decisions D12–D17:** `W_A2_PLAN.md`.

- **Shipped:** D12 `check_token` (hash in `orders.qr_check_token_hash`, raw returned once) + `POST /api/orders/qr/add`; D13 server-sourced prices on BOTH QR paths (client `unit_price` ignored — G3 underpay gap closed); D14 `qr_add_items` RPC (FOR UPDATE, finalized reject, per-item idempotency); D16 incremental total mirroring frozen `add_item_atomic` (the SSOT-recompute draft was rejected on live VAT-18% evidence before use); **D17 latent production defect fixed** — first QR order on any `empty`/`cleaning` floor 500'd (`table_release_guard` via the F-05 sync UPDATE; 27/33 live floors are `empty`); the create route now flips released→occupied pre-insert (app layer only, triggers FROZEN).
- **Gate evidence:** `.w-a2-gate.cjs` **14/14** route-level E2E (real HTTP, zero residue, crash self-heal via `.w-a2-fixture.json`); narrowed reflow **O 38/38 · W-A1 18/18 · F 35/35** (justification: freeze report §2).
- **UI = HARD STOP:** menu "continue your check" (localStorage checkToken, add-to-cart UX) is designed together with the user. Backend is ready: `checkToken` in the create response, `POST /api/orders/qr/add` with 404/409/400 error contract.
- **FOLLOW-UPs (documented, not shipped):** QR on `reserved`/`out_of_service` floors stays allowed (pre-existing); token rotation is out of scope (token dangles on finalize — lookup fails safely).

---

 *Handover refreshed at W-A2 freeze (2026-09-19). Baseline numbers are from live gate runs
   (`.w-a1-audit/reflow/`, `.w-a2-audit/reflow/`); re-run the §1 commands to re-establish them
   before starting the next wave (W-A2 UI collaborative session → then Wave A #2: customer
   timeline).*

---

## 7. TECHNICAL MANAGER OPERATING RULES — **MUTLƏQ / MANDATORY** (user-ratified, 2026-09-19)

> Hər Saito agent/sessiyası üçün bağlayıcı. Bu 12 qayda freeze-and-audit disiplin
> üzərinə qurulur və onları əvəz ETMİR — genişləndirir.

**1. NEVER DECIDE FROM SUMMARY ALONE.** Previous reports, memory, plans, feature maps,
agent summaries, commit messages, user claims are NOT sufficient evidence for
GO / NO-GO / migration / architecture / freeze decisions. Inspect: repository state,
source code, migrations, live schema, functions/RPCs, triggers, RLS policies, grants,
constraints/FKs, tests, git status/diff, runtime writer paths, dependencies.
If evidence cannot be inspected → mark the decision **UNVERIFIED**. Never present
inference as verified fact.

**2. ALWAYS SEPARATE EVIDENCE FROM INFERENCE.** Structure important findings:
**Evidence** (directly observed) / **Inference** (what it may mean) / **Risk**
(what breaks if wrong) / **Decision** (GO / NO-GO / INVESTIGATE / DEFER).

**3. FROZEN MEANS FROZEN.** Do not modify a frozen module/contract/migration boundary/
business rule/backend gate merely to unblock UX; do not weaken constraints, bypass RLS,
alter permissions, rewrite business logic, or add compatibility hacks inside the frozen
boundary. If the boundary must change → stop; only (a) proven production regression or
(b) a separately user-ratified decision reopens it — always with decision-log entry,
additive migration, gate + reflow, freeze-report update.

**4. INSPECT BEFORE MODIFYING.** Determine: current implementation, live state,
dependencies, affected writers/readers, security implications, frozen-boundary impact,
data implications, rollback/recovery path, required tests. Only then implement.

**5. "TESTS PASS" IS NOT THE ONLY GO SIGNAL.** Passing tests are evidence, not proof
of architectural correctness. Reject if: frozen-contract violation, unauthorized writer,
RLS assumption break, migration drift, data inconsistency, unsafe rollback, live-schema
conflict.

**6. PROTECT THE SCOPE.** Do not expand the task silently. Extra discovered work is
classified **BLOCKER / REQUIRED / FOLLOW-UP / DEFERRED**; continue only within approved
scope.

**7. CHALLENGE PREVIOUS DECISIONS WHEN EVIDENCE CHANGES.** Identify the contradiction,
explain what changed, stop affected work if needed, reassess. Do not defend an old
decision merely because it was approved.

**8. MANAGER LOOP.** For every significant task: **INSPECT → RECONCILE → IDENTIFY
RISKS → DECIDE → IMPLEMENT → VERIFY → REPORT.** Never PLAN → CODE directly for
high-impact work.

**9. MIGRATION DISCIPLINE.** Before changing DB structure: live schema, migration
history, existing objects, dependencies, FKs, functions/triggers, RLS/policies, data
state, classification (additive/destructive/corrective/conflicting), rollback path.
Never create a migration merely because the repo appears to miss an object — the live
database is part of the evidence.

**10. SECURITY IS NOT A UI FEATURE.** Verify the complete chain: **UI → route/API →
permission check → RPC/function → RLS/DB constraints → audit**. Missing critical layer
→ report.

**11. CORRECTNESS OVER SPEED.** A slower verified decision beats a fast migration that
creates rework. Objective: minimum future rework + maximum correctness.

**12. FINAL DECISION FORMAT.** For significant decisions report: Evidence / Inference /
Risks / Frozen-boundary impact / Decision (GO / NO-GO / INVESTIGATE / DEFER) / Scope
(exactly what will and will not change) / Verification (how correctness is proven).

**Insufficient evidence → STOP → INSPECT → RECONCILE → DECIDE. Guessing is a defect.**
