# P-4 — IDEMPOTENCY CONTRACT (ratified 2026-09-13)

**Status:** D-1…D-8 RATIFIED by user (see disposition table below). This document fixes
the concrete implementation form of each decision. Migration:
`supabase/migrations/20260913000001_p4_idempotency_contract.sql`.
Acceptance (verbatim, ratified):

> **For every retried client payment/refund request, the database produces at most one
> financial effect, and a reused idempotency key can never silently represent a different
> operation.**

---

## Disposition (ratified)

| Decision | Ruling |
|---|---|
| D-1 Server-side key control | RATIFY |
| D-2 Key scope | RATIFY — order-scoped payment idempotency |
| D-3 Same key, different payload | RATIFY — **409**, zero mutation |
| D-4 Refund idempotency | RATIFY — separate namespace |
| D-5 Replay freshness | RATIFY |
| D-6 TTL + duplicate index | RATIFY — retention fixed here (30 days) |
| D-7 Failed attempts | RATIFY — no financial mutation = no successful idempotency claim |
| D-8 Webhook | FREEZE N/A (0 receivers, proven) |

## C-1. D-1 — Who controls the identity (concrete form)

- **The route is the authoritative gate; the DB function is the canonical enforcer.**
- `POST /api/orders/pay` and `POST /api/orders/refund` **REQUIRE** `idempotency_key`:
  missing / non-string / empty / > 128 chars → **400 `IDEMPOTENCY_KEY_REQUIRED` /
  `IDEMPOTENCY_KEY_INVALID`**, zero mutation. (Closes F-1: 23+23=46 is no longer
  reachable via the app; keyless direct-RPC access remains service-role-internal only.)
- The **server ignores any semantic prefix in the key text** (`pos:`, `refund:` etc. are
  opaque). The **operation namespace is derived server-side from the operation itself**,
  never from the key string:
  - `complete_payment_atomic_v2`: `namespace = (v_refund_total > 0) ? 'refund' : 'payment'`
  - `refund_with_inventory`: `namespace = 'refund'`
- **Server-side minting (the issuance half of D-1)** applies to **server-initiated
  financial executions** that have no client: the approvals route (approved-refund
  execution, `approvals/route.ts`) mints the canonical key
  `approval:<approval_request_id>` — deterministic per approval row, so re-approving /
  double-clicking the same approval row can refund **at most once**.
- Client-generated key text is a **retry token** (the UI keeps memoizing
  `payKeyFor`/`refundKeyFor` per page instance) — the boundary (route + DB) validates
  format and owns scope/namespace/enforcement. This satisfies "identity must be
  controlled by the authoritative payment boundary": the boundary decides whether a key
  exists, whether it is well-formed, and what it may represent.

## C-2. D-2 — Key scope (concrete form)

- Canonical unique identity: **`(namespace, key)`** UNIQUE.
- The stored row is **bound** to `(order_id, amount, namespace)`. Any replay request
  whose `(order_id, amount)` differs from the stored binding → **409** (C-3). Therefore a
  key can never be silently used against another order: uniqueness on `(namespace, key)`
  makes the second order's attempt a **replay attempt**, and the binding check rejects it.
- `payment` and `refund` namespaces are disjoint: the same key text may be used once in
  each namespace (a pay and its refund are independent operations).
- Legacy rows (9) backfilled `namespace='payment'` (all were payments).

## C-3. D-3 — Mismatch = 409 CONFLICT, zero mutation (concrete form)

Replay lookup (AFTER the `FOR UPDATE` order lock, so concurrent same-key calls
serialize):

```
IF key row found (namespace, key):
    stored.order_id  != request order_id   → RAISE IDEMPOTENCY_CONFLICT  (409)
    stored.amount    != request amount     → RAISE IDEMPOTENCY_CONFLICT  (409)
    otherwise                               → REPLAY (C-5)
```

- `IDEMPOTENCY_CONFLICT` raises with `ERRCODE '40001'`; routes map it to **HTTP 409**.
- RAISE = full rollback = **zero financial mutation** on mismatch (D-7 semantics).
- For refunds, "amount" = the effective refund amount (`p_amount` or
  `unit_price × quantity` as resolved by `refund_with_inventory`); for payments,
  "amount" = `v_non_refund_total − v_refund_total` (the signed financial effect, exactly
  the value already stored today).
- Documented nuance (refund quantity with equal amount, e.g. 2×10 vs 1×20): the
  financial contract (amount, order) is identical → replay. The inventory double-
  protection stays via the pre-existing H10.1 fate guards ("Stock already returned").

## C-4. D-4 — Refund namespace (concrete form)

- All three refund execution points are keyed:
  1. Item-level: `refund_with_inventory` gains `p_idempotency_key text DEFAULT NULL`
     (10→11 args); dedupe + store with `namespace='refund'`.
  2. Order-level (`/api/orders/refund` mode 2 → `complete_payment_atomic_v2` with
     `is_refund:true`): route passes the required key; namespace auto-derived `'refund'`.
  3. Approval-executed refund (`approvals/route.ts`): server-minted
     `approval:<approval_id>` (C-1).
