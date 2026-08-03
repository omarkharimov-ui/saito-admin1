CREATE FUNCTION public.cancel_reservation_from_pos (
  p_reservation_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  update public.reservations
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_reason = 'cancelled_from_pos',
        pre_order_items = '[]'::jsonb,
        pre_order_total = 0,
        updated_at = now()
  where id = p_reservation_id;
end;
$function$;

GRANT ALL ON FUNCTION public.cancel_reservation_from_pos(uuid) TO anon;

GRANT ALL ON FUNCTION public.cancel_reservation_from_pos(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_reservation_from_pos(uuid) TO service_role;