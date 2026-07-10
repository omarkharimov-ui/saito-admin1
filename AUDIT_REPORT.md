# Saito POS — Live Production Audit Report

> Audit method: source code path tracing + live DB probing (psql) + API route analysis
> Date: July 8, 2026
> Project: `saito-admin1/artifacts/saito-admin`
> Live DB: `jbxmlnsicbfkbsatnoej.supabase.co` (PostgreSQL 17.0)

---

## Executive Summary

**21 critical findings** identified. The system works end-to-end for basic POS flow but has fundamental architectural flaws: the **new codebase replaced all existing PostgreSQL RPC calls** with inline REST PATCH operations, sacrificing atomicity, consistency, and auditability. 

**COGS is $0 for ALL 279 paid orders** — the business has no idea what its food costs are. **Procurement, invoices, stock counts, and waste standards are dead code** with zero production usage. **Service role key exposed to browser** via `next.config.ts`.

---

## Architecture

### Live DB State
| Table | Rows | Status |
|---|---|---|
| orders | 344 (279 paid, 58 cancelled, 7 confirmed) | Active |
| order_items | 799 | Active |
| products | 14 | Active |
| categories | 10 | Active |
| ingredients | 34 | Active |
| recipes | 60 | Active |
| table_floors | 18 | Active |
| reservations | 35 | Active |
| settings | 1 | Active |
| kitchen_schedule | 3 | Active |
| campaigns | 5 | Active |
| cancelled_orders | 9 | Active |
| sessions | 18 | Active |
| admin_users | 2 | Active |
| combos | 1 | Active |
| suppliers | 1 | Dead (never used) |
| invoices | 0 | Dead |
| invoice_items | 0 | Dead |
| purchase_orders | 0 | Dead |
| purchase_order_items | 0 | Dead |
| stock_counts | 0 | Dead |
| waste_standards | 0 | Dead |
| daily_reports | 0 | Dead |
| dining_groups | 0 | Dead |
| transaction_logs | 0 | Dead |
| audit_log | 3 | Active |
| notifications | 3 | Active |
| **order_changes** | **TABLE DOES NOT EXIST** | **History API broken** |
| **public_menu_items** | **TABLE DOES NOT EXIST** | **Kiosk feature broken** |

### RPCs: 73 defined, 0 used
Live DB has 73 PostgreSQL functions (process_order_payment, merge_tables_v3/v4, split_order_atomic, dismiss_table_v3, etc.) — **the new Next.js API code calls NONE of them**. All operations use inline REST PATCH calls.

### Triggers: 27 active
`trg_order_paid_deduct` (fires AFTER UPDATE on orders → `deduct_stock_on_order()`), `trg_update_stock_on_log`, `trg_product_availability_on_stock`, `trg_wac_on_stock_in`, `trg_sync_order_kitchen_status`, `trg_recipe_cost_change`, etc.

---

## Critical Findings

### C1 — Service Role Key Exposed to Client-Side
**File:** `next.config.ts:19`
**Severity:** CRITICAL
`SUPABASE_SERVICE_ROLE_KEY` is in the `env` block, making it accessible via `process.env.SUPABASE_SERVICE_ROLE_KEY` in browser JavaScript. Any user opening devtools has full admin DB access.
**Fix:** Remove from `env` block; create server-only API endpoints.

### C2 — Wrong Supabase Project Ref in Image Config
**File:** `next.config.ts:28`
**Severity:** HIGH
Hardcoded `kyohjeffglkyiiogtrmb.supabase.co` instead of live `jbxmlnsicbfkbsatnoej.supabase.co`. Images from storage will 404.

