CREATE FUNCTION public.get_kitchen_queue (
  p_station text DEFAULT NULL::text
)
  RETURNS TABLE (
    order_id           uuid,
    order_number       text,
    table_number       integer,
    order_source       text,
    customer_name      text,
    guest_count        integer,
    is_rush            boolean,
    created_at         timestamp with time zone,
    order_age_seconds  integer,
    item_id            uuid,
    product_name       text,
    quantity           integer,
    modifiers          jsonb,
    special_notes      text,
    kitchen_status     text,
    station            text,
    is_hold            boolean,
    course             text,
    sent_to_kitchen_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.order_number,
    o.table_number,
    o.order_source,
    o.customer_name,
    o.guest_count,
    o.is_rush,
    o.created_at,
    EXTRACT(EPOCH FROM (now() - o.created_at))::INTEGER AS order_age_seconds,
    oi.id AS item_id,
    oi.product_name,
    oi.quantity,
    oi.modifiers,
    oi.special_notes,
    oi.kitchen_status::TEXT,
    COALESCE(oi.station, 'all') AS station,
    COALESCE(oi.is_hold, false) AS is_hold,
    oi.course,
    oi.created_at AS sent_to_kitchen_at
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.status NOT IN ('paid', 'closed', 'cancelled')
    AND oi.kitchen_status NOT IN ('completed', 'cancelled', 'served')
    AND (p_station IS NULL OR oi.station = p_station)
  ORDER BY
    o.is_rush DESC,
    o.created_at ASC,
    oi.created_at ASC;
END;
$function$;

GRANT ALL ON FUNCTION public.get_kitchen_queue(text) TO anon;

GRANT ALL ON FUNCTION public.get_kitchen_queue(text) TO authenticated;

GRANT ALL ON FUNCTION public.get_kitchen_queue(text) TO service_role;