# POS Frontend — Order Aggregate Sync Integration Audit

**Date:** 2026-09-08 · **STATUS: AUDIT ONLY** — no code, migration, DB, RLS, realtime-config, or frozen-contract changes. No fixes.
**Context:** DB implementation `20260908000003_order_aggregate_sync_trigger.sql` (commit `82ab869`) is live & verified. This pass answers: **does the POS frontend correctly consume the floor-aggregate changes the new `orders → table_floors` trigger produces, without stale state, duplicate refresh, races, flicker, or missed events?**

**Core question — answer up front:** The frontend's *refresh/scheduling/race* machinery is sound (generation token, debounce+ceiling, echo filter all hold). **But the server floor API (`/api/pos/tables`) has a pre-existing double-counting design that the trigger now makes deterministic for merged groups**, plus one echo-filter gap the trigger exposes. No crash, no ghost tables, no stale-overwrite from the trigger itself.

---

## 1. Executive Summary
| # | Finding | Severity |
|---|---|---|
| F-1 | Merged-group total/guest/item **double-counted** in `/api/pos/tables` once the trigger keeps the parent floor total live | **HIGH** |
| F-2 | Trigger-driven floor `UPDATE` carries **no `updated_by_terminal_id`** → escapes the POS echo filter → the terminal's own action causes a redundant second floor fetch | **MEDIUM** |
| F-3 | Order status **exclusion mismatch**: trigger & `/api/orders` = 3 final states; `/api/pos/tables` rawOrders = 3; but the trigger formula = 6 (adds `refunded/voided/partially_refunded`). Latent UI inflation for those states | **MEDIUM** |
| F-4 | Open-order **modal/cart goes stale** when a *different* terminal changes the underlying order (no modal re-fetch on floor events) | **LOW** (pre-existing) |
| F-5 | Redundant `orders` + `table_floors` subscriptions both drive refresh (coalesced, not a bug) | **LOW** |
| F-6 | `guest_count` `|| 1` fallbacks mask zero; `has_pending`/`order_count` are now correct | **LOW** |

Everything the trigger was *designed* to fix (single-table total/guest/kitchen/pending/move/multi-order/delete; no-op stability; no version-driven UI churn; table-less safety) **works end-to-end** (see §5). The problems are in how the **server floor API composes** `table_floors` + `orders`, and in the echo filter, not in the trigger or the client scheduler.

---

## 2. Current Frontend SSOT Map
Floor state lives in `usePos.tsx` → `setFloors` → `TableCard`/floor UI. Source = **one API** `/api/pos/tables` (service-role), reshaped server-side.

**A. Table-aggregate SSOT (what the card shows):**
- `total_amount`, `guest_count`, `item_count` — **computed server-side** in `route.ts:148-150` from `table_floors.*` **and/or** a client-side sum of open `orders` (see §3 for the composition, and F-1/F-3).
- `order_count`, `has_pending`, `oldest_pending_at` — **`table_floors` columns directly** (now trigger-maintained; card renders `has_pending` at TableCard.tsx:514 and `order_count` at :525). ✅
- `status`, `current_order_id`, `kitchen_status`, `merged_into_table`, `reservation_*` — `table_floors` (route.ts:99-108, 147, 155). The trigger is **aggregate-only** and does NOT touch these, so they remain governed by the frozen contracts. ✅

**B. Order SSOT (cart/billing):** `orders` + `order_items`, fetched via `/api/orders?table_number=…` in `selectTable` (usePos.tsx:516) and pre-fetched to `tableOrderCache` (usePos.tsx:244). Cart totals come from **`order_items`** (`total_price`), not from `table_floors.total_amount`. Billing total = `primary.total_amount` with an `itemSum` cross-check (usePos.tsx:573-574, `serverTotal`). So the **modal/billing is order-driven**, independent of the floor aggregate. ✅ (means F-1 is floor-card-only, not billing.)

**C. Derived frontend state:** `merged_groups`/`is_group`/`parent_table_number` (route.ts:110-114,169-186); `groupTotalAmount/groupGuestCount/groupItemCount` (route.ts:117-139); `displayAmount`/`displayGuests` null-coalescing (TableCard.tsx:279-280); cart `sentQuantity`/`serverTotal`; `tableOrderCache`.

