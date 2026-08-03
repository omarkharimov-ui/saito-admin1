-- log_kitchen_analytics: atomic insert for kitchen analytics
CREATE OR REPLACE FUNCTION public.log_kitchen_analytics(
  p_order_id UUID,
  p_order_item_id UUID,
  p_station TEXT,
  p_action TEXT,
  p_prep_time_seconds INT DEFAULT NULL,
  p_delay_seconds INT DEFAULT NULL,
  p_rush BOOLEAN DEFAULT FALSE,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.kitchen_analytics (
    order_id, order_item_id, station, action, prep_time_seconds, delay_seconds, rush, created_by
  ) VALUES (
    p_order_id, p_order_item_id, p_station, p_action, p_prep_time_seconds, p_delay_seconds, p_rush, p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
