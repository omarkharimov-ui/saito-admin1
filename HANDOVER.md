# SAITO ADMIN 1 — BACKEND AUDIT CONTINUATION

You are continuing an existing production audit of the Saito Admin 1 Restaurant POS system.

## IMPORTANT

Do NOT redesign the architecture.

The architecture has already been decided.

Continue exactly from the previous audit.

Do not revert previous work.

Do not introduce duplicate data.

Maintain Single Source Of Truth (SSOT).

---

# Current State

Already completed:

* Atomic RPCs
  * `complete_payment_atomic()`
  * `reopen_order_atomic()`
  * `merge_tables_atomic()`
  * `transfer_table_atomic()`
  * `dismiss_table_atomic()`
  * `cancel_reservation_atomic()`

* `order_payments` implemented
* `inventory_transactions` implemented
* `reservation_tables` implemented
* `current_order_id` implemented
* `operation_logs` implemented
* `reservation_preorder_items` is now the SSOT
* Draft orders removed
* `orders.items` JSON is no longer used

---

# Current Goal

Do NOT start frontend work.

Continue auditing every backend workflow until the backend is production ready.

---

# Continue From This Checklist

Continue exactly from here:

### Kitchen

* [ ] Send ticket
* [ ] Accept
* [ ] Preparing
* [ ] Ready
* [ ] Served
* [ ] Scheduled reservation preorder
* [ ] Reopen kitchen ticket

### Inventory

* [ ] Deduction
* [ ] Rollback
* [ ] Duplicate protection
* [ ] Combo recipes

### Realtime

* [ ] POS ↔ POS
* [ ] POS ↔ Kitchen
* [ ] Reservation ↔ POS
* [ ] Merge sync
* [ ] Transfer sync
* [ ] Payment sync

### Failure Tests

* [ ] Network interruption
* [ ] Double click
* [ ] Refresh during payment
* [ ] Refresh during merge
* [ ] Refresh during reservation
* [ ] Concurrent waiters

---

# IMPORTANT

Do NOT simply test.

While auditing:

* Find hidden bugs
* Fix them immediately
* Remove duplicated logic
* Remove race conditions
* Fix transaction boundaries
* Fix inconsistent state transitions
* Fix orphan records
* Fix inventory mismatches
* Fix payment inconsistencies
* Fix reservation bugs
* Fix realtime synchronization

If you discover architecture problems,
fix them before continuing.

---

# Backend Rules

Every business operation must have exactly one backend entry point.

Frontend must never coordinate multiple updates.

All business logic belongs inside Atomic RPCs.

Maintain SSOT.

Never duplicate business data.

---

# Do NOT do yet

Do NOT begin frontend polish.

Do NOT redesign UI.

Do NOT refactor components unless required to fix backend workflow.

---

# After ALL backend workflows pass

Only then continue with:

1. Remove `orders.items` permanently
2. Clean `table_floors` snapshot columns
3. Redesign reservation kitchen preorder
4. Frontend/UI audit
