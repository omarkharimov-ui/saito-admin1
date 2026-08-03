CREATE FUNCTION public.log_kitchen_analytics (
  p_order_id          uuid,
  p_order_item_id     uuid,
  p_station           text,
  p_action            text,
  p_prep_time_seconds integer DEFAULT NULL::integer,
  p_delay_seconds     integer DEFAULT NULL::integer,
  p_rush              boolean DEFAULT false,
  p_performed_by      uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  INSERT INTO public.kitchen_analytics (
    order_id, order_item_id, station, action, prep_time_seconds, delay_seconds, rush, created_by
  ) VALUES (
    p_order_id, p_order_item_id, p_station, p_action, p_prep_time_seconds, p_delay_seconds, p_rush, p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.log_kitchen_analytics(uuid, uuid, text, text, integer, integer, boolean, uuid) TO anon;

GRANT ALL ON FUNCTION public.log_kitchen_analytics(uuid, uuid, text, text, integer, integer, boolean, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.log_kitchen_analytics(uuid, uuid, text, text, integer, integer, boolean, uuid) TO service_role;