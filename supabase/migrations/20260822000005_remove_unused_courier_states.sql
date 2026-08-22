-- Remove unused courier intermediate states from canonical delivery flow
-- waiting_courier and in_transit require a courier app that does not exist yet
-- Simplify delivery flow: ready → picked_up → delivered → completed

DELETE FROM public.state_transitions
WHERE entity = 'delivery'
  AND (from_status = 'ready' AND to_status = 'waiting_courier')
  OR (from_status = 'waiting_courier' AND to_status = 'picked_up')
  OR (from_status = 'picked_up' AND to_status = 'in_transit')
  OR (from_status = 'in_transit' AND to_status = 'delivered')
  OR (from_status = 'in_transit' AND to_status = 'cancelled');
