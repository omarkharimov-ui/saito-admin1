-- W-A2 (2026-09-19): add-to-check credential + atomic add RPC.
-- Decisions: W_A2_PLAN.md D12 (check_token, hash-stored), D13 (server-sourced
-- price for QR items), D14 (RPC, FOR UPDATE, sibling of add_item_atomic),
-- D16 (total = incremental mirror of frozen add_item_atomic — see D16 note
-- in W_A2_PLAN.md; the first draft used calculate_order_total_v3(id,true,false)
-- which re-applied VAT to the whole subtotal and diverged from the create
-- route's default raw-total semantics; fixed before any use).
-- Additive only: new column + partial index + new function. No existing object
-- is altered; idx_orders_active_table and the state machine are untouched.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_check_token_hash text;

CREATE INDEX IF NOT EXISTS idx_orders_qr_check_token
  ON orders(qr_check_token_hash)
  WHERE qr_check_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.qr_add_items(
  p_token_hash text,
  p_table_number int,
  p_items jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_prod RECORD;
  v_item jsonb;
  v_i int;
  v_qty int;
  v_unit numeric;
  v_itot numeric;
  v_prev_id uuid;
  v_item_id uuid;
  v_added int := 0;
  v_added_total numeric := 0;
  v_new_total numeric;
BEGIN
  IF p_token_hash IS NULL OR p_table_number IS NULL
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'QR_ADD_BAD_ARGS' USING ERRCODE = 'P0001';
  END IF;

  -- D12 auth + serialization: the token binds to exactly one order row; FOR
  -- UPDATE serializes add-vs-pay races on that row (add_item_atomic pattern).
  SELECT * INTO v_order FROM orders
   WHERE qr_check_token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR_CHECK_TOKEN_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.table_number IS DISTINCT FROM p_table_number THEN
    RAISE EXCEPTION 'QR_CHECK_TOKEN_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IN ('paid','closed','cancelled','refunded','partially_refunded','voided') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  FOR v_i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
    v_item := p_items -> v_i;
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty <= 0 OR v_qty > 99 THEN
      RAISE EXCEPTION 'INVALID_QTY' USING ERRCODE = 'P0001';
    END IF;

    -- D13: server-sourced price — the client's unit_price is IGNORED entirely
    -- (same contract as add_item_atomic; fixes the G3 underpay gap).
    -- Route pre-validates product_id shape (uuid); a bad cast cannot reach here.
    SELECT id, name, price INTO v_prod
      FROM products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND: %', v_item->>'product_id' USING ERRCODE = 'P0001';
    END IF;
    v_unit := v_prod.price;
    v_itot := v_unit * v_qty;

    -- Per-item idempotency dedupe (add_item_atomic pattern).
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_prev_id FROM order_items
       WHERE idempotency_key = p_idempotency_key || ':' || v_i;
      IF v_prev_id IS NOT NULL THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO order_items
      (order_id, product_id, product_name, quantity, unit_price, total_price,
       kitchen_status, idempotency_key)
    VALUES
      (v_order.id, v_prod.id, v_prod.name, v_qty, v_unit, v_itot,
       'pending',
       CASE WHEN p_idempotency_key IS NULL THEN NULL
            ELSE p_idempotency_key || ':' || v_i END)
    RETURNING id INTO v_item_id;

    -- Same event as the frozen staff add path (add_item_atomic); performed_by
    -- NULL = guest channel.
    PERFORM log_order_event(v_order.id, 'item_added', NULL,
      jsonb_build_object('order_item_id', v_item_id, 'product_name', v_prod.name,
        'quantity', v_qty, 'unit_price', v_unit, 'total_price', v_itot),
      jsonb_build_object('idempotency_key', p_idempotency_key, 'channel', 'qr'),
      NULL, NULL, NULL, NULL);

    v_added := v_added + 1;
    v_added_total := v_added_total + v_itot;
  END LOOP;

  -- D16: incremental total — EXACT mirror of the frozen add_item_atomic
  -- contract (`total_amount += item totals, version+1`). No SSOT recompute:
  -- that would re-apply VAT to the whole subtotal and diverge from the QR
  -- create route's default (raw total; applyVat is a create-time opt-in).
  -- Idempotent full replay adds nothing (v_added_total = 0 -> no UPDATE).
  IF v_added_total > 0 THEN
    UPDATE orders SET
      total_amount = COALESCE(total_amount, 0) + v_added_total,
      version = COALESCE(version, 0) + 1,
      updated_at = now()
    WHERE id = v_order.id;
  END IF;

  SELECT total_amount INTO v_new_total FROM orders WHERE id = v_order.id;

  RETURN jsonb_build_object('success', true,
                            'order_id', v_order.id,
                            'status', v_order.status,
                            'items_added', v_added,
                            'total', v_new_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.qr_add_items(text, int, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.qr_add_items(text, int, jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_add_items(text, int, jsonb, text) TO service_role;