### C3 — Inline REST PATCH Bypasses All 73 RPCs
**Files:** `/api/orders/pay`, `/merge`, `/split`, `/transfer`, `/undo`, `/cancel`
**Severity:** CRITICAL
- **No FOR UPDATE locks** → race conditions on concurrent payments/merges
- **No DB transactions** → partial failure leaves inconsistent state
- **No audit_log entries** → RPCs wrote to `operation_logs`/`audit_log`; inline code does not
- **No order_payments records** → 279 paid orders, 1 single `order_payments` row
- **Example:** `merge/route.ts:66-76` loops PATCHing source orders, then updates primary order, then loops PATCHing tables. Crash mid-loop = partially merged order with unmerged tables.

### C4 — Double Stock Deduction Risk
**Files:** `stockAutomation.ts`, DB trigger `trg_order_paid_deduct`
**Severity:** HIGH
- DB trigger calls `deduct_stock_on_order()` AFTER UPDATE on orders when status='paid'
- API calls `deductStockForOrder()` in pay route (also on payment)
- Mitigation: trigger checks `inventory_mode` and skips if `on_kitchen_accept`; API does NOT check. If mode is NOT `on_kitchen_accept`, both fire.
- **Live DB:** `inventory_mode = on_kitchen_accept`, so trigger skips but API still deducts on payment — stock IS deducted (once) at payment time, despite the mode saying deduction should happen at kitchen accept.

### C5 — `close_day` RPC Does Not Exist
**Live DB query:** `SELECT * FROM pg_proc WHERE proname ILIKE 'close_day%'` → 0 results.
**Severity:** MEDIUM
`daily_reports` table has 0 rows. The daily close workflow has no DB implementation.

### C6 — COGS = $0 for ALL 279 Paid Orders
**Live DB query:** `SELECT COUNT(*) FROM orders WHERE cogs > 0` → 0
**Live DB query:** `SELECT COUNT(*) FROM inventory_logs WHERE unit_cost IS NOT NULL` → 0
**Severity:** CRITICAL
All 486 inventory_logs records have NULL `unit_cost`. Cost of goods sold cannot be calculated. The business has no food cost data.

### C7 — `order_payments` Has Only 1 Record
**Live DB:** 1 row (7.04₼ card payment). 279 paid orders.
**Severity:** HIGH
New payment flow bypasses `process_order_payment` RPC which inserts into `order_payments`. The inline pay route does not create payment records.

### C8 — `dining_groups` Table Empty
**Live DB:** 0 rows. `table_floors.merged_into_table` all NULL.
**Severity:** LOW
Merge/unmerge/split/transfer never used in this DB. Feature is dead code at this location.

### C9 — Plaintext Passwords and SMTP Credentials in Settings
**Live DB confirmed:**
- `admin_password` = `saito2026`
- `superadmin_password` = `omer2009@`
- `kitchen_password` = `kitchen2025`
- `smtp_user` = `omarkharimov@gmail.com`
- `smtp_pass` = `kqvo dwhj oirv ndka` (Gmail app password)
**Severity:** CRITICAL

### C10 — `is_in_stock` Never Updated
**Live DB:** 9 products have `is_available = false` (trigger works). 0 products have `is_in_stock = false`.
**Severity:** MEDIUM
POS filters by BOTH `is_available !== false && is_in_stock !== false`. `is_in_stock` is manually toggled by admin, not by automation.

### C11 — No Pagination on 20+ API Endpoints
**Severity:** MEDIUM
Most GET routes fetch ALL rows without `.limit()`/`.range()`. Currently OK at this scale but will break at 1000+ rows.

### C12 — Merge/Unmerge/Split/Transfer Not Atomic
**Files:** `merge/route.ts`, `split/route.ts`, `transfer/route.ts`
**Severity:** HIGH
Sequential REST PATCH calls in `for` loops with no transaction boundary. Network/process failure mid-operation leaves partial state.

### C13 — No Idempotency Key on Payment Endpoint
**File:** `pay/route.ts`
**Severity:** HIGH
`POST /api/orders/pay` can be submitted multiple times. No idempotency key, no state machine guard (already-paid check is missing). `deductStockForOrder` has fragile self-check based on first 8 chars of order ID in reason field.

