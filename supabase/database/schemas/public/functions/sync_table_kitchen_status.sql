CREATE FUNCTION public.sync_table_kitchen_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_table_number INT;
  v_new_kitchen_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_number := OLD.table_number;
  ELSE
    v_table_number := NEW.table_number;
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

GRANT ALL ON FUNCTION public.sync_table_kitchen_status() TO anon;

GRANT ALL ON FUNCTION public.sync_table_kitchen_status() TO authenticated;

GRANT ALL ON FUNCTION public.sync_table_kitchen_status() TO service_role;