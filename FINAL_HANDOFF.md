# AGENT HANDOFF — saito-admin1 POS

## CURRENT STATE

All changes are committed and pushed to `main`. Dev server was running at `http://localhost:3000`.

## SUPABASE

- Project URL: `https://jbxmlnsicbfkbsatnoej.supabase.co`
- Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG1sbnNpY2Jma2JzYXRub2VqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjUwOTk3MywiZXhwIjoyMDkyMDg1OTczfQ.oPt6o5u6WNuVoR4hPzLKS3ICUDStOh__MVOiCT7cqnI`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG1sbnNpY2Jma2JzYXRub2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MDk5NzMsImV4cCI6MjA5MjA4NTk3M30.5voWlyQ40JPH8QHDCLjEuCwWPyPUSHyvChkKsp6Kaps`
- Linked via Supabase CLI
- Migrations applied through `20260823000001_fix_table_state_machine.sql`

## GIT

- Branch: `main`
- Working tree: clean
- All changes pushed to `origin/main`
- Recent commits:
  - `307f7cf` feat: implement canonical dine-in flow with SSOT table state
  - `f56f05d` fix: served tables show green border and correct label
  - `c6d541d` fix: add served table status with amber border and keep ready border green
  - `fe0233f` fix: mark_order_ready updates table_floors status and add served status
  - `94a3e12` feat: implement serve flow with table color change
  - `f490750` feat: disable auth for local development

## WHAT WAS COMPLETED

### 1. Table State Machine Audit & Fix
- Fixed `transition_order_status` RPC to use canonical `transition_table_status` for table updates
- Fixed `complete_payment_atomic` to use `cleaning` instead of invalid `dirty` status
- Fixed `mark_order_ready` to advance dine-in order status to `ready`
- Fixed `prepare_order_items` to update table status to `in_kitchen` for dine-in
- Added missing `ready → dining` transition to `state_transitions`
- All transitions now follow canonical table lifecycle:
  ```
  empty → ordering → in_kitchen → ready → dining → bill_requested → payment_pending → paid → cleaning → empty
  ```

### 2. Dine-in Flow Fixes
- "Servis et" button now uses order ID (not table ID) for transition
- Fixed DB data inconsistency: 63 orders with `kitchen_status = 'ready'` but `status != 'ready'` were fixed
- `handleMarkServed` falls back to `actionSheetTable.order_ids[0]` if `current_order_id` is missing

### 3. Guest Count Morph (IN PROGRESS — STILL BROKEN)
- Current implementation: `CartPanel.tsx` lines 426-480
- Uses `motion.button` + `motion.div layout` for morph animation
- Wrapped in `<div className="flex-shrink-0" style={{ width: 200 }}>` to prevent cart movement
- **KNOWN ISSUES:**
  1. Morph is not visibly animating (just instant swap)
  2. Save sometimes reverts to old value (3 → 4 → ✓ → still shows 3)
  3. Need to verify if it's a realtime race or API issue

### 4. Translations Updated
- `order_served`: `Verildi` → `Masada` (AZ), `Served` → `At Table` (EN), `Подано` → `За столом` (RU)
- `unpaid`/`paid` keys added to all locales
- `table_in_kitchen`: `Hazırlanır` → `Metbəxdə` / `In Kitchen` / `На кухне`

### 5. CSRF Fix
- `validateCsrfToken(request, authenticated)` — local dev skips CSRF
- `apiFetch` auto-creates `saito_csrf` cookie if missing

## CURRENT BUGS / NEXT STEPS

### CRITICAL: Guest Count Morph + Save
**Location:** `CartPanel.tsx` lines 426-480

**Symptoms:**
1. Morph not visibly animating — just instant swap between `3 QONAQ` and `- 3 + ✓`
2. Save unreliable — `3 → 4 → ✓` sometimes reverts to `3`

**Suspected causes:**
1. Morph: `layout` prop alone may not be enough without `layoutId` or proper shared layout
2. Save: Possible realtime race — after save, `fetchFloorRef.current()` might be pulling stale data from `tableOrderCache` or overwriting with old realtime event

**Files to investigate:**
- `CartPanel.tsx` — guest count UI
- `usePos.tsx` — `fetchFloor`, `fetchData`, realtime subscription, `tableOrderCache`
- `api/orders/guest-count/route.ts` — API endpoint

**Debug steps needed:**
1. Add console logs to `commitGuestCount` to verify value passed
2. Add console logs to API route to verify received value
3. Directly query Supabase after save to verify DB write
4. Check if realtime is firing after save and what value it carries
5. Check `tableOrderCache` in `usePos.tsx` — it might be serving stale data on `fetchFloor`

### Takeaway/Delivery Payment Badges
- TakeawayOrders.tsx and DeliveryOrders.tsx have UNPAID/PAID badges
- Need to verify if these are correct or need adjustment

### Kitchen RPC Direct Updates
- `kitchen-push/route.ts` still directly updates `orders.kitchen_status = 'pending'`
- `kitchen/page.tsx` still directly updates `orders.assigned_to`
- These are non-lifecycle fields but should ideally go through RPCs too

## AUTH

- Middleware bypassed for local dev: `/admin`, `/kitchen`, `/api`
- PIN login: `1234` (admin)
- CSRF disabled for unauthenticated requests in local dev

## KEY PATHS

- POS page: `artifacts/saito-admin/src/app/admin/pos/page.tsx`
- CartPanel: `artifacts/saito-admin/src/app/admin/pos/components/CartPanel.tsx`
- TableCard: `artifacts/saito-admin/src/app/admin/pos/components/TableCard.tsx`
- ActionSheet: `artifacts/saito-admin/src/app/admin/pos/components/ActionSheet.tsx`
- usePos hook: `artifacts/saito-admin/src/app/admin/pos/hooks/usePos.tsx`
- State machine: `artifacts/saito-admin/src/hooks/useOrderStateMachine.ts`
- Guest count API: `artifacts/saito-admin/src/app/api/orders/guest-count/route.ts`
- Migrations: `supabase/migrations/`
- DB schema: `supabase/database/schemas/public/`

## TEST ORDERS IN DB

- Table 15, order `d79b9737-cd29-45a9-8647-da445a93e000` — status `new`, guest_count `1`
- Table 9, order `3a8e72c8-f5ac-42bf-a70b-baf26c0a2663` — test order, can be deleted

## ACCEPTANCE CRITERIA PENDING

- [ ] Guest count morph visibly animates (not instant swap)
- [ ] CartPanel does not move during morph
- [ ] Save is instant on ✓ (no 600ms delay)
- [ ] DB actually changes after save (verified via direct query)
- [ ] Reload shows new value
- [ ] No stale realtime reverts the value
- [ ] Full dine-in lifecycle tested end-to-end
- [ ] Takeaway payment badges verified
- [ ] Kitchen direct updates moved to RPCs
