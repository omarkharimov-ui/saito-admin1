CREATE FUNCTION public.dismiss_table_v3 (
  p_table_number integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  -- Mark all active orders as cancelled
  UPDATE orders SET status = 'cancelled', updated_at = now() 
  WHERE table_number = p_table_number AND status NOT IN ('paid', 'cancelled', 'closed');

  -- Also handle merged tables
  UPDATE orders SET status = 'cancelled', updated_at = now()
  WHERE id IN (
    SELECT id FROM orders o 
    JOIN table_floors tf ON o.table_number = tf.table_number 
    WHERE tf.merged_into_table = p_table_number
  );

  -- Reset all related table floors
  UPDATE table_floors SET 
    status = 'empty', 
    guest_count = NULL, 
    total_amount = 0, 
    merged_into_table = NULL,
    reservation_id = NULL
  WHERE table_number = p_table_number OR merged_into_table = p_table_number;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.dismiss_table_v3(integer) TO anon;

GRANT ALL ON FUNCTION public.dismiss_table_v3(integer) TO authenticated;

GRANT ALL ON FUNCTION public.dismiss_table_v3(integer) TO service_role;