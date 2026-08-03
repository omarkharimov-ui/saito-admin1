CREATE FUNCTION public.get_kitchen_stats (
  p_hours integer DEFAULT 24
)
  RETURNS TABLE (
    station               text,
    total_items           bigint,
    avg_prep_time_seconds numeric,
    items_ready           bigint,
    items_delayed         bigint,
    rush_count            bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(oi.station, 'all') AS station,
    COUNT(*) AS total_items,
    ROUND(AVG(EXTRACT(EPOCH FROM (oi.served_at - oi.created_at))), 0) AS avg_prep_time_seconds,
    COUNT(*) FILTER (WHERE oi.kitchen_status = 'ready') AS items_ready,
    COUNT(*) FILTER (WHERE oi.served_at IS NOT NULL AND EXTRACT(EPOCH FROM (oi.served_at - oi.created_at)) > 1200) AS items_delayed,
    COUNT(*) FILTER (WHERE o.is_rush = true) AS rush_count
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.created_at >= now() - (p_hours || ' hours')::INTERVAL
    AND oi.kitchen_status NOT IN ('cancelled')
  GROUP BY COALESCE(oi.station, 'all')
  ORDER BY total_items DESC;
END;
$function$;

GRANT ALL ON FUNCTION public.get_kitchen_stats(integer) TO anon;

GRANT ALL ON FUNCTION public.get_kitchen_stats(integer) TO authenticated;

GRANT ALL ON FUNCTION public.get_kitchen_stats(integer) TO service_role;