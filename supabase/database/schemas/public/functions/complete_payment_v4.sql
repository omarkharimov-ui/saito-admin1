CREATE FUNCTION public.complete_payment_v4 (
  p_order_id        uuid,
  p_payment_method  text,
  p_total_amount    numeric,
  p_tax_amount      numeric,
  p_service_amount  numeric,
  p_discount_amount numeric
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_table_id INTEGER;
  v_group_id UUID;
BEGIN
  -- Lock order
  SELECT table_number, group_id INTO v_table_id, v_group_id FROM orders WHERE id = p_order_id FOR UPDATE;

  -- Update Order Status
  UPDATE orders SET 
    status = 'COMPLETED',
    payment_method = p_payment_method,
    paid_amount = p_total_amount,
    total_amount = p_total_amount,
    paid_at = now(),
    updated_at = now()
  WHERE id = p_order_id OR (group_id = v_group_id AND status = 'confirmed');

  -- Free Table(s)
  UPDATE table_floors SET 
    status = 'empty', 
    merged_into_table = NULL,
    guest_count = NULL,
    total_amount = 0
  WHERE table_number = v_table_id OR merged_into_table = v_table_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, numeric, numeric, numeric) TO anon;

GRANT ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, numeric, numeric, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.complete_payment_v4(uuid, text, numeric, numeric, numeric, numeric) TO service_role;