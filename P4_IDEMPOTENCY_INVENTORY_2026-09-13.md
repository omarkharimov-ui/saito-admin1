# P-4 — IDEMPOTENCY: LIVE INVENTORY & FINDINGS (2026-09-13)

**Status:** evidence-only inventory (P-0 style). **No production changes.**
Raw live evidence: pooler psql 6543 (`pg_get_functiondef`, schema queries) + committed
source at HEAD `dd2ebaa`. E/S cash drift + cash-atomic backfill are OUT of P-4 scope
(separate queue).

---

## 1. Mechanism inventory (what exists)

### 1.1 Storage — `payment_idempotency_keys` (live)
| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text | NO | — |
| `order_id` | uuid | NO | — |
| `amount` | numeric | NO | — |
| `status` | text | NO | — (always `'completed'`) |
| `created_at` | timestamptz | YES | `now()` |
| `result` | jsonb | YES | — |

Indexes: `payment_idempotency_keys_pkey` UNIQUE(key) + `payment_idempotency_keys_key_unique`
UNIQUE(key) (redundant duplicate) + `idx_payment_idempotency_keys_order`(order_id).
Live rows: **9** (8× `pos:<order-uuid>:<uuid>` completed, 1× bare-hash legacy 08-25).
**No TTL, no expiry column, no pruner** — keys persist forever.

### 1.2 Enforcement — `complete_payment_atomic_v2` (the ONLY writer, live body)
Sequence: (1) validate_actor → (2) P-1 location assertion (fail-closed) →
(3) `SELECT * FROM orders … FOR UPDATE` (serialization point) →
**(4) idempotency dedupe: `IF p_idempotency_key IS NOT NULL THEN SELECT result … WHERE
key=… ; IF FOUND THEN RETURN result || {idempotent:true, duplicate:true}`** →
(5–7) parse/validate amounts → INSERT `order_payments` rows (`reference` = the key) →
UPDATE orders → build `v_result` (with `idempotent:false`) →
**(8) key store: `IF p_idempotency_key IS NOT NULL THEN INSERT INTO
payment_idempotency_keys (key, order_id, amount, status, result) VALUES (…,'completed',
v_result)`** → audit → RETURN.

Key properties (evidence-based):
- **All idempotency is conditional on `p_idempotency_key IS NOT NULL`.** No key → steps
  4 and 8 both skip: the call is a plain non-idempotent payment.
- **Key scope = GLOBAL, not per-order/per-actor/per-method.** The unique index is on
  `key` alone; `order_id` is stored but NOT part of the uniqueness scope. A key reused on
  a different order returns the FIRST order's stored result (cross-order replay).
- **Replay returns the stored `result` jsonb verbatim** (`||` merge adds
  `idempotent:true, duplicate:true`). The stored result embeds the winning call's
  `payment_ids` — so a replayed caller learns the original ledger ids. Response is NOT
  re-signed / not re-validated against current order state (e.g. if the order was later
  refunded, a key replay still returns the original `paid` result — see F-4).
- **Insert-then-serve vs serve-then-insert:** the key row is inserted in the SAME
  transaction as the ledger rows (7b) and order update (7c) → atomic. No
  insert-key-before-work pattern, no `status='processing'` row, no failure-path key
  (an exception rolls back the key too → a failed first attempt can be retried with the
  same key and WILL charge — see F-2).
- **`amount` column is stored but NEVER compared on replay** (dedupe matches `key`
  only). Same key + different amount returns the first amount's result (see F-3).
- `order_payments.reference = key` gives ledger→key traceability (live: 7 of 9 keys
  have matching ledger rows; the 2 without are zero-amount/edge rows).

### 1.3 Client contract (committed source, HEAD)
- `POST /api/orders/pay` (route.ts:28,131): **pure pass-through** —
  `p_idempotency_key: idempotency_key || null`. **No server-side key generation, no
  key-format validation, no length cap, no per-actor binding.** Absent key → NULL →
  no idempotency at all.
- POS UI (`app/admin/pos/page.tsx:112-117, 745,832,976,1006,1404`):
  `payKeyFor(orderId)` = `pos:<order_id>:<crypto.randomUUID()>` memoized in
  `payKeyRef` (in-memory Map, per client component instance, cleared on reload).
- **Refund route (`/api/orders/refund`): ZERO idempotency.** Both refund modes call
  `refund_with_inventory` / `complete_payment_atomic_v2` **without any
  `p_idempotency_key`** (grep: 0 `idempotency` occurrences in the file). Double-click /
  retry on a refund = second refund row (bounded only by the `REFUND_EXCEEDS_PAID`
  net-cap, which allows multiple smaller refunds).
- **No webhook receivers anywhere in the app** (grep `webhook` = 0 files) — the
  "webhook replay" axis is currently N/A (no inbound payment webhooks); the exposure
  is instead the outbound/outbox consumers (separate concern, noted for P-4 scope).

## 2. Findings (evidence-backed, no fix applied)

