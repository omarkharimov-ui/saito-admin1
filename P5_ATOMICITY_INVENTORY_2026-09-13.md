# P-5 Atomicity — INVENTORY + DECISION MATRIX (2026-09-13)

> P-4 is 🔒 FROZEN (commit `0a61bcf`). P-5 scope (ratified model, HANDOVER §5.2-P5):
> **payment ↔ order** (no paid-without-record, no paid-wrong-order) + **payment ↔ table**
> (`dirty` only via the ratified path; PAID+OCCUPIED stays valid).
> This file is the **inventory** (step 1) + **decision matrix** (step 2). **No DB change
> has been made.** Every number below is a raw live query result (pooler, read-only).

---

## 1. THE `paid` WRITER SURFACE (who can make an order `paid`)

| # | Writer | Sets `paid`? | Creates `order_payments` row? | `p_location_id` (P-1)? | `p_idempotency_key` (P-4)? | EXECUTE ACL (raw) |
|---|---|---|---|---|---|---|
| 1 | `complete_payment_atomic_v2` (14-arg) | ✅ CASE | ✅ | ✅ | ✅ | **`{=X}` = PUBLIC incl anon** |
| 2 | `complete_payment_atomic` (10/11-arg, **v1**) | ✅ CASE `v_total_paid>=total` | ✅ | ❌ **none** | ❌ **none** | `{postgres, service_role, authenticated, test_rls_role}` — **NO anon/PUBLIC** |
| 3 | `transition_order_atomic` (5-arg) | ✅ generic (`status = p_new_status`) | ❌ **NO** | ✅ (session) | n/a | `{postgres, service_role}` only |
| 4 | `process_order_payment` (10-arg) | ⚠️ (legacy; sets paid when full) | ✅ | ❌ | ❌ | `{postgres, service_role, test_rls_role}` |
| 5 | `refund_with_inventory` (10/11-arg) | → `refunded`/`partially_refunded` | ✅ (is_refund) | ✅ | ✅ (11-arg) | 11-arg `{=X}` PUBLIC; 10-arg `{authenticated,service_role,...}` |

**Raw EXECUTE ACL evidence** (`proacl`; `NULL`/`=X` = PUBLIC default = **anon can execute**):
```
complete_payment_atomic args=10 | {postgres,service_role,test_rls_role,authenticated}
complete_payment_atomic args=11 | {postgres,service_role,test_rls_role,authenticated}
complete_payment_atomic_v2 args=14 | {=X,postgres,anon,authenticated,service_role}   <-- PUBLIC/anon
process_order_payment args=10 | {postgres,service_role,test_rls_role}
refund_payment_atomic args=6 | {postgres,service_role,test_rls_role,authenticated}
refund_with_inventory args=10 | {=X,postgres,anon,authenticated,service_role}   <-- PUBLIC/anon
refund_with_inventory args=11 | {=X,postgres,anon,authenticated,service_role}   <-- PUBLIC/anon
transition_order_atomic args=5 | {postgres,service_role}
void_payment_atomic_v2 args=5 | {postgres,service_role,test_rls_role}
```

**Which are reachable through a live route (vs bare PostgREST)?**
- `complete_payment_atomic_v2` ← `/api/orders/pay` (canonical, P-4).
- `refund_with_inventory` (11-arg) ← `/api/orders/refund` (canonical, P-4).
- `transition_order_atomic` ← **`/api/rpc/transition_order_status/route.ts`** (LIVE, see §2) + `/api/orders/route.ts` (only ever passes `p_new_status:'cancelled'`).
- **v1 `complete_payment_atomic`: NO live route calls it** (`/api/orders/complete-payment/` does not exist; grep for `rpc/complete_payment_atomic` (non-v2) = empty). Reachable **only** by a service_role / authenticated **direct PostgREST** caller.
- `process_order_payment`, `refund_payment_atomic`: no live route (grep) — direct PostgREST only (service_role / authenticated).

---

## 2. ⛔ LIVE VECTOR: `paid` with **NO** payment record

