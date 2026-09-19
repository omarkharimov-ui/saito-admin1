-- W-A2 D18 (user decision 2026-09-19 UI session): 6-digit check code =
-- customer re-attach credential. Hash-stored (same model as D12 check_token);
-- raw code returned ONCE in the create response, never re-served. Relink
-- rotates: the presented code is consumed, a fresh token+code pair is the
-- only live credential.
-- Additive only: new column + partial index + new function.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_check_code_hash text;

CREATE INDEX IF NOT EXISTS idx_orders_qr_check_code
  ON orders(qr_check_code_hash)
  WHERE qr_check_code_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.qr_relink_check(
  p_code_hash text,
  p_table_number int,
  p_new_token_hash text,
  p_new_code_hash text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_total numeric;
BEGIN
  IF p_code_hash IS NULL OR p_table_number IS NULL
     OR p_new_token_hash IS NULL OR p_new_code_hash IS NULL THEN
    RAISE EXCEPTION 'QR_RELINK_BAD_ARGS' USING ERRCODE = 'P0001';
  END IF;

  -- D18: the code binds to exactly one order row; FOR UPDATE serializes
  -- relink-vs-add-vs-pay on that row (same pattern as qr_add_items).
  SELECT * INTO v_order FROM orders
   WHERE qr_check_code_hash = p_code_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR_CHECK_CODE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.table_number IS DISTINCT FROM p_table_number THEN
    RAISE EXCEPTION 'QR_CHECK_CODE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IN ('paid','closed','cancelled','refunded','partially_refunded','voided') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  -- Rotation: consume the presented credential, install the fresh pair.
  UPDATE orders SET
    qr_check_token_hash = p_new_token_hash,
    qr_check_code_hash  = p_new_code_hash,
    updated_at          = now()
  WHERE id = v_order.id;

  SELECT total_amount INTO v_total FROM orders WHERE id = v_order.id;

  RETURN jsonb_build_object('success', true,
                            'order_id', v_order.id,
                            'status', v_order.status,
                            'total', v_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.qr_relink_check(text, int, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.qr_relink_check(text, int, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_relink_check(text, int, text, text) TO service_role;