- **F-1 · Keyless pay = no idempotency (route is pass-through).** Any caller that omits
  `idempotency_key` (today: direct API, any non-POS surface, or a UI where the memoized
  ref was cleared by a reload mid-payment) gets plain non-idempotent behavior. The
  financial path's exactly-once guarantee is therefore **UI-memo-dependent**, not
  server-enforced. The only backstops are `ORDER_ALREADY_PAID` (full re-pay) and
  `PAYMENT_EXCEEDS_REMAINING` (overpay) — neither protects **underpay partial** double
  submits (two 23/100 partials = 46 paid, both 200 OK — P-3 H3 shows partials land).
- **F-2 · Failed first attempt consumes nothing → same-key retry CHARGES.** Because the
  key row commits only with success, a network-failed/timed-out first call lets the
  retry with the SAME key go through as a NEW payment. The UI's memoized key makes
  "client network retry" (fetch retry / user re-tap after a timeout where the first
  attempt actually landed server-side) safe ONLY if the key row committed; if the first
  attempt committed but the response was lost, the replay returns the stored result
  (good). The dangerous window is: first attempt **failed before commit** (e.g.
  `PAYMENT_EXCEEDS_REMAINING`, auth error) → retry with same key → charges. Acceptable
  for same-session UX but the semantics are "idempotent on success, not on attempt".
- **F-3 · Key uniqueness is global; amount/order not part of the scope.** Same key on a
  different order → first result replayed (cross-order leak, low exploitability — keys
  are client-generated UUIDs — but the contract is weaker than "per-order"). Same key
  with a **different amount** → first amount wins silently (no mismatch error). The
  stored `amount` column exists precisely to catch this but is unused on replay.
- **F-4 · Replay result is a stale snapshot.** `result` is frozen at win-time. If the
  order is later refunded/cancelled/reopened, a same-key replay still returns the
  original `paid` payload. Clients cannot distinguish "this payment just happened" from
  "this is a replay of a now-superseded result".
- **F-5 · Refunds have no idempotency key at all** (route evidence above). Multiple
  refund attempts each append `is_refund` ledger rows; the net-paid cap is the only
  guard. This is the highest-value exactly-once gap in the P-4 scope.
- **F-6 · No key lifecycle.** No TTL/expiry/pruner on `payment_idempotency_keys`
  (9 rows today, unbounded growth as traffic accrues), and a redundant duplicate unique
  index (`_pkey` + `_key_unique`, both UNIQUE on `key`).
- **F-7 · Concurrent identical payment is sound** (verified by gates): FOR UPDATE on
  the order serializes same-order callers (P-1 P1-07 idempotent dup; P-3 H4
  exactly-once; O CC1/CC2 race = 1 winner, no double charge; K L4-13 2× pay = paid
  once). The serialization point is ORDER-level, not key-level — two DIFFERENT keys on
  the same order serialize and the second hits ORDER_ALREADY_PAID / overpay (correct).

## 3. Open design decisions for the P-4 contract (draft — NOT ratified)

- **D-1 server-side key minting:** route mints `pos:<order>:<uuid>` when the client
  omits a key (kills F-1's keyless-no-protection hole) vs. keep pass-through and
  instead make the UI contract mandatory + validated.
- **D-2 key scope:** keep global unique (current) vs. scope `(order_id, key)` vs.
  scope `(actor, order_id, key)`. Decide the cross-order replay stance (F-3).
- **D-3 mismatch policy:** on replay, compare stored `amount`/`order_id` against the
  request and 409 on mismatch (uses the already-stored `amount` col) vs. silent first-
  wins (current).
- **D-4 refund idempotency:** extend keying to `/api/orders/refund` (both modes) with a
  distinct namespace (e.g. `ref:<order>:<uuid>`) (F-5).
- **D-5 replay freshness:** stamp the replay response with `replayed_at` + current
  order status, or document "replay = original snapshot" as contract (F-4).
- **D-6 key lifecycle:** TTL/pruner + drop the redundant duplicate index (F-6).
- **D-7 failed-attempt semantics:** document (or change) "idempotent on success, not on
  attempt" (F-2) — likely keep, just freeze in contract.
- **D-8 webhook replay:** N/A today (0 receivers); freeze as "no inbound payment
  webhooks" so the P-4 contract states exactly-once scope = client-initiated pays+
  refunds. (Outbox consumer idempotency is a separate module, not P-4.)

## 4. Gate coverage already proven (carry into P-4 freeze)
- Same-key duplicate → exactly one ledger row, replay `idempotent:true` (P-1 P1-07; P-3 H4).
- Concurrent same-order pay → one winner, no double charge (O CC1/CC2; K L4-13).
- Underpay partials → order stays open (P-3 H3) — the F-1 exposure surface.

**NEXT:** ratify D-1…D-8 → migration + route change (server-side keying + refund
namespacing + optional mismatch 409) → `.p4-gate.cjs` battery (duplicate submit,
double-click via memo, network retry lost-response, same-key/diff-amount 409, cross-
order key isolation, refund double-click, concurrent identical, exactly-once financial
effect, response-replay semantics) → full chain re-verify.