### C14 — Kitchen Page Uses Anonym-Key Client + Redundant Polling
**File:** `kitchen/page.tsx:600-610`
**Severity:** MEDIUM
Kitchen page creates Supabase JS client with anon key, querying via RLS. Also has 30s `setInterval` polling alongside realtime subscription. No auth on kitchen page — anyone with the URL can see orders.

### C15 — `dismiss_table_v3` RPC Exists But Is Not Called
**Live DB:** RPC exists with audit logging. API has no dismiss route. Cancel uses old-style inline code with anon-key client.

### C16 — `deductStockForOrder()` Ignores `inventory_mode` Setting
**File:** `stockAutomation.ts`
**Severity:** HIGH
Live DB setting: `inventory_mode = 'on_kitchen_accept'`. The function deducts stock on payment regardless. Logic should check settings and only deduct if mode permits it. Kitchen accept flow may also need to trigger deduction but does not appear to call this function.

### C17 — `order_changes` Table Does Not Exist
**Live DB:** `relation "order_changes" does not exist`
**Severity:** HIGH
History route `/api/history` references `order_changes` for operation history. This will produce a runtime SQL error. Feature is broken.

### C18 — `public_menu_items` Table Does Not Exist
**Severity:** MEDIUM
Public menu/kiosk frontend has no DB backing. If a public-facing page was deployed, it would error.

### C19 — Procurement/Invoice System Is Dead Code
**Live DB:** `invoices` (0), `purchase_orders` (0), `purchase_order_items` (0), `stock_counts` (0), `waste_standards` (0), `suppliers` (1 dummy row)
**Severity:** LOW
The entire goods receipt, invoice matching, stock count, and waste standard features have never been used. ~15 API routes are dead.

### C20 — `withTransaction()` Is Not a Real Database Transaction
**File:** `lib/transaction.ts`
**Severity:** HIGH
The simulated transaction uses best-effort rollback via separate REST calls. No `BEGIN`/`COMMIT`/`ROLLBACK`, no `FOR UPDATE` locks. If the server crashes mid-rollback, state is permanently inconsistent. `transaction_logs` has 0 rows — never been used.

### C21 — Inconsistent Lock Order Between Payment and Merge RPCs
**Live DB analysis:**
- `process_order_payment` locks `orders` FIRST, then `table_floors`
- `merge_tables_v3` locks `table_floors` FIRST, then `orders`
**Severity:** HIGH
If these RPCs were called concurrently, deadlock would occur. Currently not triggered because API bypasses both RPCs.

---

## Verification Map

