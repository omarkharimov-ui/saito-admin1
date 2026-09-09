# D-2 + D-5 Fix — Implementation & Verification Report

**Commit:** `22508af` · **Migration:** `20260908000006_d2_d5_split_takeaway_delivery_location.sql` (LIVE-applied) · **Date:** 2026-09-09
**Method:** audit-first (read-only root cause) → minimal DB + server-side route fix → rolled-back verification → build. **NO frozen contract / RLS / state-machine / auth change.**

---

## Root cause (common to both)

`orders.location_id` and `orders.organization_id` are **NOT NULL with no default**. Five DB functions that create orders omit them:

| Function | Live? | Outcome |
|----------|-------|---------|
| `split_order_atomic` | ✅ `/api/orders/bill-split` | D-2: new order INSERT has no loc/org → `trg_order_table_location` guard rejects ("order location=NULL org=NULL, table location=…") |
| `split_by_seat` | ✅ `/api/rpc/split_by_seat` | D-2: same |
| `create_takeaway_order` | ✅ `usePos.createOrderShell` | D-5: same NOT NULL failure |
| `create_delivery_order` | ✅ `usePos.createOrderShell` | D-5: same |
| `create_or_append_order` | ❌ **dead code** (live dine-in uses `POST /api/orders`, which reads loc/org from `table_floors` explicitly) | Left untouched (scope discipline) |

**Confirmed live dine-in is healthy:** real open orders on tables 4/5/8/9/10/15 all carry `location_id`/`organization_id` (t|t) — so a split's parent order always has them to inherit.

## D-2 fix — split inherits parent location/org

`split_order_atomic` + `split_by_seat`: the new split-order INSERT now sets
`location_id = v_original.location_id, organization_id = v_original.organization_id`.
No policy decision — pure propagation of values the parent already holds.

**Bonus latent bug found (was masked):** `p_split_items.modifiers` is declared `TEXT` in
`jsonb_to_recordset`, but `order_items.modifiers` is `jsonb`, and the live route sends it as a
stringified array (`JSON.stringify(item.modifiers || [])`). This was a guaranteed type error —
but it never surfaced before because the location guard rejected the split **first**. Now fixed
with a safe cast: `COALESCE(NULLIF(trim(COALESCE(v_item.modifiers,'')), ''), '[]')::jsonb`.

## D-5 fix — takeaway/delivery location resolution (server-side, no UI change)

Because there is **no parent order** to inherit from, the order's location must be resolved.
The deployment has **3 ACTIVE locations** (Main Location, Saito Nizami, Saito Dənizkənarı), so
**no single default is safe** (wrong location → wrong inventory/report/kitchen/cash-shift).

**Approved policy** (never defaults, never picks arbitrarily):
```
1. sessions.active_location_id  (authoritative; set via /api/locations/switch)
2. staff's PRIMARY active staff_locations row
3. the staff's ONLY active location (if exactly 1 distinct)
4. otherwise → NULL → 400 NO_LOCATION_CONTEXT
```

Implementation:
- New helper `resolve_staff_location(uuid, uuid, uuid) RETURNS (resolved_location_id, resolved_organization_id)` — DB-level, testable.
- `create_takeaway_order` / `create_delivery_order`: **+p_location_id / +p_organization_id**; `NULL → RAISE 'NO_LOCATION_CONTEXT'` (DB enforcement, defense in depth). Old broken overloads dropped (they could never succeed — NOT NULL).
- New `src/lib/location-context.ts` `resolveLocationContext(staffId)` — same `saito_token` + service-role session lookup as `/api/locations/context`, so it always matches the UI context.
- Both routes resolve **server-side**, pass to the RPC, return **400 NO_LOCATION_CONTEXT** if unresolvable. **No client/UI change.**

## Verification (all in `BEGIN…ROLLBACK`, zero residue)

| Check | Result |
|-------|--------|
| `resolve_staff_location`: primary (staff03→Nizami), none (staff02→NULL), single-active (staff04), session-wins (staff03+Main→Main) | ✅ 4/4 |
| D-2 `split_order_atomic` (incl. **exact `/api/orders/bill-split` payload shape**, modifiers as string) | ✅ new order inherits loc/org, no guard error, modifiers preserved as jsonb, parent total 12→9 |
| D-2 `split_by_seat` | ✅ new seat order inherits loc/org, items moved, totals correct |
| D-5 takeaway NULL-loc → `NO_LOCATION_CONTEXT` | ✅ |
| D-5 takeaway WITH loc → success, order loc/org/total correct | ✅ |
| D-5 delivery NULL-loc → `NO_LOCATION_CONTEXT` | ✅ |
| D-5 delivery WITH loc → success, loc/org/total/delivery_fee/status correct | ✅ |
| Production residue | ✅ zero (op=61, idem=1, real 1-18 unchanged, no test floors/orders) |
| Typecheck (changed files) + production build | ✅ clean / PASS |

## Migration idempotency pitfall caught
A `COMMENT ON FUNCTION` missing its terminating `;` corrupted psql's `$`-quote state on
re-apply, silently leaving `split_order_atomic` **not** replaced (live body check caught it:
loc-inherit present but modifiers-cast absent). Fixed; migration now re-applies cleanly (5 CREATE, 0 errors).

## Explicitly NOT changed (scope discipline)
- `create_or_append_order` (dead dine-in RPC) — same latent bug but not on any live path.
- All frozen contracts, RLS, state machine, auth, the payment fix (D-6/D-7).

## Note for D-8
The re-pay-after-full-refund path is now blocked at **two** layers (state machine `partially_refunded→paid` **and** the payment-ledger `validate_payment_order_balance` "existing payments exceed total"). D-8's fix must account for both (see re-run report O-2).

## Next
**D-8** (refund→reopen→re-pay, both layers) → **D-9** (qty→total) → **O-1** (dismiss-on-occupied) → full torture re-run → browser/UI → print → integrity → FREEZE → UX.
