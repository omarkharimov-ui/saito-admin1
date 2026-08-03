CREATE FUNCTION public.mark_order_all_served (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE order_items SET
    kitchen_status = 'served',
    served_at = now()
  WHERE order_id = p_order_id
    AND kitchen_status = 'ready';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'items_served', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.mark_order_all_served(uuid) TO anon;

GRANT ALL ON FUNCTION public.mark_order_all_served(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_order_all_served(uuid) TO service_role;