| Feature | UI | Hook | API | DB | RPC | Trigger | Realtime | Verified? |
|---|---|---|---|---|---|---|---|---|
| POS Display | `pos/page.tsx` | `usePos.tsx` | `/api/pos/tables` | `table_floors` | - | - | realtime | ✓ |
| Add to Cart | `page.tsx` | `usePos.tsx` | - | `cart` local state | - | - | - | ✓ |
| Submit Order | `page.tsx` | `usePos.tsx` | `POST /api/orders` | `orders` | NOT USED | `trg_sync_order_kitchen_status` | realtime | ✓ |
| Close Bill | `page.tsx` | `usePos.tsx` | `POST /api/orders/pay` | `orders` PATCH | NOT USED (should call process_order_payment) | `trg_order_paid_deduct` | - | ✓ |
| Stock Deduction | - | - | `stockAutomation.ts` | `inventory_logs` | NOT USED | `trg_update_stock_on_log` | - | ✓ |
| Merge Tables | `page.tsx` | `usePos.tsx` | `/api/orders/merge` | `orders` + `table_floors` PATCH | NOT USED (merge_tables_v3/v4 exist) | - | realtime | ✓ |
| Split Tables | `page.tsx` | `usePos.tsx` | `/api/orders/split` | `orders` + `table_floors` PATCH | NOT USED (split_order_atomic exists) | - | realtime | ✓ |
| Transfer | `page.tsx` | `usePos.tsx` | `/api/orders/transfer` | `orders` PATCH | NOT USED (transfer_table_v4 exists) | - | realtime | ✓ |
| Undo | `page.tsx` | `usePos.tsx` | `/api/orders/undo` | `orders` PATCH | NOT USED (undo_operation_v4 exists) | - | realtime | ✓ |
| Cancel | `page.tsx` | `usePos.tsx` | `/api/orders/cancel` | `orders` PATCH | NOT USED (cancel_table_orders existing) | - | realtime | ✓ |
| Kitchen Accept | `kitchen/page.tsx` | - | PATCH via anon client | `orders.kitchen_status` | - | `trg_sync_order_kitchen_status` | realtime + polling | ✓ |
| Kitchen Mark Ready | `kitchen/page.tsx` | - | PATCH via anon client | `order_items` | - | - | realtime + polling | ✓ |
| Kitchen Deliver | `kitchen/page.tsx` | - | PATCH via anon client | `orders.kitchen_status` | - | - | realtime + polling | ✓ |
| Kitchen Undo | `kitchen/page.tsx` | - | PATCH via anon client | `order_items` | - | - | realtime + polling | ✓ |
| Kitchen Sold Out | `kitchen/page.tsx` | - | PATCH via anon client | `products` | - | - | realtime + polling | ✓ |
| Reservation Create | - | - | `/api/reservations` POST | `reservations` | - | - | - | ✓ |
| Reserve Table (pre-order) | - | - | `/api/reservations/reserve-table` | `orders` + `order_items` + `kitchen_schedule` | - | - | - | ✓ |
| Campaigns CRUD | - | - | `/api/campaigns` | `campaigns` | - | - | - | ✓ |
| Login | - | - | `/api/auth/login` | `admin_users` + `sessions` | - | - | - | ✓ |
| Goods Receipt | - | - | `/api/goods-receipt` | `purchase_order_items` + `inventory_logs` | - | `trg_update_stock_on_log` | - | ✓ (dead code) |
| Invoice Apply | - | - | `/api/invoices/[id]/apply` | `invoices` + `ingredients` + `inventory_logs` | - | - | - | ✓ (dead code) |
| Invoice Reconcile | - | - | `/api/invoices/[id]/reconcile` | `invoices` | - | - | - | ✓ (dead code) |
| Stock Check | - | - | `/api/stock-check` | `products` + `recipes` | - | - | - | ✓ |
| Dashboard | - | - | `/api/dashboard` | `products` + `categories` + `orders` + `campaigns` + `settings` | - | - | - | ✓ (no pagination) |
| History | - | - | `/api/history` | `inventory_logs` + `order_changes` (**MISSING**) + `audit_log` | - | - | - | ✓ (order_changes broken) |
| Stats | - | - | `/api/stats` | `orders` | - | - | - | ✓ |
| AI Sensei | - | - | `/api/sensei/chat` | AI API | - | - | - | ✓ (surface) |
| Combos CRUD | - | - | `/api/combos` | `combos` + `combo_items` | - | - | - | ✓ |
| Offline (Mesh) | `usePos.tsx` | - | - | LocalStorage | - | - | - | ✓ (surface) |
| Kitchen Schedule | - | - | `/api/reservations/kitchen-schedule` | `kitchen_schedule` + `reservations` | - | - | - | ✓ |
| Apology (Correct Name) | - | - | `/api/correct-name` | - | - | - | - | ✓ |
| Product Costs | - | - | `/api/products/costs` | `products` + `recipes` | - | - | - | ✓ |
| Loss Recording | - | - | `/api/finance/loss` | `cancelled_orders` | - | - | - | ✓ |

---

## Recommended Fix Priority