**D. Realtime source:** one Supabase channel `pos-sync` subscribed to **`postgres_changes event=*` on BOTH `table_floors` AND `orders`** (usePos.tsx:361-364). Any change → `onPosChange` → echo filter → `scheduleFloorRefresh('realtime')` → **full `fetchFloor()`** (payloads never patch state — "fetch-based reconciliation", usePos.tsx:359-360).

**E. Polling source:** `setInterval(…, 3000)` → `scheduleFloorRefresh('poll')` (usePos.tsx:370), through the same guarded scheduler.

**Key SSOT answer:** the frontend trusts **`/api/pos/tables` (server-composed)** for the floor grid, and **`/api/orders` + `order_items`** for the modal/billing. It does **not** read `table_floors.version` or any outbox event type directly; it reacts to raw postgres_changes and re-fetches.

---

## 3. Realtime Event Flow
```
orders mutation
  → trg_orders_sync_table_floors (AFTER INSERT/UPDATE/DELETE; guard on 6 fields)
  → sync_table_order_aggregates (no-op aware: UPDATE table_floors only if aggregate changed)
  → postgres_changes on `orders`  (always)  ┐
  → postgres_changes on `table_floors` (only when sync actually wrote) ┤
       both → channel 'pos-sync' → onPosChange (echo filter)          → scheduleFloorRefresh
       → 250ms debounce (1s ceiling) → fetchFloor('realtime') → GET /api/pos/tables
       → setFloors (gen-guarded) → TableCard re-render
```
- **No-op case (R-UI-5):** when the aggregate is unchanged, sync performs **no `table_floors` UPDATE** → no `table_floors` realtime event, no version bump, no outbox. The `orders` event still fires → one coalesced fetch → identical floor data → **no UI churn / no flicker**. ✅ PASS
- **Both-tables event (R-UI-4):** an order write fires an `orders` event **and** (if aggregate changed) a `table_floors` event → two `onPosChange` → **coalesced into ONE debounced fetch**. Not a double fetch, but see F-2 (the floor one isn't echo-suppressed). ✅/⚠️

## 4. Polling / Scheduler Flow
`schedulFloorRefresh` (usePos.tsx:305-339) is the single funnel:
- **Generation token** (`floorGenRef`): bumped at the start of every `fetchFloor`; a response is applied only if its token is still newest (usePos.tsx:164-180). **R-UI-1 stale-overwrite = prevented** (a late older response is discarded, counted in `staleDiscarded`). ✅
- **Debounce + hard ceiling:** realtime triggers collapse into one 250ms trailing window; a window ≥1s old is no longer extended (prevents starvation by an event flood). ✅
- **Poll skip:** a poll tick is dropped while a coalesced refresh is pending or a fetch started <2.5s ago (in-flight guard) (usePos.tsx:310-322). **R-UI-2 realtime+polling double fetch = largely prevented** (worst case one poll + one realtime within a window, then coalesced). ✅
- **R-UI-3 trigger wakes scheduler:** yes — the trigger's `table_floors` UPDATE is a `postgres_changes` event on a subscribed table → `scheduleFloorRefresh`. ✅
- Observability is built in: `window.__POS_SYNC_STATS__` (dev) counts realtime/poll executions, coalesced events, skipped polls, **staleDiscarded**, failed fetches — so refresh volume is measurable in production dev builds (see §13).

---

## 5. Trigger → UI Compatibility (per case)
| Case | DB (verified) | Frontend path | Verdict |
|---|---|---|---|
| **Total 17→45** (item add, table 5 class) | floor `total_amount`→45 (T6) | floor event → fetch → card `total_amount` updates; single table uses `f.total_amount || orderSum` (route.ts:148) → shows 45 | ✅ PASS (single table) |
| **Guest count change** | floor `guest_count`→3 (T7) | card `guest_count`/displayGuests | ✅ PASS (single table) |
| **Status change** (→paid, reopen) | floor recompute (T4/T5) | status is floor-authoritative; aggregate updates; card pending/count update | ✅ PASS (single table) |
| **Kitchen change** (has_pending) | floor `has_pending`/`oldest_pending_at` (trigger now fires on kitchen_status) | card `has_pending` badge (TableCard:514) | ✅ PASS |
| **Table move A→B** | both floors refreshed (T10) | single fetch refetches all floors → both A and B cards correct, no stale/dup | ✅ PASS |
| **Multi-order** (1 active + paid + cancelled) | floor = active only (T9) | single-table `f.total_amount || orderSum`; orderSum also active-only (rawOrders excludes final) | ✅ PASS (see F-3 for the 6-vs-3 exclusion nuance) |
| **Delete** | floor zeros (T12) | fetch → card 0/0, no ghost | ✅ PASS |
| **No-op** | no floor UPDATE (T8) | one fetch → identical data → no churn | ✅ PASS |
| **Merged group, new item added** | parent floor total = full order sum (merge syncs parent) | **route.ts:128 `floor.total_amount + orderSum` → 2×** | ❌ **F-1** |
| **Table-less / takeaway / delivery** | trigger strict no-op (T2/T3) | no `table_floors` row → no event → no ghost table | ✅ PASS |

---

## 6. Stale-State Risks
- **F-4 (LOW, pre-existing):** `selectTable` fetches the cart/orders **once** when a table is opened (usePos.tsx:516) and does **not** re-fetch on subsequent floor realtime events. If another terminal changes the open order (adds item, changes guests, pays, moves, voids), the **floor card updates but the open modal/cart stays stale** until the user closes/reopens the table. The trigger does not change this (it only affects the floor fetch). Recommended fix (later, out of scope): on a floor realtime event, if `selectedTable` matches the changed table, re-run the order fetch for it (debounced), or bump a `selectedTableGen` that `selectTable` honors.
- `fetchFloor` on failure sets `floorLoadFailed=true` + toast but **keeps last floors** (usePos.tsx:183-191) → a transient network error leaves the grid at its last-known state (correct "stale-but-visible" behavior, not silent corruption). ✅
- Generation guard prevents stale *response* overwrite (R-UI-1). ✅

## 7. Race Conditions
| Req | Status |
|---|---|
| R-UI-1 stale overwrite | **PASS** — generation token (usePos.tsx:164-180) |
| R-UI-2 realtime+polling dup | **PASS** — poll-skip + coalescing (usePos.tsx:310-339) |
| R-UI-3 trigger wakes scheduler | **PASS** — subscribed `table_floors` event |
| R-UI-4 orders + table_floors double | **COALESCED** (one fetch) but floor event not echo-filtered → **F-2** |
| R-UI-5 no-op UI stable | **PASS** — no floor UPDATE → no churn |

## 8. Optimistic-UI Risks
Local optimistic patches (`markTableEmptyLocal` usePos.tsx:691, `markTableSeatedLocal`:704, `setSelectedTable` patches) mutate `floors` in place; the **next `fetchFloor` (action or realtime) overwrites with server truth**, so any transient mismatch self-heals. `selectTable` cart merge preserves **unsent (draft) items** and reconciles sent items with the server by `product__variant` key (usePos.tsx:576-606) → external *sent* changes merge, drafts are preserved (no data loss). The only real gap is F-2 (own-action redundant refresh) and F-4 (modal not re-fetched). **No optimistic state is corrupted by trigger events** because the trigger never writes status/pointer/kitchen (R-2 boundary held). ✅ (with F-2/F-4 caveats)

## 9. Modal Consistency
- **External change while modal open:** floor card updates (fetch), **modal/cart does not** (F-4). No crash, no duplicate items on re-open (drafts carry only if same table; switching tables discards drafts, usePos.tsx:582). Totals between modal and card can *temporarily* disagree until re-open.
- **Cart not overwritten by refetch:** `setFloors` replaces floor state but the cart is separate state; a floor refetch does not clobber an in-progress cart. ✅
- **Move/void/reopen of the open order:** reflected on next open; live-while-open not pushed to cart (F-4).

## 10. Merge / Transfer / Reservation Compatibility
- **Merge V2 / P-1 unmerge / Transfer / Dismiss:** all go through their RPCs → floor events + action `fetchFloor` → correct re-fetch. Transfer also does both-ends (RPC moves order → trigger refreshes both floors → one fetch covers both). ✅
- **Reservation-aware / reserved tables:** trigger is aggregate-only; reservation fields untouched; card shows reservation_name/phone/time from `table_floors`/`reservations` (route.ts:98-100,161-163). ✅
- **Aggregate-only boundary respected:** the frontend **never** infers merge/pointer/reservation state from the aggregate update — those come from `status`/`merged_into_table`/`reservation_id` which the trigger does not write. ✅ (This is exactly why R-2 mattered.)
- **Merged-group card math:** the *only* merge incompatibility is **F-1** (route.ts:128 additive).

## 11. Payment / Refund / Reopen / Void
- **Pay/complete:** order →`paid` (final) → trigger recomputes floor (excludes paid) → card total→0, pending cleared; action `fetchFloor` on pay. ✅ (single table)
- **Reopen** (paid→confirmed): trigger → floor re-includes; ✅ single table.
- **Refund / void / partial:** **F-3** — the trigger formula excludes `refunded/voided/partially_refunded`; `/api/pos/tables` `rawOrders` (route.ts:25) excludes only `paid/cancelled/closed`. If any order is left in `refunded/voided` (not yet `closed`), the **card's orderSum includes it** while the floor total does not → card shows a stale-inflated total. Currently **0 such rows exist** (verified), so this is latent, but the two exclusion lists must be unified.
- Billing total uses `primary.total_amount`/`order_items` (order SSOT), so **payment amounts are correct** regardless of F-1/F-3; the drift is display-only on the floor card.

## 12. Table-less / Takeaway / Delivery
- Trigger: `table_number IS NULL` → **strict no-op** (verified T2/T3, no error). ✅
- Frontend: `route.ts` builds floors **only from `table_floors` rows**; a NULL-table order has no floor row → **no ghost table**, no invalid refresh, no crash. Takeaway/delivery are handled by the cart `posMode`, not the floor grid. ✅

## 13. Performance
No code changed, so measured from existing instrumentation + design:
- **Refreshes per POS op (own terminal):** action `fetchFloor` + (pre-F-2-fix) one extra coalesced realtime fetch from the trigger's floor event that the echo filter misses (F-2). After F-2 fix, own-op = 1 fetch.
- **Other-terminal op:** 1 coalesced fetch (orders + floor events merged). ✅
- **Continuous item streaming:** debounce+1s ceiling bounds the grid to ≤1 fetch/sec; poll skips while pending. ✅
- **`__POS_SYNC_STATS__`** exposes `realtimeEvents/debounceCoalesced/debouncedExecutions/pollSkips/realtimeExecutions/staleDiscarded/failedFetches` live in dev — use to confirm refresh volume in prod-like dev before deciding whether the 3s poll can be reduced.
- **Version:** the frontend does **not** read `table_floors.version` → the no-op rule's version savings are purely a DB/CAS benefit, no UI coupling. ✅

---

## 14. Findings (classified, with minimal recommended fix)

### F-1 — Merged-group double count — **HIGH**
- **Exact file/function:** `src/app/api/pos/tables/route.ts`, group loop, **line 128** (`groupTotalAmount += (tFloor?.total_amount||0) + tAllOrders.reduce(...)`) and **line 129** (guest), **line 131** (items).
- **Current behavior:** for each merged member it **adds** the member's `table_floors.total_amount` **plus** the sum of that member's open orders. After merge, `merge_tables_atomic` **syncs the parent floor to the full order sum** (merge_src lines 390-400 & 440-451) and zeroes children. So the parent contributes `floorTotal (=orderSum) + orderSum = 2× orderSum`.
- **Reproduction:** merge two occupied tables (e.g. table A 30.00 + table B 20.00). After merge the group card shows **100.00**, not 50.00. Add any item to the group → both `floor.total_amount` and `orders` grow → card grows by **2× the item** (before the trigger, the parent floor was often stale-0 so it read "fine"; the trigger makes the double-count deterministic and live).
- **Business impact:** the dine-in **group bill amount shown on the floor card is wrong (doubled)**; item count and guest count likewise inflated. Billing modal is order-driven so the *charged* amount is correct, but the card misleads staff/customers and any card-driven decision.
- **Root cause:** **pre-existing** API design (additive `floor + orders` for groups) that assumed member floor totals were 0/stale. The trigger made member floor totals reliably live, activating the latent bug.
- **Minimal recommended fix (later pass, NOT now):** use a **single canonical source** for the group — since the API already fetches open orders, sum **orders only** for groups (drop the `tFloor?.total_amount` addend on lines 128/129/131 for members), or sum **floors only**. Do **not** add both. (Orders-only is safest and matches the single-table `|| ` path semantics.)

### F-2 — Trigger floor event escapes echo filter → redundant self-fetch — **MEDIUM**
- **Exact file/function:** DB trigger `sync_table_floors_on_order_change` + `sync_table_order_aggregates` (the floor `UPDATE` sets **no** `updated_by_terminal_id`); client `onPosChange` echo check `record.updated_by_terminal_id === terminalId` (usePos.tsx:352).
- **Current behavior:** a POS action (e.g. send order) does: action `fetchFloor()` + `orders` realtime (echo-suppressed) + **`table_floors` realtime from the trigger (NOT suppressed, because the trigger write has no terminal id)**. Net: **2 floor fetches per own action** (coalesced within 250ms, so ~1 wasted round-trip + a momentary risk of the optimistic patch being overwritten before the action's own fetch commits).
- **Business impact:** minor extra load + possible brief flicker after own actions; not data corruption (gen token protects correctness).
- **Minimal recommended fix (later pass):** when the sync `UPDATE`s a floor, set `updated_by_terminal_id` to the terminal that caused the order write (the trigger can read `NEW.updated_by_terminal_id` / a session/GUC) so the echo filter works; OR filter `onPosChange` to ignore `table_floors` aggregate-only events when a manual fetch is already in flight. Both are small; needs care that setting the terminal id doesn't defeat the release-guard/pointer-validate triggers (they gate on status/pointer, not terminal id — safe, but must be re-verified).

### F-3 — Order-status exclusion mismatch (6 vs 3) — **MEDIUM**
- **Exact files:** trigger/sync exclusion list = `paid,cancelled,closed,refunded,partially_refunded,voided`; `/api/pos/tables` `rawOrders` (route.ts:25) = `neq.paid/cancelled/closed`; `selectTable` primary filter (usePos.tsx:528) = `['paid','cancelled','closed']`.
- **Current behavior:** an order left in `refunded/voided/partially_refunded` (before it's `closed`) is **counted by the card's orderSum** but **excluded by the floor total** → card total inflated. 0 such rows exist today (verified), so **latent**.
- **Minimal recommended fix:** align the three exclusion sets to the single canonical "final" set (ideally a shared constant / DB view) so floor aggregate, floor API, and modal agree.

### F-4 — Open modal/cart not refreshed on external order change — **LOW** (pre-existing)
- **File/function:** `selectTable` order fetch (usePos.tsx:516) runs once per open; `onPosChange` only refreshes `floors`, not the selected order.
- **Behavior:** other-terminal edit/pay/move/void while modal open → floor card updates, **modal stays stale** until re-open. No data loss (drafts preserved, sent items re-merge on re-open).
- **Minimal recommended fix:** on a floor realtime event whose changed `table_number` ∈ selected table (+ its merged children), re-run the selected-table order fetch (debounced, gen-guarded like `selectTableReqId`).

### F-5 — Redundant `orders` + `table_floors` subscriptions — **LOW**
- **File:** usePos.tsx:361-364. Both tables subscribed; coalesced so not a double fetch, but an order op emits two events. Consider subscribing to `table_floors` only (the trigger is now the single floor-change source) + keep `orders` for the modal path — or keep both and rely on coalescing (current behavior is acceptable).

### F-6 — `guest_count` `|| 1` masking — **LOW**
- **Files:** route.ts:129/149/180; TableCard:279-280 (`displayGuests` null-coalesces to hide 0). A table with an order of `guest_count 0` shows as 1. Cosmetic.

---

## 15. What is explicitly NOT a problem (to stop re-litigating)
- No crash, no ghost table, no table-less breakage (trigger no-op + floor-driven UI).
- No stale-*response* overwrite (generation token).
- No unbounded polling/realtime flood (debounce + 1s ceiling + in-flight guard).
- No billing-amount corruption (modal/billing = order SSOT, not floor aggregate).
- No merge/pointer/reservation inference from the aggregate (R-2 boundary held client- and server-side).
- Table 6/7 zombie + 17 pre-order: unaffected by the trigger (their orders aren't being rewritten); reconciler is scoped/ops-only.

## 16. STOP — decision requested
No code/DB/config was modified. Recommended **next pass (separate approval)** to fix, in priority order: **F-1 (HIGH)** → F-2 (MEDIUM) → F-3 (MEDIUM) → F-4/F-5/F-6 (LOW). F-1 must be fixed before relying on the floor card for merged-group bills. Push still deferred to the token fix (`d141c43` + `82ab869` + reports). **Awaiting your go/no-go on the frontend-fix pass.**
