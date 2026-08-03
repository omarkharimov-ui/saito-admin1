CREATE FUNCTION public.reopen_order_atomic (
  p_order_id                 uuid,
  p_reason                   text DEFAULT 'reopen'::text,
  p_performed_by             uuid DEFAULT NULL::uuid,
  p_performed_by_terminal_id text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_order RECORD;
  v_tx RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed');
  END IF;

  FOR v_tx IN SELECT * FROM public.inventory_transactions WHERE reference_id = p_order_id AND reference_type = 'order' LOOP
    INSERT INTO public.inventory_transactions (
      order_item_id, ingredient_id, quantity, unit, transaction_type, reference_type, reference_id, performed_by
    ) VALUES (
      v_tx.order_item_id,
      v_tx.ingredient_id,
      -v_tx.quantity,
      v_tx.unit,
      'reversal',
      v_tx.reference_type,
      v_tx.reference_id,
      p_performed_by
    );
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
    v_order.table_number,
    p_order_id,
    'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) TO service_role;