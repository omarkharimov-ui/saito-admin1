# P-1 / P-3 BASELINE INTEGRITY — RATIFIED (2026-09-13)

**Disposition:** test-residue cleanup + P-1 harness compatibility fix. **No production
business logic changed** (no `.ts` route, no migration, no RPC signature). All evidence
below is raw live output (pooler psql 6543 + live gates on dev server :3000).

---

## 1. Why this commit exists

The P-3 immutability trigger (`trg_order_payment_immutable`) made every
`order_payments` row delete-immutable outside the trusted
`app.payment_ledger_reopen` flag. P-3 patched `.p2-gate.cjs` and the K L3/L4 probes to
teardown under that flag but **missed `.p1-gate.cjs`** (last committed in P-1 itself,
`9a4546d`; P-2/P-3 commits touched it 0 times). Consequence: a P-1 full run passed all
functional checks but crashed in its post-functional `cleanupOids`
(`PAYMENT_RECORD_IMMUTABLE`), leaving its fixtures half-cleaned and making the
P-1-25 zero-residue check unreachable.

Separately, live residue from earlier P-1 probe runs was found and removed:

| Residue | Signature | Disposition |
|---|---|---|
| `a4d0f34f-…` (LOC_B) + 1 item | probe twin, 0 payments, created 2026-09-12 20:59:39 UTC | **DELETED** (trusted flag, single txn) |
| `bcb69ece-…` + 1 item | LOC_A twin of the above, same second, `created_by=NULL` | **DELETED** (trusted flag, single txn) |
| `0968de09-…`, `19995ae2-…`, `d204e1c5-…` + 1 item each | `created_by=NULL`, `product_name='P'` probe items, 0 payments | **DELETED** (same pattern) |
| 12 original + 6 crashed-run `P1_` staff fixtures | gate fixtures, `name LIKE 'P1_%'` | **INACTIVATED** (`is_active=false`, `status='INACTIVE'`; staff rows never deleted — F-contract) |
| 1 orphan `inventory_logs` row (ledger `de44f464`) | FK `SET NULL` cascade from a deleted probe item | **RETAINED intentionally** — append-only immutable ledger, not residue (matches all gate teardown behavior) |

Teardown order (single transaction each, P-3 gate pattern):
`set_config('app.payment_ledger_reopen','on')` → payments → idempotency_keys → outbox →
audit_logs → operation_logs → order_items (with `trg_inventory_logs_immutable` disabled
around the cascade) → orders → flag off → COMMIT. Before/after: `created_by IS NULL`
orders **4 → 0**.

## 2. The `.p1-gate.cjs` change (test-harness only)

`cleanupOids` and the error-handler residue path now run the payment/order teardown in
ONE transaction under the trusted flag — byte-for-byte the same pattern as
`.p2-gate.cjs` / `.p3-gate.cjs`. Nothing else in the harness changed; all 29 assertions
and their expectations are untouched.

`.o-gate.cjs` was inspected and **deliberately not patched**: it deletes only
`orders`/`order_items` (0 `order_payments` references), so P-3 immutability cannot bite it.

## 3. Green-chain proof (this session, live, dev server :3000)

| Gate | Result | Exit |
|---|---|---|
| `.p1-gate.cjs` (post-patch) | **29/29** (P1-25 zero-residue now reachable + PASS) | 0 |
| `.p2-gate.cjs` | **13/13** | 0 |
| `.p3-gate.cjs` | **25/25** | 0 |
| `.o-gate.cjs` | **38/38** (Z1 END residue = 0) | 0 |
| `.f-gate.cjs` | **35/35** (Z1–Z5 clean) | 0 |
| `.k-l3-probe.cjs` | **8/8** (D3-5: 0 residue) | 0 |
| `.k-l4-probe.cjs` | **16/16** (L4-16: 0 residue) | 0 |

Zero-residue final sweep (live SQL): `orders_in_loc_b=0`,
`distinct_order_locations=1`, `created_by_NULL_orders=0`, `P1_/P2_/P3_/G2_` active staff
= 0, orphan payments/items/order-typed-outbox (2h) = 0, `recent 0-item NULL-table 30m` = 0.

P-3 integrity unchanged: `trg_order_payment_immutable` / `trg_order_underpayment_guard`
/ `trg_payment_state_machine_guard` all `enabled=O`; state registry payment=22,
order=61, item=102, table=0 (frozen baseline).

Location fallback restored: `p1_actor_allowed_at_location` single-location-with-data
fallback active again — `Kassir_allowed_at_Main=true`,
`TuralMemmedov_allowed_at_Main=true` (real function calls, live).

Notes: back-to-back heavy gate runs flake under pooler congestion / the 5-req/60s
payment rate limit (observed: P-3 H3 403 once, K L3 ECONNRESET twice) — each passed
clean on a settled solo re-run. Rule: drain pooler + settle between heavy HTTP gates.

## 4. Explicitly OUT of this commit (separate boundaries, still queued)

- **E/S cash-RPC drift attribution** — audited and disproven as a live blocker
  (live E/S gate 54/54 green); the residual action is the `cash_in_atomic` /
  `cash_out_atomic` **migration backfill** (08-26 atomic batch was applied to the live
  DB with no committed migration). Separate investigation/change boundary — see
  `ES_CASH_RPC_DRIFT_AUDIT_2026-09-13.md` (untracked, pending its own disposition).
- **A module blockers** (O-1 `uuid:""` fixture lookup, C-2 login/disable race) —
  unchanged, still a module-A investigation.
- **P-4 (Idempotency)** — NEXT module; starts after this commit.

## 5. Resulting state

`P-1 → P-2 → P-3 foundation chain = clean ratified baseline` (29/29 → 13/13 → 25/25,
full A/F/O/K green, zero residue). No P-side blocker remains for P-4 entry; E/S external
queue and A investigation stay separate and do not pollute P-4 scope.
