-- Migration 5: merge/unmerge round-trip + complete_payment NOT NULL fix
--  * merge moves child order rows onto the parent table; record the original
--    table so unmerge can restore it (deployed unmerge filtered on child
--    table_number, which no longer matched after merge).
--  * complete_payment_atomic: order_payments.payment_method is NOT NULL.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merged_from_table INTEGER;

-- merge_tables_atomic: remember each child's original table number
CREATE OR REPLACE FUNCTION public.merge_tables_atomic(
  p_parent_table_number integer,
  p_child_table_numbers integer[],
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_parent RECORD;
  v_child RECORD;
  v_parent_order_id UUID;
  v_merged_group_id TEXT;
BEGIN
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT * INTO v_parent FROM public.table_floors WHERE table_number = p_parent_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent table not found');
  END IF;

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) FOR UPDATE LOOP
    NULL;
  END LOOP;

  SELECT id INTO v_parent_order_id FROM public.orders
  WHERE table_number = p_parent_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
  ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on parent table');
  END IF;

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    UPDATE public.orders SET
      merged_into = v_parent_order_id,
      merged_from_table = v_child.table_number,
      table_number = p_parent_table_number,
      updated_at = NOW(),
      version = COALESCE(version, 0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE table_number = v_child.table_number
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
      AND merged_into IS NULL;
  END LOOP;

  UPDATE public.table_floors SET
    merged_into_table = p_parent_table_number,
    status = 'empty',
    current_order_id = NULL,
    updated_at = NOW(),
    updated_by_terminal_id = p_performed_by_terminal_id
  WHERE table_number = ANY(p_child_table_numbers);

  UPDATE public.kitchen_schedule SET
    table_number = p_parent_table_number,
    updated_at = NOW()
  WHERE table_number = ANY(p_child_table_numbers);

  FOR v_child IN SELECT * FROM public.table_floors WHERE table_number = ANY(p_child_table_numbers) LOOP
    IF v_child.reservation_id IS NOT NULL THEN
      UPDATE public.reservations SET
        table_ids = array_remove(table_ids, v_child.table_number),
        updated_at = NOW()
      WHERE id = v_child.reservation_id;

      UPDATE public.reservations SET
        table_ids = array_append(
          CASE WHEN table_ids @> ARRAY[p_parent_table_number] THEN table_ids ELSE array_append(table_ids, p_parent_table_number) END,
          v_child.table_number
        ),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM public.reservations
        WHERE id != v_child.reservation_id
          AND table_ids @> ARRAY[p_parent_table_number]
        LIMIT 1
      );
    END IF;
  END LOOP;

  v_merged_group_id := 'group-' || p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number,
    v_parent_order_id,
    'merge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('merged_group_id', v_merged_group_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id, 'merged_group_id', v_merged_group_id);
END;
$function$;

-- unmerge_tables_atomic: restore children by merged_into link + merged_from_table
CREATE OR REPLACE FUNCTION public.unmerge_tables_atomic(
  p_parent_table_number integer,
  p_child_table_numbers integer[],
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_parent_order_id UUID;
  v_child_order RECORD;
  v_orig_table INTEGER;
BEGIN
  IF p_parent_table_number = ANY(p_child_table_numbers) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent cannot be in child list');
  END IF;

  SELECT id INTO v_parent_order_id FROM public.orders
    WHERE table_number = p_parent_table_number
      AND status NOT IN ('paid', 'cancelled', 'closed', 'completed')
    ORDER BY created_at ASC LIMIT 1;

  IF v_parent_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on parent table');
  END IF;

  FOR v_child_order IN
    SELECT * FROM public.orders
    WHERE merged_into = v_parent_order_id
    FOR UPDATE
  LOOP
    v_orig_table := COALESCE(v_child_order.merged_from_table, p_parent_table_number);

    UPDATE public.orders SET
      table_number = v_orig_table,
      merged_into = NULL,
      merged_from_table = NULL,
      updated_at = NOW(),
      version = COALESCE(v_child_order.version, 0) + 1,
      updated_by_terminal_id = p_performed_by_terminal_id
    WHERE id = v_child_order.id;

    UPDATE public.table_floors SET
      status = 'occupied',
      current_order_id = v_child_order.id,
      merged_into_table = NULL,
      updated_at = NOW()
    WHERE table_number = v_orig_table;
  END LOOP;

  UPDATE public.table_floors SET
    merged_into_table = NULL,
    updated_at = NOW()
  WHERE table_number = p_parent_table_number;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    p_parent_table_number, v_parent_order_id, 'unmerge_tables',
    jsonb_build_object('children', p_child_table_numbers),
    jsonb_build_object('parent_order_id', v_parent_order_id),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'parent_order_id', v_parent_order_id);
END;
$function$;

-- complete_payment_atomic: order_payments.payment_method is NOT NULL
CREATE OR REPLACE FUNCTION public.complete_payment_atomic(
  p_order_id uuid,
  p_payments jsonb,
  p_payment_method text DEFAULT 'cash',
  p_cash_amount numeric DEFAULT 0,
  p_card_amount numeric DEFAULT 0,
  p_tip_amount numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot pay cancelled order');
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.order_payments (
      order_id, payment_method, method, amount, currency, status,
      split_group_id, is_partial, is_refund, created_by
    ) VALUES (
      p_order_id,
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE(v_payment->>'method', 'cash'),
      COALESCE((v_payment->>'amount')::NUMERIC, 0),
      COALESCE(v_payment->>'currency', 'AZN'),
      COALESCE(v_payment->>'status', 'success'),
      (v_payment->>'split_group_id')::UUID,
      COALESCE((v_payment->>'is_partial')::BOOLEAN, false),
      COALESCE((v_payment->>'is_refund')::BOOLEAN, false),
      p_performed_by
    );
    v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::NUMERIC, 0);
  END LOOP;

  UPDATE public.orders SET
    paid_amount = v_total_paid,
    cash_amount = p_cash_amount,
    card_amount = p_card_amount,
    tip_amount = p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN 'paid' ELSE v_order.status END,
    paid_at = CASE WHEN v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN NOW() ELSE v_order.paid_at END,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_total_paid >= (v_order.total_amount - COALESCE(p_discount_amount, 0)) THEN
    PERFORM public.deduct_stock_for_order(p_order_id);
  END IF;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number,
    p_order_id,
    'complete_payment',
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    jsonb_build_object('status', 'paid', 'paid_amount', v_total_paid),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'paid_amount', v_total_paid);
END;
$function$;
