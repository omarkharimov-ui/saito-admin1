CREATE FUNCTION public.normalize_table_after_reservation_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.status in ('cancelled', 'expired', 'archived', 'no_show') then
    update public.table_floors
      set status = 'empty',
          reservation_id = null,
          reservation_name = null,
          reservation_phone = null,
          reservation_time = null,
          guest_count = null,
          reservation_status_snapshot = new.status,
          reservation_updated_at = now(),
          updated_at = now()
    where reservation_id = new.id;
  end if;

  if new.status = 'checked_in' then
    update public.table_floors
      set status = 'occupied',
          reservation_status_snapshot = new.status,
          reservation_updated_at = now(),
          updated_at = now()
    where reservation_id = new.id;
  end if;

  if new.status = 'completed' then
    update public.table_floors
      set status = 'empty',
          reservation_status_snapshot = new.status,
          reservation_updated_at = now(),
          updated_at = now()
    where reservation_id = new.id;
  end if;

  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.normalize_table_after_reservation_change() TO anon;

GRANT ALL ON FUNCTION public.normalize_table_after_reservation_change() TO authenticated;

GRANT ALL ON FUNCTION public.normalize_table_after_reservation_change() TO service_role;