CREATE FUNCTION public.sync_order_kitchen_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order_id UUID;
  v_new_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE kitchen_status NOT IN ('cancelled', 'comped', 'wasted', 'recalled')) = 0 THEN 'cancelled'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'served') > 0 THEN 'served'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'preparing') > 0
           AND COUNT(*) FILTER (WHERE kitchen_status IN ('pending', 'accepted', 'ready')) > 0 THEN 'partially_ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'preparing') > 0 THEN 'preparing'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'ready') > 0 THEN 'ready'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'accepted') > 0 THEN 'accepted'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'pending') > 0 THEN 'pending'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'reserved') > 0 THEN 'reserved'
      WHEN COUNT(*) FILTER (WHERE kitchen_status = 'completed') > 0 THEN 'completed'
      ELSE 'cancelled'
    END INTO v_new_status
  FROM order_items
  WHERE order_id = v_order_id;

  UPDATE orders
  SET kitchen_status = v_new_status
  WHERE id = v_order_id
    AND status NOT IN ('paid', 'cancelled', 'closed');

  RETURN COALESCE(NEW, OLD);
END;
$function$;

GRANT ALL ON FUNCTION public.sync_order_kitchen_status() TO anon;

GRANT ALL ON FUNCTION public.sync_order_kitchen_status() TO authenticated;

GRANT ALL ON FUNCTION public.sync_order_kitchen_status() TO service_role;