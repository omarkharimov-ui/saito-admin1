CREATE FUNCTION public.apply_tax (
  p_order_id     uuid,
  p_pct          numeric,
  p_performed_by uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_tax_amount NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_tax_amount := round(COALESCE(v_order.total_amount, 0) * p_pct / 100, 2);

  UPDATE orders SET
    tax_pct = p_pct,
    tax_amount = v_tax_amount,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'tax_pct', p_pct,
    'tax_amount', v_tax_amount
  );
END;
$function$;

GRANT ALL ON FUNCTION public.apply_tax(uuid, numeric, uuid) TO anon;

GRANT ALL ON FUNCTION public.apply_tax(uuid, numeric, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.apply_tax(uuid, numeric, uuid) TO service_role;