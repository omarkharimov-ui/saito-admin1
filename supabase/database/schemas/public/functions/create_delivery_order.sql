CREATE OR REPLACE FUNCTION public.create_delivery_order (
  p_customer_phone          text                     DEFAULT NULL::text,
  p_customer_name           text                     DEFAULT NULL::text,
  p_customer_note           text                     DEFAULT NULL::text,
  p_delivery_address        text                     DEFAULT NULL::text,
  p_delivery_district       text                     DEFAULT NULL::text,
  p_delivery_street         text                     DEFAULT NULL::text,
  p_delivery_building       text                     DEFAULT NULL::text,
  p_delivery_floor          text                     DEFAULT NULL::text,
  p_delivery_apartment      text                     DEFAULT NULL::text,
  p_delivery_intercom       text                     DEFAULT NULL::text,
  p_delivery_zone           text                     DEFAULT NULL::text,
  p_delivery_fee            numeric                  DEFAULT 0,
  p_estimated_delivery_time timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_items                   jsonb                    DEFAULT '[]'::jsonb,
  p_performed_by            uuid                     DEFAULT NULL::uuid
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
  v_total NUMERIC := 0;
BEGIN
  IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'customer_phone is required';
  END IF;

  IF p_delivery_address IS NULL OR trim(p_delivery_address) = '' THEN
    RAISE EXCEPTION 'delivery_address is required';
  END IF;

  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'delivery_fee must be a numeric value >= 0';
  END IF;

  v_order_number := generate_delivery_order_number();

  INSERT INTO orders (
    order_number, order_type, order_source, status, delivery_status,
    customer_phone, customer_name, customer_note,
    delivery_address, delivery_district, delivery_street, delivery_building,
    delivery_floor, delivery_apartment, delivery_intercom, delivery_zone,
    delivery_fee, estimated_delivery_time,
    total_amount, guest_count, is_draft, version, created_at
  ) VALUES (
    v_order_number, 'delivery', 'delivery', 'new', 'pending',
    p_customer_phone, p_customer_name, p_customer_note,
    p_delivery_address, p_delivery_district, p_delivery_street, p_delivery_building,
    p_delivery_floor, p_delivery_apartment, p_delivery_intercom, p_delivery_zone,
    COALESCE(p_delivery_fee, 0), p_estimated_delivery_time,
    0, 1, false, 1, now()
  )
  RETURNING id INTO v_order_id;

  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO order_items (
        order_id, product_id, product_name, quantity, unit_price, total_price,
        modifiers, special_notes, kitchen_status
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::UUID,
        v_item->>'product_name',
        COALESCE((v_item->>'quantity')::INTEGER, 1),
        (v_item->>'unit_price')::NUMERIC,
        (v_item->>'unit_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1),
        COALESCE(v_item->'modifiers', '[]'::JSONB),
        v_item->>'special_notes',
        'pending'
      );

      v_total := v_total + (v_item->>'unit_price')::NUMERIC * COALESCE((v_item->>'quantity')::INTEGER, 1);
    END LOOP;

    UPDATE orders SET total_amount = v_total WHERE id = v_order_id;
  END IF;

  PERFORM log_order_event(
    v_order_id, 'created',
    NULL,
    jsonb_build_object('order_number', v_order_number, 'source', 'delivery'),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$function$;

GRANT ALL ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, numeric, timestamp WITH time zone, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, text, numeric, timestamp WITH time zone, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, text, numeric, timestamp WITH time zone, jsonb, uuid) FROM authenticated;
