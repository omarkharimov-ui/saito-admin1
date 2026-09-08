# POS Feature-Completeness Inventory (READ-ONLY)

**Date:** 2026-09-09 · **Method:** read-only scan (components, API routes, DB RPCs, code inspection). **No code/DB changes.** Follows the F-1/F-2/F-3 fix pass (commit `4b091c5`).

**Headline:** The POS is **feature-complete on the surface** — a scan for `not implemented / stub / coming soon / placeholder-handlers` returned **0 real gaps** (all "placeholder" hits are input-field placeholders). Every one of your 10 areas has live components + API + DB RPCs. The remaining work is **edge-case hardening + end-to-end validation**, not building missing features. This is why **POS Core Freeze is realistic** — nothing fundamental is absent.

---

## What just closed (this session, for context)
| Item | Status |
|---|---|
| F-1 floor double-count | ✅ fixed (2× bills were live: 98/90/96/76/20 → 49/45/48/38/10) |
| F-2 terminal provenance | ✅ fixed (migration 000004) |
| F-3 final-state contract | ✅ fixed (route + **all 7 order-UI filters** now share `FINAL_ORDER_STATUSES`) |
| `selectTable` consistency | ✅ fixed this pass (part of the 7) |

---

## Area-by-area inventory (with evidence)

### 1. `selectTable` → shared final-state — **DONE** ✅
All 7 order-UI filters unified on `FINAL_ORDER_STATUSES` (usePos primary + merge-group, 3 active-order fetches, takeaway/delivery queries, TakeawayOrders unpaid badge). One canonical set now drives floor API + order UI.

### 2. Payment edge cases — **present, needs edge validation** (LOW–MED)
Rich backend: `complete_payment_atomic` (v1/v2/v4), `split_order_atomic`/`split_by_seat`/`split_order_by_items_atomic`, `process_order_payment`, `validate_payment_order_balance`, `recalculate_order_payment_state`, `record_payment_attempt`. UI: `ActionSheet` (tendered/cash/card/split/tip), `BillSplitModal`.
- **Remaining edges to verify in E2E:** multi-tender (cash+card on one bill), partial payment + change math, split-by-seat vs split-by-items UX, tip + service-fee interaction, gift-cards/corporate/room-charge as tenders (modals exist: `GiftCardModal`, `CorporateModal`, `RoomChargeModal`).

### 3. Refund / void / reopen full workflow — **present, needs E2E** (MED to validate)
Backend: `refund_payment_atomic`, `void_payment_atomic` (v1/v2), `reopen_order`/`reopen_order_atomic`, `reopen_kitchen_ticket_atomic`, `void_item_atomic`/`void_order_item_atomic`, `comp_order_item_atomic`, `record_item_waste`. UI: `RefundModal`, `VoidItemsModal`, `ReturnItemModal`.
- **Remaining:** confirm the full refund→floor-aggregate→print flow end-to-end (now that floor totals are order-driven, a refund should decrement the card — **verify**), and reopen after partial refund.

### 4. Multi-order UX / business edges — **present, needs E2E** (MED)
Backend supports multiple open orders per table; F-1 now aggregates them correctly on the card.
- **Remaining:** does the **billing/checkout** path handle 2+ open orders on one table cleanly (choose which to pay, partial pay one, keep the other)? Verify cart/billing for the multi-order table case.

### 5. Reservation / pre-order POS workflow — **present** (LOW to validate)
Components: `ReservedTableModal`, `ReservationActionSheet`, `reservationMode` in usePos. Backend: `seat_guests_atomic`, reservation tables, pre-order items.
- **Remaining:** reserved→seat→pre-order→convert-to-active-order flow E2E; the **6/7 zombie reservation** is the known held case (business decision, not code).