- **Two refund clicks, one refund row** (same memoized UI key → second click replays the
  stored success, `idempotent:true`). Net-paid cap remains as a second layer, not the
  idempotency mechanism.
- `p_idempotency_key IS NULL` at the **function** level still executes (legacy
  service-role/internal path, e.g. gate RPC-level races) — the **route** level is where
  keyless is refused. This keeps DB-level backward compatibility while closing the
  production HTTP path.

## C-5. D-5 — Replay freshness (concrete form)

Replay response = **two explicit layers** (never a bare stale snapshot):

```json
{
  "idempotent": true, "duplicate": true,
  "original": { …the stored result verbatim… },
  "current":  { "status": …live order status…, "paid_amount": …, "refund_amount": …,
                 "remaining": …, "replayed_at": …now… }
}
```

- `original` answers "what did this request do when it first succeeded?"
- `current` (re-read under the held `FOR UPDATE` lock) answers "what is true now?" —
  a refunded/cancelled order is visible as such, so a replay can never masquerade as
  current truth.
- The route passes both layers through (`original` fields spread at top level for
  backward compat + `current` + `idempotent`/`duplicate` flags).

## C-6. D-6 — Retention + index hygiene (concrete form)

- **`P4_KEY_RETENTION_DAYS = 30`** (contract constant; the key metadata is a retry
  window, not history). `expires_at = created_at + interval '30 days'`; legacy rows
  backfilled the same way.
- Pruner RPC `prune_expired_idempotency_keys()` (service-role-only, advisory-locked,
  idempotent): deletes **only** `payment_idempotency_keys` rows with
  `expires_at < now()`. **Never** touches `order_payments`, `payments`,
  `inventory_logs`, `audit_logs` — the financial ledger/audit history is permanent
  (append-only), per ratified rule.
- The pay + refund routes call the pruner **best-effort** (fire, log, never block the
  payment on pruner failure). No pg_cron exists on this Supabase (verified: 0
  available/installed) — self-throttled RPC is the mechanism.
- Index hygiene: drop redundant `payment_idempotency_keys_key_unique`; replace
  `PRIMARY KEY (key)` with `PRIMARY KEY (namespace, key)` (D-2 scope).

## C-7. D-7 — Failed attempts (concrete form, frozen)

- **No financial mutation = no successful idempotency claim** — the key row commits
  **only with a successful financial write** (same transaction; any RAISE rolls both
  back). Consequences, frozen as contract:
  - `key A → validation/domain failure` (ORDER_ALREADY_PAID, PAYMENT_EXCEEDS_REMAINING,
    REFUND_EXCEEDS_PAID, location errors, IDEMPOTENCY_CONFLICT) → **no key row** → a
    corrected request with key A **may succeed** later. ✓ (ratified case)
  - Deterministic rejections are stable: same key + same invalid payload → same
    rejection, every time.
  - Lost-response retry after a **committed** success → replay (C-5). ✓
- This is the existing behavior; P-4 freezes it into the contract instead of changing it.

## C-8. D-8 — Webhook (FROZEN N/A)

- 0 webhook receivers exist in the app (proven in inventory). **No** webhook
  architecture is added. P-4 exactly-once scope = **client-initiated payments + refunds**
  (3 execution points, C-4). A future external payment processor / webhook boundary is a
  separate audit module. Outbox consumer idempotency is out of P-4 scope (separate
  module), unchanged.

## Behavior matrix (ratified)

### Payment
```
same canonical request (key, order, amount)      → one financial effect; replay C-5
same key + different amount (same order)         → 409 IDEMPOTENCY_CONFLICT; zero mutation
same key + different order                        → 409 IDEMPOTENCY_CONFLICT; zero mutation
different key                                     → independent request
keyless (route)                                   → 400 IDEMPOTENCY_KEY_REQUIRED; zero mutation
```
### Refund
```
same refund key (order, amount)                   → exactly one refund effect; replay C-5
different refund key                              → normal independent refund
keyless (route)                                   → 400 IDEMPOTENCY_KEY_REQUIRED; zero mutation
approval re-execution of same approval row        → server-minted approval:<id> → replay
```

## Gate battery (`.p4-gate.cjs`, 21 items, ratified list)
1 keyed exact duplicate · 2 keyless → 400 · 3 double-click (memoized key) ·
4 network retry (lost response) · 5 same key+same payload · 6 same key+diff amount → 409 ·
7 same key+diff order → 409 · 8 different key → independent · 9 refund double-click ·
10 refund same-key replay · 11 concurrent identical payment · 12 concurrent different
keys · 13 failed attempt → retry semantics (D-7) · 14 replay after order state changed
(C-5 `current` layer) · 15 zero financial mutation on mismatch · 16 exactly-once ledger
effect · 17 idempotency row uniqueness · 18 TTL/pruner behavior · 19 duplicate-index
absence · 20 P-1/P-2/P-3 full reflow · 21 O/F/K frozen ecosystem regression.

## Rollback
`supabase/migrations/_p4_rollback_20260913/` (pre-state captured before apply):
original `complete_payment_atomic_v2` + `refund_with_inventory` bodies, original index
state, original table DDL. Apply order in reverse restores byte-identical functions.
