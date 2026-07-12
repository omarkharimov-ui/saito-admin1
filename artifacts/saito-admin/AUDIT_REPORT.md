# SAITO Admin — Comprehensive Code Audit

**Project:** `/Users/mr.apple/saito-admin1/artifacts/saito-admin`
**Date:** 2026-07-12
**Scope:** All API routes (`src/app/api/`), all admin/kitchen pages & components, data-flow, auth, and the 10 named known issues.

---

## TL;DR — Production Readiness

**Overall: NOT production-ready.** The architecture is solid — real Supabase connections everywhere (no mock data found), comprehensive auth on 108/115 routes, all referenced DB RPCs exist, realtime wiring is good, and most flows are well-built. However, there are **4 critical functional bugs** that break or silently corrupt core POS operations (unmerge, campaign selection/discount, QR customer flow), plus several medium correctness/security/UX issues. None are catastrophic to deploy *if* you fix the criticals first, but the criticals will cause data inconsistencies and failed operations under normal restaurant use.

### Strengths (verified good)
- **Auth:** `requireAuth`/`validateAuth` enforced on 108/115 API routes. The 7 without it are correct (auth, logout, public reservations, and 3 cron routes guarded by `CRON_SECRET`; `reservations/kitchen-push` guarded by `CRON_SECRET`). Middleware redirects unauthenticated users and enforces role-based access to `/admin` and `/kitchen`.
- **Data layer:** Every route talks to real Supabase; the 12 RPCs referenced by code (`process_order_payment`, `merge_tables_v3`, `transfer_tables_v3`, `apply_stock_count`, `process_stock_in`, `auto_apply_campaigns`, `calculate_cart_pricing`, `split_order_atomic`, etc.) are all **defined** in the SQL migrations.
- **Error handling:** Most routes return structured errors with correct HTTP status codes (400/401/403/404/409/500) and roll back partial writes.
- **Kitchen display (#6):** Filters correctly (hides `is_draft`, hides `paid`, filters `kitchen_status != 'completed'`), has polling fallback + realtime + sound.
- **Recipe cost (#8):** Computed client-side from real `ingredients.average_cost_per_unit`, with yield/waste handling and margin/suggested-price breakdown — correct and functional.
- **Stock adjustment (#7):** `stock-in`/`apply-count`/`loss` all delegate to verified `prevent_negative_stock`/`reverse_stock_deduction` RPCs. Logic is sound.

---

## 1. CRITICAL BUGS (broken functionality)

### C1. Unmerge flow is completely broken — references a non-existent DB function
**File:** `src/app/api/orders/unmerge/route.ts:22`
```ts
const rpcRes = await fetch(`${s.url}/rest/v1/rpc/separate_tables_v1`, { ... });
```
`separate_tables_v1` does **not exist** anywhere in `supabase/migrations/*` or `schema_sync.sql`. The only merge/transfer functions present are `merge_tables_v3`, `transfer_tables_v3`, `merge_orders_atomic`, `transfer_orders_atomic`, `transfer_table_session`. Every unmerge attempt returns **HTTP 500**.

**Impact:** Once two tables are merged, they can **never be separated** through the UI. The ActionSheet "Unmerge" (`Split` mode) in `pos/page.tsx` → `handleUnmerge` will always fail.
**Fix:** Implement `separate_tables_v1` in SQL (mirror the logic of the existing `merge_tables_v3`/`transfer_tables_v3`), or rewrite the route to call an existing function / perform the separation with direct table updates like `transfer/route.ts` does.

### C2. POS campaigns never load, and even when selected the discount is never applied
**Files:**
- `src/app/admin/pos/page.tsx:59-63` (read) — **field mismatch bug**
- `src/app/admin/pos/hooks/usePos.tsx:345-356` (`placeOrder`) — **never transmits campaign**
- `src/app/admin/pos/components/CartPanel.tsx:85-87,326` — **cosmetic-only discount**

1. **Load bug:** `pos/page.tsx` does `const active = (data.campaigns || []).filter(...)`. But `GET /api/campaigns` returns `{ data: [...], total, page, limit }` (`campaigns/route.ts:56`). `data.campaigns` is `undefined`, so the campaign `<select>` is **always empty** — operators can never pick a campaign in POS (#4).
2. **Apply bug:** Even if a campaign were selected, `placeOrder` posts `{ table_number, items, status, guest_count, customer_note, order_type }` — **no `campaign_id`**. So the order is saved at full price.
3. **Charge bug:** `CartPanel` subtracts `selectedCampaign.discount_value` from the *displayed* total (`totalAfterDiscount`), but payment (`handleCloseBill`) sends `card_amount: activeOrder.total_amount` (full price). So the customer is **charged the full amount**, not the discounted one. Worse, `CartPanel` always treats `discount_value` as a **fixed** subtraction regardless of campaign `type` (`percent` is handled wrong).
4. Separately, at payment the server runs `auto_apply_campaigns` RPC independently — so a *different* active campaign may be applied at the server than the one shown in the cart, producing inconsistent totals between cart and bill.

**Impact (#4):** Campaign feature in POS is non-functional and actively misleading (shows a discount that is never charged).
**Fix:** Change `data.campaigns` → `data.data`; transmit `campaign_id` (and proper discount math by `type`) in `placeOrder` and `handleCloseBill`; or remove the cosmetic cart discount and rely solely on server-side `auto_apply_campaigns`.

### C3. QR codes point to a non-existent `/menu` route (dead customer flow)
**File:** `src/app/admin/settings/tabs/QRTab.tsx:113,119,136-150,270`
```ts
QRCodeLib.toDataURL(`${siteUrl}/menu?table=${i}`, ...)
```
There is **no `src/app/menu` page** in the app (only `about, admin, api, kitchen, login, page, reservation, unauthorized`). Scanning any generated table QR leads to a **404**. The intended customer ordering/menu page does not exist.
**Impact (#10):** The table-QR feature — a core dine-in convenience — is dead on arrival.
**Fix:** Either build the `/menu?table=N` customer page, or repoint QR URLs to the existing `/reservation` (or a real customer endpoint) and verify it exists.

### C4. Order-level discount desyncs the POS cart total on re-opened occupied tables
**File:** `src/app/api/orders/discount/route.ts:120-139` vs `src/app/admin/pos/hooks/usePos.tsx:121-158`

For **order-level** discounts (`percent`/`fixed`), the route updates only `orders.total_amount` (line 138) and leaves `order_items.unit_price` untouched. (Only *item-level* discounts rewrite `order_items`.) When an operator later re-opens that occupied table, `usePos.selectTable` recomputes the cart directly from `order_items` at their **original** prices, so the cart total shows the **pre-discount** amount while the floor card and the bill show the discounted total.

**Impact (#1):** "POS cart total amount display on occupied tables" is inconsistent after an order-level discount — the cart understates what the customer will actually be charged.
**Fix:** For order-level discounts, persist the effective price (e.g., store `discount_amount` on the order and have `selectTable` subtract it, or rewrite `order_items` unit prices like the item-level path does, keeping `total_amount` and items in agreement).

---

## 2. MEDIUM ISSUES (UX / correctness / security)

### M1. WhatsApp "integration" is only click-to-chat deep links — no real sending
**Files:** `src/app/api/whatsapp/send/route.ts`, `src/app/api/whatsapp/auto-order/route.ts`
Both routes just build a `https://wa.me/<phone>?text=<encoded>` URL and return it; nothing is sent via the WhatsApp Business API/Cloud API. The client must open the link and manually press send. This is acceptable as a "prepare message" feature but should not be labelled full WhatsApp integration (#9).
**Extra bug:** `auto-order` ignores `supplierId` — it fetches **all** `ingredients` (`/ingredients?select=...&order=current_stock.asc`) and reports every low-stock item regardless of supplier, so a "supplier-specific reorder" message is actually a global low-stock list.
**Fix:** Filter ingredients by the supplier's linked ingredients; clearly label the feature as "open WhatsApp" or integrate the Business API if sending is required.

### M2. `CRON_SECRET` is empty in `.env.local` → cron/kitchen-push auth can be bypassed
**File:** `.env.local` (`CRON_SECRET=` is blank) + `src/app/api/cron/*/route.ts` & `reservations/kitchen-push/route.ts`
The guard is `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`)`. With an empty secret, any request carrying exactly the header `authorization: Bearer ` (literally "Bearer " + empty) passes the check (`'Bearer ' !== 'Bearer '` is false). So the protected cron endpoints (stock thresholds, expired reservations, due kitchen schedules) and the kitchen-push endpoint are effectively **unguarded** if `CRON_SECRET` is not set in the real environment.
**Fix:** Require `CRON_SECRET` to be a non-empty value; fail closed (return 500/401) when it is missing rather than comparing against an empty string; consider a constant-time compare.

### M3. POS "Close Bill" only settles one order; merged/transferred groups can be left open
**File:** `src/app/admin/pos/page.tsx:78-120` (`handleCloseBill`)
It finds the **first** active order on the table and pays it. For merged groups the items are consolidated into the primary order (usually fine), but for transferred/complex groupings with multiple distinct orders, only one is paid — the others remain `occupied` and `total_amount` stays on the floor.
**Fix:** Iterate all active orders on the table (`status not in (paid,cancelled,closed)`) and pay each, or aggregate amounts before a single `process_order_payment`.

### M4. Unmerge "undo" is not wired and its data is incomplete
**Files:** `src/app/admin/pos/page.tsx` (`handleUnmerge` does **not** call `setLastUndo`) + `src/app/api/orders/unmerge/route.ts` (returns only `{ primaryTable, childTables }`) + `src/app/api/orders/undo/route.ts:69-104` (expects `parentOrderId`, `parentOldTotal`, `parentOldGuests`)
Even after C1 is fixed, the undo for unmerge cannot work: the page never stores an undo snapshot, and the route returns none of the fields the undo handler requires.
**Fix:** Have `unmerge/route.ts` capture and return `parentOrderId/parentOldTotal/parentOldGuests/childTableData`, and `handleUnmerge` must call `setLastUndo(...)`.

### M5. `discount` route does not keep `table_floors.total_amount` in sync
**File:** `src/app/api/orders/discount/route.ts:135-139`
It patches `orders.total_amount` but not `table_floors.total_amount`. The floor view currently recomputes totals from `orders` (`pos/tables/route.ts:91`), so the *UI* stays consistent — but any consumer reading `table_floors.total_amount` directly (and the `orders` POST route *does* write `table_floors.total_amount`) will see a stale, divergent value after a discount. This is a latent data-integrity landmine.
**Fix:** After recomputing the discount, also update `table_floors.total_amount` for the table (and `tableStatuses` consumers) or stop writing `table_floors.total_amount` entirely to avoid two sources of truth.

### M6. QR `QRTab` floor grouping uses hardcoded floor names/index math
**File:** `src/app/admin/settings/tabs/QRTab.tsx:152-164,163`
`allFloors = ['Zal 1','Zal 2','VIP','Balkon']` is hardcoded and `getTablesForFloor` assigns tables to floors via `Math.floor((i-1)/10)` indexing into the *fetched* `floors` array. If DB floor names differ (or there are fewer/more floors), tables map to the wrong floor or to `undefined` → floor-specific QR packs are wrong or empty.
**Fix:** Drive the floor list and table→floor mapping from the actual `floors` data, not a hardcoded array + index arithmetic.

### M7. Guest-count persistence edge case
**File:** `src/app/admin/pos/hooks/usePos.tsx:386-417` (`updateGuestCount`)
It updates `cart.guest_count`, then finds the active order excluding `paid`/`cancelled` but **not** `closed`, and PATCHes `guest_count` + `table_floors.guest_count`. Generally works, but if the table has *no* active order yet (cart created but order not yet sent), the change is never persisted to the server — it only lives in local cart state until the first order is placed (at which point `guest_count` *is* sent). Minor, but a freshly-opened empty table's guest count is lost on refresh. Acceptable but worth noting.

---

## 3. LOW PRIORITY (nice-to-haves)

### L1. Debug `console.log` left in production code paths
- `src/lib/transaction.ts:29,52,62,85` — `[OrderEngine]`/`[Transaction]` logs on every action.
- `src/lib/stockAutomation.ts:37,52,69,76,98,170,173,181,184,205` — full `JSON.stringify` dumps of order items, recipes, and inventory logs on every deduction.
These are noisy and can leak business data into server logs. Gate behind `NODE_ENV === 'development'` or a debug flag.

### L2. Deprecated `CartSidebar` component
**File:** `src/components/ui/CartSidebar.tsx:18,20`
Contains `// TODO: restore QR guard` and `// TODO(deprecated): This component bypasses main POS business logic.` Two parallel cart implementations (`CartPanel` in POS vs `CartSidebar`) is a maintenance hazard; confirm it's not rendered anywhere in the admin/kitchen flows.

### L3. Accessibility
Many icon-only buttons lack `aria-label` (e.g., `TableCard` action `MoreVertical` button at `TableCard.tsx:153`, guest +/- buttons, theme toggle). Keyboard nav generally works (standard buttons), but screen-reader support is weak. Add `aria-label`s to all icon buttons and `role="dialog"`/`aria-modal` to modals that lack them.

### L4. AI features depend on `GROQ_API_KEY` which is absent from `.env.local`
Routes `vision`, `invoice-ocr`, `recipes/ai-suggest`, `ai-suggest-ingredients`, `sensei/*`, `correct-name`, `parse-recipe`, `parse-cookbook` all call Groq. With no key configured they gracefully error, but the AI capabilities are non-functional by default. Ensure the key is set in the deployment environment. (Not a code bug, but a deployment gap to flag.)

### L5. Minor consistency
- `pos/tables/route.ts:90` overwrites `table_floors.status` with `'occupied'` whenever orders exist, ignoring a legitimate `reserved`/`waiting_bill` state coming from the floor — reservation status can be masked on the floor view.
- `kitchen/page.tsx` is ~1200 lines in a single file; consider splitting for maintainability (not a bug).

---

## 4. Known-Issue Verification Matrix

| # | Issue | Status | Finding |
|---|-------|--------|---------|
| 1 | POS cart total on occupied tables | **BUG** | C4 — order-level discount leaves `order_items` prices untouched; re-opened cart shows pre-discount total. |
| 2 | Guest count update persistence | OK (minor) | M7 — persists on active order; lost only for unsent empty-table carts. |
| 3 | Close bill / payment flow | **PARTIAL** | M3 — pays only the first order; merged groups may leave orders open. `process_order_payment` RPC itself is fine. |
| 4 | Campaign application in cart | **BROKEN** | C2 — campaigns never load (`data.campaigns` vs `data.data`), never transmitted, never charged; discount is cosmetic and miscalculated by type. |
| 5 | Merge / unmerge / transfer | **BROKEN (unmerge)** | C1 — `separate_tables_v1` RPC missing → unmerge always 500. Merge & transfer are wired to existing RPCs. |
| 6 | Kitchen order display | OK | Filters drafts/paid correctly, realtime + polling + sound. |
| 7 | Stock adjustment logic | OK | Delegates to verified `prevent_negative_stock`/`reverse_stock_deduction`/`apply_stock_count` RPCs. |
| 8 | Recipe cost calculation | OK | Client calc from real `average_cost_per_unit` with yield/waste; margin & suggested price correct. |
| 9 | WhatsApp integration | **WEAK** | M1 — wa.me deep links only (no sending); auto-order ignores `supplierId`. |
| 10 | QR code generation | **BROKEN** | C3 — generates valid PNGs but encodes `/menu?table=N` which 404s (no `/menu` route). |

---

## Recommended Fix Order
1. **C1** implement/repair `separate_tables_v1` (unblocks table management).
2. **C2** fix campaign field name + transmit campaign + correct discount math (or remove cosmetic discount).
3. **C3** build `/menu` or repoint QR URLs to a real page.
4. **C4** keep `order_items` and `orders.total_amount` consistent on discount.
5. **M2** set & enforce `CRON_SECRET` (fail-closed).
6. **M3** settle all orders on a table at close-bill.
7. **M1/M4/M5/M6** WhatsApp supplier filter, unmerge undo wiring, `table_floors` sync, QR floor mapping.
8. **L1–L5** cleanup.
