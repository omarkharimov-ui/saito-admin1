CREATE FUNCTION public.clear_table_on_reservation_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  update public.table_floors
    set status = 'empty',
        reservation_id = null,
        reservation_name = null,
        reservation_phone = null,
        reservation_time = null,
        guest_count = null,
        reservation_status_snapshot = 'deleted',
        reservation_updated_at = now(),
        updated_at = now()
  where reservation_id = old.id;
 
  return old;
end;
$function$;

GRANT ALL ON FUNCTION public.clear_table_on_reservation_delete() TO anon;

GRANT ALL ON FUNCTION public.clear_table_on_reservation_delete() TO authenticated;

GRANT ALL ON FUNCTION public.clear_table_on_reservation_delete() TO service_role;