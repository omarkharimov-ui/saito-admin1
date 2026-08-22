-- Fix create_takeaway_order RPC: set order_type, validate input, restrict grants

CREATE OR REPLACE FUNCTION public.create_takeaway_order (
  p_customer_phone        text                     DEFAULT NULL::text,
  p_customer_name         text                     DEFAULT NULL::text,
  p_customer_note         text                     DEFAULT NULL::text,
  p_estimated_pickup_time timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_items                 jsonb                    DEFAULT '[]'::jsonb,
  p_performed_by          uuid                     DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_total NUMERIC := 0;
BEGIN
  IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'customer_phone is required';
  END IF;

  v_order_number := generate_takeaway_order_number();

  INSERT INTO orders (
    order_number, order_type, order_source, status, kitchen_status,
    customer_phone, customer_name, customer_note,
    estimated_delivery_time, total_amount, guest_count,
    is_draft, version, created_at
  ) VALUES (
    v_order_number, 'takeaway', 'takeaway', 'confirmed', 'pending',
    p_customer_phone, p_customer_name, p_customer_note,
    p_estimated_pickup_time, 0, 1,
    false, 1, now()
  )
  RETURNING id INTO v_order_id;

  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      IF (v_item->>'product_id') IS NULL OR trim(v_item->>'product_id') = '' THEN
        RAISE EXCEPTION 'product_id is required';
      END IF;
      BEGIN
        v_product_id := (v_item->>'product_id')::UUID;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'invalid product_id format';
      END;

      IF (v_item->>'product_name') IS NULL OR trim(v_item->>'product_name') = '' THEN
        RAISE EXCEPTION 'product_name is required';
      END IF;

      v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
      IF v_quantity <= 0 THEN
        RAISE EXCEPTION 'quantity must be greater than 0';
      END IF;

      IF (v_item->>'unit_price') IS NULL THEN
        RAISE EXCEPTION 'unit_price is required';
      END IF;
      v_unit_price := (v_item->>'unit_price')::NUMERIC;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'unit_price must be a valid number >= 0';
      END IF;

      INSERT INTO order_items (
        order_id, product_id, product_name, quantity, unit_price, total_price,
        modifiers, special_notes, kitchen_status, seat_number
      ) VALUES (
        v_order_id,
        v_product_id,
        v_item->>'product_name',
        v_quantity,
        v_unit_price,
        v_unit_price * v_quantity,
        COALESCE(v_item->'modifiers', '[]'::JSONB),
        v_item->>'special_notes',
        'pending',
        NULL
      );

      v_total := v_total + (v_unit_price * v_quantity);
    END LOOP;

    UPDATE orders SET total_amount = v_total WHERE id = v_order_id;
  END IF;

  PERFORM log_order_event(
    v_order_id, 'created',
    NULL,
    jsonb_build_object('order_number', v_order_number, 'source', 'takeaway'),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$function$;

GRANT ALL ON FUNCTION public.create_takeaway_order(text, text, text, timestamp WITH time zone, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_takeaway_order(text, text, text, timestamp WITH time zone, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_takeaway_order(text, text, text, timestamp WITH time zone, jsonb, uuid) FROM authenticated;
