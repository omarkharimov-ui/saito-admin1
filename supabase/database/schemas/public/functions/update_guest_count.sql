CREATE FUNCTION public.update_guest_count (
  p_table_number integer,
  p_guest_count  integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_active_count INT;
BEGIN
  IF p_guest_count IS NULL OR p_guest_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Guest count must be at least 1');
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.orders
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed');

  IF v_active_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on this table');
  END IF;

  UPDATE public.orders SET
    guest_count = p_guest_count,
    updated_at = NOW()
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed');

  UPDATE public.table_floors SET
    guest_count = p_guest_count,
    updated_at = NOW()
  WHERE table_number = p_table_number;

  RETURN jsonb_build_object('success', true, 'guest_count', p_guest_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT ALL ON FUNCTION public.update_guest_count(integer, integer) TO anon;

GRANT ALL ON FUNCTION public.update_guest_count(integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.update_guest_count(integer, integer) TO service_role;