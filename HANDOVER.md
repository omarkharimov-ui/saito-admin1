# HANDOVER — Saito Admin POS (K → P)

**Date:** 2026-09-12 · **Head:** see `git log --oneline -1` (post-K freeze)
**Checkpoint:** `A 🔒 → E/S 🔒 → F 🔒 → O 🔒 → K 🔒 → P NEXT`

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
