CREATE FUNCTION public.calculate_order_total_v2 (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order RECORD;
  v_items_total NUMERIC;
  v_discount_total NUMERIC;
  v_subtotal NUMERIC;
  v_sc NUMERIC;
  v_tax NUMERIC;
  v_grand_total NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Sum non-cancelled items
  SELECT
    COALESCE(SUM(total_price), 0),
    COALESCE(SUM(COALESCE(
      (SELECT SUM(d.amount) FROM jsonb_array_elements_text(
        COALESCE(price_snapshot->'discounts', '[]'::JSONB)
      ) AS d(amount)), 0
    ), 0), 0)
  INTO v_items_total, v_discount_total
  FROM order_items
  WHERE order_id = p_order_id
    AND kitchen_status NOT IN ('cancelled');

  v_subtotal := v_items_total - v_discount_total;
  v_sc := round(v_subtotal * COALESCE(v_order.service_charge_pct, 0) / 100, 2);
  v_tax := round((v_subtotal + v_sc) * COALESCE(v_order.tax_pct, 0) / 100, 2);
  v_grand_total := v_subtotal + v_sc + v_tax;

  UPDATE orders SET
    subtotal = v_subtotal,
    discount = v_discount_total,
    service_charge_amount = v_sc,
    tax_amount = v_tax,
    total_amount = v_grand_total,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'items_total', v_items_total,
    'discount', v_discount_total,
    'subtotal', v_subtotal,
    'service_charge_pct', v_order.service_charge_pct,
    'service_charge_amount', v_sc,
    'tax_pct', v_order.tax_pct,
    'tax_amount', v_tax,
    'tip_amount', v_order.tip_amount,
    'grand_total', v_grand_total
  );
END;
$function$;

GRANT ALL ON FUNCTION public.calculate_order_total_v2(uuid) TO anon;

GRANT ALL ON FUNCTION public.calculate_order_total_v2(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_order_total_v2(uuid) TO service_role;