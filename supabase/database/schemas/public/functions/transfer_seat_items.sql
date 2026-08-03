CREATE FUNCTION public.transfer_seat_items (
  p_order_id     uuid,
  p_from_seat    integer,
  p_to_seat      integer,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE order_items
  SET seat_number = p_to_seat
  WHERE order_id = p_order_id
    AND seat_number = p_from_seat
    AND kitchen_status NOT IN ('cancelled', 'served');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  PERFORM log_order_event(
    p_order_id, 'seat_changed',
    jsonb_build_object('from_seat', p_from_seat),
    jsonb_build_object('to_seat', p_to_seat, 'items_moved', v_updated),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'items_moved', v_updated);
END;
$function$;

GRANT ALL ON FUNCTION public.transfer_seat_items(uuid, integer, integer, uuid) TO anon;

GRANT ALL ON FUNCTION public.transfer_seat_items(uuid, integer, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.transfer_seat_items(uuid, integer, integer, uuid) TO service_role;