CREATE FUNCTION public.get_next_order_number (
  p_order_type text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_next INTEGER;
BEGIN
  INSERT INTO public.order_counters (order_type, counter_date, last_number)
  VALUES (p_order_type, v_today, 1)
  ON CONFLICT (order_type, counter_date) DO UPDATE
    SET last_number = order_counters.last_number + 1
    RETURNING last_number INTO v_next;

  RETURN v_next::TEXT;
END;
$function$;

GRANT ALL ON FUNCTION public.get_next_order_number(text) TO anon;

GRANT ALL ON FUNCTION public.get_next_order_number(text) TO authenticated;

GRANT ALL ON FUNCTION public.get_next_order_number(text) TO service_role;