# Backend Roadmap — Saito Admin 1

## Phase 1: Atomic RPC Foundation ✅ COMPLETED

All core business operations now have Atomic RPCs:

- [x] `complete_payment_atomic()`
- [x] `reopen_order_atomic()`
- [x] `merge_tables_atomic()`
- [x] `transfer_table_atomic()`
- [x] `dismiss_table_atomic()`
- [x] `cancel_reservation_atomic()`

## Phase 2: Supporting Tables ✅ COMPLETED

- [x] `order_payments` — split/partial/refund payments
- [x] `inventory_transactions` — idempotent stock movements
- [x] `reservation_tables` — normalized reservation-to-table assignments
- [x] `reservation_preorder_items` — SSOT for reservation pre-orders
- [x] `current_order_id` — direct order lookup on `table_floors`
- [x] `operation_logs` — audit trail

## Phase 3: Kitchen Workflow 🔄 IN PROGRESS

### Completed
- [x] Kitchen schedule cron (`/api/cron/process-due-kitchen-schedules`)
- [x] Kitchen schedule API (`/api/kitchen/schedule`)
- [x] Reservation kitchen push (`/api/reservations/kitchen-push`)

### Remaining
- [ ] **Send ticket RPC** — atomic operation to send order to kitchen
- [ ] **Accept ticket RPC** — atomic kitchen acceptance
- [ ] **Preparing RPC** — atomic status transition
- [ ] **Ready RPC** — atomic ready notification
- [ ] **Served RPC** — atomic served confirmation
- [ ] **Scheduled reservation preorder RPC** — atomic preorder activation at scheduled time
- [ ] **Reopen kitchen ticket RPC** — atomic reopen with state rollback

### Known Issues
- Kitchen status is updated via multiple separate REST PATCH calls in `kitchen/schedule/route.ts` — must be consolidated into a single RPC
- No idempotency protection on kitchen status transitions

## Phase 4: Inventory 🔄 IN PROGRESS

### Completed
- [x] `inventory_transactions` table with UNIQUE `order_item_id`
- [x] `deduct_stock_for_order()` called from `complete_payment_atomic`

### Remaining
- [ ] **Deduction RPC** — standalone atomic stock deduction
- [ ] **Rollback RPC** — atomic inventory rollback with reversal creation
- [ ] **Duplicate protection** — ensure UNIQUE constraint prevents double deduction
- [ ] **Combo recipes** — expand combo items into ingredient deductions at payment time

### Known Issues
- No standalone inventory deduction RPC — currently only happens inside payment
- No inventory rollback for cancelled kitchen items
- Combo recipe expansion logic not yet implemented in any RPC

## Phase 5: Realtime Sync 🔄 IN PROGRESS

### Completed
- [x] `OfflineStore` (IndexedDB wrapper)
- [x] `CRDTMerge` (LWW-Element-Set)
- [x] `SyncService` (outbox + pull)
- [x] `createRealtimeChannel()` (fresh channel per mount)

### Remaining
- [ ] **POS ↔ POS sync** — verify table state propagation across devices
- [ ] **POS ↔ Kitchen sync** — verify kitchen status reaches all POS terminals
- [ ] **Reservation ↔ POS sync** — verify reservation changes propagate
- [ ] **Merge sync** — test CRDT merge under concurrent merges
- [ ] **Transfer sync** — test transfer broadcast to all terminals
- [ ] **Payment sync** — test payment completion broadcast

### Known Issues
- `SyncService` pushes to `/rest/v1/<table>` directly — bypasses RPC layer
- No conflict resolution UI — conflicts are silently counted
- Outbox has no retry backoff or max-attempt limit

## Phase 6: Failure Tests ⏳ PENDING

### Planned Tests
- [ ] **Network interruption** — verify outbox + retry works
- [ ] **Double click** — verify idempotency keys prevent duplicate operations
- [ ] **Refresh during payment** — verify payment state survives refresh
- [ ] **Refresh during merge** — verify merge state survives refresh
- [ ] **Refresh during reservation** — verify reservation state survives refresh
- [ ] **Concurrent waiters** — verify seat management under concurrent access

---

## Post-Backend Tasks (DO NOT START UNTIL PHASE 3-6 COMPLETE)

1. Remove `orders.items` permanently
2. Clean `table_floors` snapshot columns (`total_amount`, `guest_count`, `reservation_*`)
3. Redesign reservation kitchen preorder
4. Frontend/UI audit

---

## Quick Reference: File Locations

| Component | Path |
|-----------|------|
| Migrations | `supabase/migrations/` |
| API routes | `artifacts/saito-admin/src/app/api/` |
| RPC wrappers | `artifacts/saito-admin/src/app/api/rpc/` |
| Sync engine | `artifacts/saito-admin/src/lib/sync/` |
| Realtime utils | `artifacts/saito-admin/src/lib/realtime.ts` |
| Kitchen state | `artifacts/saito-admin/src/lib/kitchenState.ts` |
| Table status | `artifacts/saito-admin/src/lib/tableStatus.ts` |
