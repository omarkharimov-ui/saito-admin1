# POS CORE FREEZE GATE — REPORT

**Date:** 2026-09-09 · **Phase:** D-1 micro-fix + full E2E smoke (freeze gate)
**Verdict:** 🔴 **NO-GO** — 2 CRITICAL pre-existing production blockers surfaced. Core dine-in flow is solid; **split, takeaway, and delivery cannot currently create bills.**

> The gate did its job: it stopped us from freezing on top of two live, user-facing defects. Do **not** freeze yet.

---

## 1. D-1 (delivery unpaid badge) — ✅ DONE
`DeliveryOrders.tsx:165` now uses the shared `isFinalOrderStatus` (was referencing the non-existent `completed` state). 3 unit tests added (24/24 pass). Build + typecheck clean. **Committed at `57e4e52`.**

## 2. E2E — what PASSES (dine-in core is production-ready)
Driven through the **real app DB path** (direct `orders` INSERT + `order_items` + floor pointer — the path my aggregate trigger now guards; `create_or_append_order` RPC confirmed dead code). All in `BEGIN…ROLLBACK` fixtures, zero committed footprint:

| Case | Result |
|---|---|
| **Basic order** — add 2×Cola, floor → `occupied 6.00/1 pending=t` + pointer | ✅ |
| **Send to kitchen** — order+floor `kitchen_status=sent` | ✅ |
| **Add item after send** — +18.00 → floor **24.00/1 (counted once, no double-count)** | ✅ |
| **Kitchen lifecycle** — item mark-ready (rollup), accept→preparing→served; pending clears on served | ✅ |
| **Pay full + tip** — 24.00+5.00 card → order `paid`, floor `0/0 pending=f` | ✅ |
| **Partial pay** — 5/18 cash → order stays open, floor keeps 18.00 (correct contract) | ✅ |
| **Void item** — void the 3.00 cola → order 18.00, floor 18.00 (by `order_item_id`) | ✅ |
| **Reopen** — paid→reopened, floor re-counts it | ✅ |
| **Merge occ+occ** — 105(6.00)+106(3.00) → parent 9.00 **counted once**, child `merged_into` parent | ✅ |
| **Transfer** — 107→108: source 0, target 6.00, order moved, kitchen intact | ✅ |
| **Dismiss** — release → `empty 0/0`, pointer cleared | ✅ |
| **Reservation → seat** — reserved→seated, reservation `checked_in` | ✅ |
| **Refund** — `refund_with_inventory` (the **real** app path) with `item_fate=return_to_stock` → `success=true`, order `partially_refunded`, floor 0/0 | ✅ |
| **No double-count anywhere** (F-1 fix holding under E2E) | ✅ |

## 3. 🔴 CRITICAL blockers (pre-existing, reproduced independently)

### D-2 — SPLIT is broken (both modes)
- `split_order_atomic` and `split_by_seat` **insert the split order without `location_id`/`organization_id`**. `orders.location_id` is `NOT NULL` (no default), and the `enforce_order_table_location` BEFORE trigger rejects the insert:
  > `Order table 114 must belong to same location/organization as the order (order location=<NULL>)`
- **Live path:** `BillSplitModal` → `POST /api/orders/bill-split` → `split_order_atomic` (and `split_by_seat`). **Any dine-in bill split currently throws 500.**
- **Fix (separate approval pass):** in both RPCs, set `location_id`/`organization_id` on the split order from the source order (`SELECT location_id, organization_id FROM orders WHERE id=p_order_id`).

### D-5 — TAKEAWAY + DELIVERY creation is broken
- `create_takeaway_order` and `create_delivery_order` insert the order **without `location_id`/`organization_id`** → `null value in column "location_id" ... violates not-null constraint`. Reproduced with clean single calls.
- **Live path:** `usePos.createOrderShell` (takeaway/delivery buttons) → these RPCs. **Takeaway and delivery orders cannot be created at all right now.**
- **Root cause:** production takeaway/delivery orders (17 + 9) date from **07-26 → 08-24** — created when `orders.location_id` still had a default. Once `location_id` became `NOT NULL` with no default, these two RPCs (which never set it) broke.
- **Fix (separate approval pass):** both RPCs must accept/set `location_id` + `organization_id` (from the acting location), or the app must pass them.

### Why these are blockers for the freeze
The pass criteria require **Split PASS, Takeaway PASS, Delivery PASS**. All three fail at the DB layer before any UI. Freezing now would lock in a POS that cannot split a bill or create a takeaway/delivery order.

## 4. Not a defect (verified, to stop re-litigating)
- **Refund:** the constraint-violation I first saw was the **dead** `refund_payment_atomic` RPC (`status='success'` ∉ check constraint) — the app does **not** call it. The real path (`refund_with_inventory`) works (see §2).
- **"Cannot refund item in state: pending"** on a pending item is a **correct business guard**, not a bug.
- **Payment keeps `current_order_id` after pay** (`/api/orders/route.ts:324` "keep current_order_id (SSOT)") is **by-design**.

## 5. Data integrity (post-E2E)
- My fixtures (tables **100–114**, 112/113/114 isolated) fully cleaned: `floors≥90 = 0`, `orders≥90 = 0`, orphan `order_payments/order_items/kitchen = 0`, my `outbox 100-114 = 0` (the 39 from earlier non-wrapped runs deleted by provenance), `resv E2E = 0`.
- **9141/9142** outbox rows are **pre-existing** (2026-09-08 12:07–12:41 UTC, before my session) — untouched.
- **6/7 (reserved/completed), 17 (reserved), 9991 (1 oplog + 2 outbox)** verified untouched.
- **⚠️ Flag (not mine):** tables **1 & 2** carry `merge_lineage mode='group-empty'` + `table.merged`/`table.dismissed` outbox at **20:46:19 / 20:46:47 UTC**. All my E2E fixtures were 100–114 — I did not target 1/2. This is **live POS operator activity on the dev server** during the session (an empty-group merge→dismiss that left lineage residue). I did **not** touch it; please confirm. (Minor note: an empty-group unmerge leaving `group-empty` lineage on both floors is a small cleanup candidate for a later pass.)
- **9991 + merge_lineage on 6/7/17 unchanged.**

## 6. Build / typecheck
- D-1 pass: build green, `tsc` no new errors (only pre-existing `__tests__` jest-type failures). No new app code in the E2E (DB-layer only).

## 7. Commit / push
- **D-1:** committed `57e4e52`.
- **This report:** committed (docs only). No DB contract changed in this pass (blockers documented, **not** fixed — per gate rules).
- **Push: BLOCKED** — token check (silent, once) returned 401. Not requested in chat.
- Chain ahead of origin/main: `d141c43 → 82ab869 → 50c8e35 → 4b091c5 → 2cd2bd3 → 57e4e52 → this`.

## 8. STRICT STOP — NO-GO
**Do not freeze, do not start UX.** Two CRITICAL blockers (D-2 split, D-5 takeaway/delivery create) must be fixed and re-verified first.

**Recommended next pass (separate approval):** fix D-2 + D-5 (both are small RPC insert fixes: carry `location_id`/`organization_id`), re-run this E2E gate, then freeze. Also decide:
1. Approve D-2 + D-5 fix pass now?
2. Confirm tables 1 & 2 20:46 activity was your operator (so I can clear it from the flag).
3. Re-run the browser UI-layer E2E for the working core after the DB fixes (deferred here — broken RPCs can't be UI-tested).