### Immediate (production data integrity at risk)
1. **C1** — Remove `SUPABASE_SERVICE_ROLE_KEY` from `next.config.ts` env block
2. **C3** — Wrap payment/merge/split/transfer/undo/cancel in real DB transactions (or restore RPC calls)
3. **C6** — Populate `unit_cost` in `inventory_logs` during stock deductions
4. **C9** — Move passwords to secure env vars; hash admin passwords
5. **C7** — Fix payment flow to insert `order_payments` records

### High (incorrect behavior / data loss risk)
6. **C13** — Add idempotency key to payment endpoint
7. **C12** — Add transaction boundaries to merge/split/transfer
8. **C16** — Make `deductStockForOrder()` respect `inventory_mode` setting
9. **C17** — Create `order_changes` table or remove references
10. **C20** — Replace simulated transaction with actual DB transaction

### Medium (operational concerns)
11. **C2** — Fix image hostname
12. **C4** — Resolve double-deduction architecture
13. **C11** — Add pagination to unbounded GET endpoints
14. **C14** — Add auth to kitchen page
15. **C21** — Fix inconsistent lock order in RPCs (or remove RPCs entirely)

### Low (dead code / cosmetic)
16. **C5** — Implement or remove `close_day` RPC
17. **C8** — Clean up unused features
18. **C10** — Add trigger for `is_in_stock`
19. **C15** — Remove unused RPC or restore dismiss route
20. **C18** — Create table or remove kiosk feature
21. **C19** — Clean up dead procurement code

---

## Live DB Credentials (for verification)
- **Project ref:** `jbxmlnsicbfkbsatnoej`
- **Pooler URL:** `postgresql://postgres.jbxmlnsicbfkbsatnoej@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`
- **Password:** `nuxbeG-fahqir-sepxe3`
- **psql binary:** `/opt/homebrew/Cellar/libpq/18.4/bin/psql`

---

## Files Referenced
All paths relative to `artifacts/saito-admin/src/`.

| File | Lines | Role |
|---|---|---|
| `next.config.ts` | 38 | PWA + env exposure + image config |
| `app/admin/pos/page.tsx` | 701 | POS UI |
| `app/admin/pos/hooks/usePos.tsx` | 814 | POS state + API calls |
| `app/kitchen/page.tsx` | 1181 | Kitchen display |
| `app/api/orders/pay/route.ts` | 84 | Payment endpoint |
| `app/api/orders/merge/route.ts` | ~170 | Merge tables |
| `app/api/orders/split/route.ts` | ~60 | Split tables |
| `app/api/orders/transfer/route.ts` | ~100 | Transfer tables |
| `app/api/orders/undo/route.ts` | ~140 | Undo operation |
| `app/api/orders/cancel/route.ts` | 54 | Cancel order |
| `app/api/orders/route.ts` | ~100 | Orders CRUD |
| `app/api/pos/tables/route.ts` | ~250 | Table status |
| `app/api/pos/products/route.ts` | 33 | Products list |
| `app/api/pos/floors/route.ts` | ~70 | Floors CRUD |
| `app/api/reservations/route.ts` | 59 | Reservations CRUD |
| `app/api/reservations/reserve-table/route.ts` | ~200 | Pre-order from reservation |
| `app/api/reservations/kitchen-schedule/route.ts` | 171 | Kitchen schedule |
| `app/api/goods-receipt/route.ts` | 119 | Purchase order receiving |
| `app/api/invoices/[id]/apply/route.ts` | 119 | Invoice apply to stock |
| `app/api/stock-check/route.ts` | 48 | Stock availability check |
| `app/api/history/route.ts` | ~100 | Event history |
| `app/api/dashboard/route.ts` | ~80 | Dashboard aggregation |
| `app/api/stats/route.ts` | ~300 | Time-filtered stats |
| `app/api/auth/login/route.ts` | 83 | Login flow |
| `app/api/combos/route.ts` | 86 | Combos CRUD |
| `lib/stockAutomation.ts` | 169 | Stock deduction logic |
| `lib/transaction.ts` | 76 | Simulated transaction (not real) |
| `lib/supabaseClient.ts` | ~900 | DB types + client |
