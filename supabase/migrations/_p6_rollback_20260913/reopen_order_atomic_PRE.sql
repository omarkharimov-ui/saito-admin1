CREATE OR REPLACE FUNCTION public.reopen_order_atomic(p_order_id uuid, p_reason text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_order RECORD;
  v_item  RECORD;
  v_rev   jsonb;
  v_reversed integer := 0;
BEGIN
  -- P-3: this is the single trusted path allowed to remove an order's payment
  -- records (full authorized reversal). Transaction-scoped flag read by
  -- trg_order_payment_immutable; external callers cannot forge it.
  PERFORM set_config('app.payment_ledger_reopen', 'on', true);

  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid','completed','partially_refunded','refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed/refunded');
  END IF;

  FOR v_item IN
    SELECT oi.id FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    v_rev := public._inventory_reverse_item(v_item.id, 'reopen', p_performed_by);
    IF (v_rev->>'reversed')::int > 0 THEN
      v_reversed := v_reversed + (v_rev->>'reversed')::int;
    END IF;
  END LOOP;

  DELETE FROM public.order_payments WHERE order_id = p_order_id;

  UPDATE public.orders SET
    status = 'new',
    paid_amount = 0,
    cash_amount = 0,
    card_amount = 0,
    tip_amount = 0,
    paid_at = NULL,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'reversed', v_reversed);
END;
$function$