`/api/rpc/transition_order_status/route.ts` (live) does:
- `requireAuth()` only (no permission check here — the **RPC** checks `payments.create` on the
  `→paid` edge).
- Forwards the **client-supplied `p_new_status`** to `transition_order_atomic` **with NO
  status allowlist** (grep: no `paid`/allowlist/whitelist in the route).
- `transition_order_atomic` writes `status = p_new_status` + kitchen/cancelled side-effects,
  **never INSERTs `order_payments`** (§1 #3).

Registry edges into `paid` (raw `state_transitions`, all `is_active=t`):
```
new→paid, draft→paid, open→paid, confirmed→paid, in_kitchen→paid,
partially_ready→paid, preparing→paid, ready→paid, served→paid,
payment_pending→paid      (requires_permission=payments.create, mgr_override on most)
```
**⇒** Any session holding `payments.create` can POST `p_new_status='paid'` and flip a
`confirmed→paid` order **with no payment record, no amount, no idempotency key, no drawer
linkage**. This is the *live* paid-without-record path. (The UI no longer calls this route —
grep in `src/app/admin` = empty — but the endpoint is live and permission-gated only.)

---

## 3. ⛔ VECTOR: `paid`-**wrong**-order (re-attach a payment to a different order)

`trg_order_payment_immutable` (P-3, BEFORE trigger on `order_payments`) protects:
```
UPDATE: raises if amount / method / is_refund change   (ERRCODE P0001)
DELETE: raises unless app.payment_ledger_reopen (trusted reopen fn)
```
**It does NOT guard `order_id`.** Raw: the trigger body references `OLD.order_id` **only** in
the error message (`... [payment=%, order=%]`, `NEW.id, NEW.order_id`) — there is **no**
`OLD.order_id IS DISTINCT FROM NEW.order_id` check. So an authenticated/service_role
PostgREST `UPDATE order_payments SET order_id=<other> WHERE id=<pay>` **re-attaches an
existing captured payment to a different order** without tripping P-3. (Requires RLS to
permit the UPDATE — see §6; the two RLS policies are SELECT/INSERT-scoped, so UPDATE is
blocked for `authenticated`, but **service_role / postgres are exempt** and can do it.)

---

## 4. ⛔ VECTOR: authenticated **direct INSERT** of `order_payments` rows

`order_payments` RLS = **ON** (`rls=true`), but the **table ACL is full** for every role:
```
order_payments acl = {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
                      service_role=arwdDxtm, test_rls_role=arwd}
```
Two RLS policies exist (both `authenticated`):
```
order_payments_select_loc  (location-scoped SELECT)
order_payments_insert_loc  (location-scoped INSERT)   <-- authenticated CAN INSERT payment rows
```
**⇒** An `authenticated` client can, via bare PostgREST, **INSERT a `captured` payment row**
directly into the ledger (bypassing the route/RPC) — a paid-without-record / fabricated-
payment path, unless a `WITH CHECK` amount/validity constraint blocks it. (No `order_id`
immutability covers this either — it's an INSERT, not UPDATE.)

---

## 5. BASELINE DATA INARIANTS (raw counts — pre-existing, do NOT regress)

| Invariant | Raw count | Note |
|---|---|---|
| `orders` status `paid` | **321** | |
| paid **with** `order_payments` row | **47** | new-era (`order_payments` adopted) |
| paid **without** any `order_payments` row | **274** | **legacy era** — the "paid-without-record" baseline |
| paid **without** any legacy `payments` row | **321** (legacy `payments` total = **2**) | legacy `payments` table essentially abandoned |
| `paid_amount` ≠ Σ(`captured` `order_payments`) | **54** | **38** of them WITH op-rows, **16** without |
| of the 47 paid-with-op, `paid_amount`=Σ | **9 / 47** | even new-era has drift (see samples below) |
| **overpay** `paid_amount > total_amount` | **13** (8 `paid`, 5 `closed`) | pre-existing |
| **refund > paid** `refund_amount > paid_amount` | **4** | samples all have `paid_amount=0` (refunded w/o captured payment) |
| stale `table_floors.current_order_id` | **0** | |
| `dirty` table with open `current_order_id` | **0** | dirty+pointer consistent |
| orphan `order_payments` (no order) | **0** | |
| `order_payments.status` values | `captured, pending` (registry allows many more: authorized/processing/settled/…) | |
| `order_payments.is_refund IS NULL` | **0** | |

**Mismatch samples** (paid, `paid_amount`≠Σcaptured; all pre-`order_payments`-clean era):
```
5edf5bf6…  paid  total=10.00  paid=10.00  Σop=0   2026-08-25
ae2bad41…  paid  total=37.00  paid=37      Σop=0   2026-08-24
e73d6974…  paid  total=10.00  paid=10      Σop=0   2026-08-25
```
**refund>paid samples** (`paid_amount=0`, so a refund exists with no captured payment):
```
b3fc4a3c…  paid    total=43.96   paid=0   refund=9.44   2026-09-01
0fd858e6…  paid    total=115.32  paid=0   refund=5.26   2026-09-01
```

**Interpretation:** the **274 paid-without-record** is the *known* legacy baseline (P-1
audit: "20/25 paid-without-record" was the *active* sample; full table = 274). The **54
mismatch / 13 overpay / 4 refund>paid** are **pre-existing data drift** (P-3 already froze
amount immutability *forward*; backfill is **P-9 reconciliation**, NOT P-5, and is **ratified
out-of-scope** — do not backfill). P-5 must make the *forward* contract airtight and prove
**zero new** violations, without disturbing this baseline.

---

## 6. payment↔table (the part that is ALREADY correct — do not touch)

- `PAID + OCCUPIED` is **valid by design** (Option 1, ratified): on paid the table **stays
  occupied** (pointer kept); only `dirty` is the post-payment cleanup state. Raw: **0**
  stale pointers, **0** `dirty`+open-pointer. `trg_orders_sync_table_floors` +
  `trg_clear_stale_table_order_pointer` + `trg_clear_bill_requested_on_payment` handle it.
- **P-5 must NOT** add `occupied→…` auto-empty on paid, nor change the `dirty` semantics.

---

## 7. DECISION MATRIX — **STOP: ratify before any DB change**

| ID | Finding (→ §) | Options | **Recommendation** |
|---|---|---|---|
| **D-1** | Live paid-without-record via `transition_order_status` route + `transition_order_atomic` (§2) | (a) DB guard: `transition_order_atomic` **rejects** `p_new_status IN ('paid','refunded','partially_refunded')` (payment state must only be set by the payment RPCs which insert a row). (b) Route-level allowlist (block `paid` at the route). (c) Registry `requires_payment_record` flag + a `BEFORE` trigger on `orders.status→paid` asserting a matching `captured` `order_payments` row exists. | **(a) + (c)**: reject in `transition_order_atomic` (server SSOT) **and** a `BEFORE` trigger on `orders` that, on `→paid`, asserts a matching captured payment row exists (belt+suspenders; the trigger is the real invariant, the fn reject is the clean error). Keep the route for non-paid transitions. |
| **D-2** | v1 `complete_payment_atomic` (10/11) — no location, no idempotency, EXECUTE by `authenticated`+`service_role` (§1 #2) | (a) **REVOKE EXECUTE** from `authenticated`/`service_role`/`test_rls_role` (keep `postgres`) → dead code, not reachable. (b) Mark deprecated + route all callers to v2 (no callers exist). (c) Leave as-is. | **(a) REVOKE EXECUTE** (postgres keeps it for ops). It has **zero live routes**, so revoking cannot break the app and closes a bare-PostgREST unguarded paid-writer. Document as frozen-dead. |
| **D-3** | `order_id` re-attach (paid-wrong-order) not covered by P-3 immutability (§3) | (a) Extend `trg_order_payment_immutable` to also raise on `OLD.order_id IS DISTINCT FROM NEW.order_id`. (b) Separate trigger. | **(a)**: add the `order_id` check to the existing P-3 immutability trigger (same P0001 pattern). This is a *new column* to P-3's guard — **needs your OK since P-3 is frozen** (it's a hardening extension, not a re-open: it only adds protection, can't change any legal behavior). |
| **D-4** | Authenticated **direct INSERT** of `order_payments` via PostgREST (§4) | (a) **REVOKE INSERT** on `order_payments` from `authenticated` (payments must be created only by the RPCs). (b) Keep the `insert_loc` policy but add a `WITH CHECK` (amount>0, valid status, matches order). | **(a) REVOKE INSERT** from `authenticated` (and drop the now-dead `order_payments_insert_loc` policy). Matches the "0 raw browser→ledger RPC/row paths" rule; all legit payment creation goes through `complete_payment_atomic_v2`/`refund_with_inventory` (service_role). |
| **D-5** | `paid_amount` drift baseline (54 mismatch / 13 overpay / 4 refund>paid; 274 paid-without-record) (§5) | (a) P-9 backfill. (b) Freeze as residual + forward-only enforcement. | **(b)** — ratified out-of-scope for P-5; **document as frozen residual** in HANDOVER §3; P-5 proves **zero NEW** drift (gate asserts a fresh paid order has `paid_amount`=Σcaptured and a record). |
| **D-6** | `payment_pending→paid` edge exists (`payments.create`, no mgr override) — is `payment_pending` a real order status? (§registry) | (a) If unused, keep (harmless). (b) Confirm it's reachable only via payment RPC. | **(a)** confirm-and-keep; it's a legitimate intermediate, not a gap. |
| **D-7** | `refund_payment_atomic` inserts `status='success'` which is **not** in the payment registry states (§registry: authorized/captured/…) | (a) Fix to `captured`/`refunded`. (b) Dead code (no route) → leave. | **(b)** no live route calls it; note it, don't change (avoids scope creep). Flag for P-6/P-11. |

**Out of scope (explicit):** no backfill (D-5→P-9), no cash-drawer work (P-8), no
processor/webhook (P-10), no refund/void semantics (P-6). **No ERRCODE='40001'** (P-4
lesson — any new `RAISE` uses P0001/default).

---

## 8. PROPOSED GATE BATTERY (after ratification) — `.p5-gate.cjs`
1. Fresh paid order → has **1** captured `order_payments` row, `paid_amount`=Σcaptured, status `paid`, table **occupied** (not dirty/empty).
2. `transition_order_status` route with `p_new_status='paid'` → **REJECTED** (D-1), order unchanged, **no** payment row.
3. Direct `transition_order_atomic(... 'paid')` → **REJECTED** at DB (D-1).
4. `BEFORE` trigger: attempt `UPDATE orders SET status='paid'` with no payment row → **RAISE** (D-1).
5. v1 `complete_payment_atomic` via PostgREST (authenticated + service_role) → **403/42501 no EXECUTE** (D-2).
6. `UPDATE order_payments SET order_id=<other>` (service_role) → **RAISE** `PAYMENT_RECORD_IMMUTABLE` (D-3).
7. Authenticated **direct INSERT** into `order_payments` via PostgREST → **blocked** (D-4).
8. PAID+OCCUPIED stays valid; last-open-order cancel frees table (regression of ratified table contract).
9. Zero-new-drift: after a pay+refund cycle, `paid_amount`/`refund_amount` consistent; baseline counts **unchanged** (274/54/13/4 preserved).
10. **Zero residue** (P5_ staff inactive, probe orders + op rows gone).

**Frozen ecosystem reflow (all re-run):** P-1 29/29 · P-2 13/13 · P-3 25/25 · **P-4 19/19** ·
O 38/38 · F 35/35 · K L3 8/8 · K L4 16/16. (Watch the O-gate trigger-pause kill-hazard:
re-check `trg_orders_sync_table_floors`/`trg_order_table_location` = O after the O-gate.)