### 6. Cash / shift workflow — **present** (MED to validate)
Components: `CashDrawerPanel`, `PinGuard`. API: `/api/cash/reconciliation` (+`[id]`), `/api/finance/close-day`, `reopen_cash_register`, shifts/time-clock.
- **Remaining:** verify reconciliation math (expected vs actual vs differential), shift clock-in/out boundaries, close-day aggregation, register reopen audit.

### 7. Printing / device workflow — **present (browser/receipt print)** (LOW)
`handlePrintBill` (page.tsx:549) → fetches active orders (now `isFinalOrderStatus`) → `printReceipt(...)` with receipt settings; `/api/orders/reprint`; `/api/settings/printer`.
- **Remaining / clarify:** physical **ESC-POS device** integration vs browser print — `printReceipt` is the single ejection point; confirm the target device strategy. This is config/ops, not a missing feature.

### 8. Takeaway / delivery POS workflow — **present, 1 real small bug** (LOW–MED)
Components: `TakeawayOrders`, `DeliveryOrders`. Backend: `create_takeaway_order`, `cancel_takeaway_order`, `update_takeaway_order`, `generate_takeaway_order_number`, `transition_delivery_status`, couriers (`assign_courier`, `upsert_courier`, `update_courier_location`, `get_active_couriers`).
- **🐛 Real bug (small):** `DeliveryOrders.tsx:165` uses a **different** 3-state set `paid/cancelled/completed` — and **`completed` is not an order status** (order statuses end at `paid`/`closed`/etc.). So a `closed` or `refunded` delivery order would still show the "unpaid total" badge. **This is a genuine inconsistency** (different from the F-3 class — it references a non-existent state). Recommended: switch to `isFinalOrderStatus`. *Left unfixed here (out of the approved F-3 scope) — flag for the next micro-fix.*

### 9. Realtime remaining edge cases — **1 known deferred** (LOW)
F-2 (echo) + F-5 (own-action duplicate) resolved. **F-4 (cross-terminal open-modal goes stale) is explicitly deferred to the UX pass.** No other realtime gaps found (generation token, debounce, poll-skip, table-less no-op all verified in the prior audit).

### 10. Final end-to-end POS smoke — **TODO** (validation, not code)
Not yet run as a scripted E2E. This is the natural **gate before POS Core Freeze**: a scripted happy-path + edge-path run covering send → kitchen → add item → bill → split/tip → pay → print → close, plus refund/void/reopen and merge/transfer/unmerge on real data (read-only where possible).

---

## Genuine defects found (small, fixable — NOT feature gaps)
| # | Defect | Where | Severity | Fix |
|---|---|---|---|---|
| D-1 | `DeliveryOrders` "unpaid" badge uses non-existent `completed` state → `closed`/`refunded` deliveries show a stale total | `DeliveryOrders.tsx:165` | LOW | use `isFinalOrderStatus(order.status)` (1 line) |
| (F-4) | cross-terminal open-modal staleness | usePos `selectTable` (no live re-fetch) | LOW | **deferred** to UX pass (per approval) |

## Deferred / out of scope (per your decisions)
- **6/7** — untouched (business decision).
- **Reconciler scheduling** — after 6/7.
- **Dead-function cleanup** — after POS feature work.
- **Git corruption** — hands off (pre-existing; push delta self-contained).
- **F-4** — UX pass.

---

## Recommendation for POS Core Freeze path
1. **Micro-fix D-1** (1 line, DeliveryOrders) — trivial, closes the last consistency inconsistency.
2. **Scripted E2E smoke** (area 10) — the real freeze gate: payment edges, refund/void/reopen, multi-order billing, cash reconciliation, takeaway/delivery, merge/transfer.
3. **Then POS CORE FREEZE** → **UX pass** (F-4 modal refresh + the other UX items).

No feature is missing; the foundation is solid. The freeze is a **validation** milestone, not a **build** milestone.

## STOP
Read-only inventory complete; no changes made. Awaiting your call on (1) micro-fix D-1, (2) the E2E smoke as the freeze gate, (3) then freeze → UX.
