CREATE FUNCTION public.toggle_rush (
  order_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  UPDATE orders SET is_rush = NOT is_rush WHERE id = order_id;
END;
$function$;

GRANT ALL ON FUNCTION public.toggle_rush(uuid) TO anon;

GRANT ALL ON FUNCTION public.toggle_rush(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.toggle_rush(uuid) TO service_role;