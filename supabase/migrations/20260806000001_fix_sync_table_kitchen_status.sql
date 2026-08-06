-- ============================================================================
-- FIX: sync_table_kitchen_status() referenced NEW.table_number, but the trigger
-- is attached to order_items which has no table_number column. Any UPDATE of
-- order_items.kitchen_status (dismiss/cancel item/kitchen accept/ready/serve)
-- raised "record \"new\" has no field \"table_number\"" (42703) and rolled back.
--
-- Fix: resolve the table from the order (orders.table_number via order_id),
-- which is the real source of truth. Keeps trigger attachment idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_table_kitchen_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_table_number INT;
  v_new_kitchen_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT table_number INTO v_table_number FROM public.orders WHERE id = OLD.order_id;
  ELSE
    SELECT table_number INTO v_table_number FROM public.orders WHERE id = NEW.order_id;
  END IF;

  IF v_table_number IS NULL OR v_table_number <= 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE kitchen_status NOT IN ('cancelled', 'comped', 'wasted', 'recalled', 'completed')) = 0 THEN 'completed'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'ready') > 0 THEN 'ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'preparing') > 0 THEN 'preparing'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'accepted') > 0 THEN 'accepted'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'pending') > 0 THEN 'pending'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'reserved') > 0 THEN 'reserved'
      ELSE 'pending'
    END INTO v_new_kitchen_status
  FROM order_items
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE table_number = v_table_number
      AND status NOT IN ('paid', 'cancelled', 'closed')
  );

  UPDATE public.table_floors
  SET kitchen_status = v_new_kitchen_status, updated_at = NOW()
  WHERE table_number = v_table_number;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_table_kitchen_status_items ON public.order_items;
CREATE TRIGGER trg_sync_table_kitchen_status_items
  AFTER UPDATE OF kitchen_status ON public.order_items
  FOR EACH ROW
  WHEN (OLD.kitchen_status::text IS DISTINCT FROM NEW.kitchen_status::text)
  EXECUTE FUNCTION public.sync_table_kitchen_status();

GRANT ALL ON FUNCTION public.sync_table_kitchen_status() TO anon;
GRANT ALL ON FUNCTION public.sync_table_kitchen_status() TO authenticated;
GRANT ALL ON FUNCTION public.sync_table_kitchen_status() TO service_role;
