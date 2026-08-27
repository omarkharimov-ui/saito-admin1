-- ============================================================
-- order_items.kitchen_status must accept 'voided'
-- The void RPCs (void_items_state_aware, refund/return RPCs)
-- soft-void items by setting kitchen_status='voided'. The
-- check constraint never listed 'voided', so every void failed
-- at the DB layer and was NEVER written to Supabase.
-- ============================================================

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_kitchen_status_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_kitchen_status_check
  CHECK (
    (kitchen_status IS NULL) OR
    (kitchen_status::text = ANY (ARRAY[
      'pending', 'accepted', 'preparing', 'ready', 'served',
      'completed', 'cancelled', 'bar', 'hot', 'sushi', 'reserved',
      'sent', 'recalled', 'comped', 'wasted', 'voided'
    ]))
  );

-- ============================================================
-- cancelled_orders.reason must accept 'void'
-- void_items_state_aware inserts reason='void'. The check
-- constraint only allowed refund reason codes, so void inserts
-- failed silently. Add 'void' (and keep the audit distinct).
-- ============================================================

ALTER TABLE public.cancelled_orders
  DROP CONSTRAINT IF EXISTS cancelled_orders_reason_check;

ALTER TABLE public.cancelled_orders
  ADD CONSTRAINT cancelled_orders_reason_check
  CHECK (
    reason::text = ANY (ARRAY[
      'customer_refused', 'quality_issue', 'delay',
      'wrong_order', 'other', 'void', 'waste'
    ])
  );