-- 20260923000002_bds_ready_bridge.sql
-- BDS status-ownership bridge (owner request 2026-09-23):
-- "kitchen statuses are pressed in KDS; BDS statuses are pressed in BDS".
--
-- PROBLEM (found in 2026-09-23 E2E): the delivery state machine is
--   pending -> confirmed -> preparing -> ready -> picked_up -> in_transit -> delivered
-- The kitchen half (confirmed/preparing/ready) is NOT BDS-owned, and NOTHING
-- ever advanced it: KDS mark-ready only sets orders.kitchen_status='ready'
-- (mark_item_ready_atomic), never delivery_status. Result: delivery orders
-- sat at delivery_status NULL forever, the BDS board showed no courier
-- buttons (picked_up is only valid from 'ready'), and the board was useless.
--
-- FIXES:
--   1. in_transit -> delivered transition was MISSING (dead end: a courier
--      who marked en-route could never mark delivered). Added to
--      state_transitions SSOT.
--   2. BEFORE UPDATE bridge trigger: when KDS finishes the kitchen
--      (orders.kitchen_status -> 'ready') on a delivery order, advance
--      delivery_status pending|confirmed|preparing -> 'ready'. Kitchen side
--      is still "pressed" by KDS (mark-ready); BDS then takes over at
--      picked_up. Direct UPDATE (not the transition RPC) — same pattern as
--      the payment/loyalty sync triggers; the NEXT courier transition is
--      still fully machine-validated (ready -> picked_up).
--   3. One-time backfill for orders whose kitchen is already finished.

BEGIN;

-- 1) close the in_transit dead end
INSERT INTO state_transitions (id, entity, from_status, to_status, description)
SELECT gen_random_uuid(), 'delivery', 'in_transit', 'delivered', 'Courier completes delivery'
WHERE NOT EXISTS (
  SELECT 1 FROM state_transitions
  WHERE entity = 'delivery' AND from_status = 'in_transit' AND to_status = 'delivered'
);

-- 2) kitchen-ready bridge
CREATE OR REPLACE FUNCTION sync_bds_ready_on_kitchen() RETURNS trigger AS $f$
BEGIN
  IF NEW.kitchen_status = 'ready'
     AND OLD.kitchen_status IS DISTINCT FROM 'ready'
     AND NEW.order_type = 'delivery'
     AND COALESCE(NEW.delivery_status, 'pending') IN ('pending', 'confirmed', 'preparing') THEN
    NEW.delivery_status := 'ready';
  END IF;
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_bds_ready_bridge ON orders;
CREATE TRIGGER trg_orders_bds_ready_bridge
  BEFORE UPDATE ON orders
  FOR EACH ROW WHEN (NEW.kitchen_status = 'ready' AND OLD.kitchen_status IS DISTINCT FROM 'ready')
  EXECUTE FUNCTION sync_bds_ready_on_kitchen();

-- 3) backfill: kitchen already finished, delivery still stuck in the kitchen half
UPDATE orders o
SET delivery_status = 'ready', updated_at = now()
WHERE o.order_type = 'delivery'
  AND COALESCE(o.delivery_status, 'pending') IN ('pending', 'confirmed', 'preparing')
  AND o.kitchen_status IN ('ready', 'completed')
  AND o.status NOT IN ('cancelled', 'closed', 'refunded', 'partially_refunded', 'voided');

COMMIT;
