-- ============================================================
-- PHASE 0.2-C6/C7: Cross-Entity Consistency — Order -> Items / Payments
-- SSOT principle: child entities (order_items, order_payments,
--   kitchen_tickets, payments) derive location/organization from their
--   parent order deterministically. NO duplicate location_id/org on child.
-- Applied actions:
--   * order_items, order_payments, kitchen_tickets already have
--     order_id -> orders(id) ON DELETE CASCADE (verified).
--   * payments lacked an order FK entirely; added payments_order_id_fkey
--     so payment location is deterministically tied to its order.
-- ============================================================

ALTER TABLE payments ADD CONSTRAINT payments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
