-- ─────────────────────────────────────────────────────────────────────
-- Migration 20260908000006
-- D-2 + D-5: Split + Takeaway/Delivery location/organization propagation
-- ─────────────────────────────────────────────────────────────────────
-- Root cause (both): these RPCs INSERT into orders WITHOUT location_id /
--   organization_id, but both columns are NOT NULL and the BEFORE triggers
--   (trg_order_table_location / guard set) reject a table-bound order whose
--   location/org differs from (NULL ≠) the floor's location/org.
--
-- Fix (minimal, DB-enforced, NO frozen contract / RLS / state-machine change):
--   • D-2: split_order_atomic + split_by_seat now INHERIT location_id /
--          organization_id from the parent order (always present on a
--          live dine-in order). No policy decision — pure propagation.
--   • D-5: create_takeaway_order + create_delivery_order gain optional
--          p_location_id / p_organization_id; a new helper
--          resolve_staff_location() implements the approved resolution policy:
--            1) session active_location_id (authoritative, if present)
--            2) staff's PRIMARY active staff_locations row
--            3) the staff's ONLY active location (if exactly 1 distinct)
--            4) otherwise NULL  → caller returns 400 NO_LOCATION_CONTEXT
--          The RPC asserts non-NULL (DB enforcement, defense in depth).
--          The route resolves server-side (it owns the auth token) and passes
--          the values in — NO client/UI change, NO location defaulting.
--
-- Backward compatibility:
--   • Split functions: same parameter list (body-only change) -> safe
--     CREATE OR REPLACE.
--   • Create functions: two NEW trailing params -> signature CHANGES, so a
--     plain CREATE OR REPLACE would leave the OLD broken overload live. The
--     old overloads are DROPPED first (the live routes are updated in the
--     same pass to call the new signature; the old body could never succeed
--     — NOT NULL location_id made it a guaranteed 500).
-- ─────────────────────────────────────────────────────────────────────

-- Drop the old broken overloads (create only — split signatures unchanged)
DROP FUNCTION IF EXISTS public.create_takeaway_order(
  text, text, text, timestamptz, jsonb, uuid
);
DROP FUNCTION IF EXISTS public.create_delivery_order(
  text, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz, jsonb, uuid
);
-- Idempotency: drop any prior version of the helper (row-type rename safety)
DROP FUNCTION IF EXISTS public.resolve_staff_location(uuid, uuid, uuid);

-- ════════════════════════════════════════════════════════════════════
-- 1. Location-resolution helper (pure, testable, SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_staff_location(
  p_staff uuid,
  p_session_location uuid DEFAULT NULL::uuid,
  p_session_org uuid DEFAULT NULL::uuid
) RETURNS TABLE(resolved_location_id uuid, resolved_organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_loc uuid;
  v_org uuid;
  v_distinct int;
BEGIN
  -- 1) Session active location is authoritative (set via /api/locations/switch)
  IF p_session_location IS NOT NULL THEN
    RETURN QUERY SELECT p_session_location, p_session_org;
    RETURN;
  END IF;

  IF p_staff IS NULL THEN
    RETURN;  -- no staff context -> NULL (caller -> 400)
  END IF;

  -- 2) Staff's PRIMARY active location
  SELECT sl.location_id, sl.organization_id INTO v_loc, v_org
  FROM staff_locations sl
  WHERE sl.staff_id = p_staff AND sl.active AND sl.is_primary
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_loc, v_org;
    RETURN;
  END IF;

  -- 3) Exactly ONE distinct active location -> use it
  SELECT count(DISTINCT sl.location_id) INTO v_distinct
  FROM staff_locations sl
  WHERE sl.staff_id = p_staff AND sl.active;
  IF v_distinct = 1 THEN
    SELECT sl.location_id, sl.organization_id INTO v_loc, v_org
    FROM staff_locations sl
    WHERE sl.staff_id = p_staff AND sl.active
    LIMIT 1;
    IF v_loc IS NOT NULL THEN
      RETURN QUERY SELECT v_loc, v_org;
      RETURN;
    END IF;
  END IF;

  -- 4) Ambiguous (multiple active, no primary) or none -> NULL (caller -> 400)
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.resolve_staff_location(uuid, uuid, uuid) IS
  'D-5 location resolution: session active -> staff primary -> single active -> NULL (NO_LOCATION_CONTEXT). Never defaults or picks arbitrarily. Returns (resolved_location_id, resolved_organization_id).';

-- ════════════════════════════════════════════════════════════════════
-- 2. D-2: split_order_atomic — inherit parent location/organization
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.split_order_atomic(
  p_original_order_id uuid,
  p_split_items jsonb,
  p_split_total numeric,
  p_new_guest_count integer DEFAULT 1,
  p_performed_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original RECORD;
  v_new_order_id UUID;
  v_item RECORD;
BEGIN
  -- Lock original order
  SELECT * INTO v_original FROM orders WHERE id = p_original_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_original.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  -- Create new split order (INHERITS parent location/org — D-2 fix)
  INSERT INTO orders (
    table_number, total_amount, guest_count, status, kitchen_status,
    merged_into, is_split, version, created_at,
    location_id, organization_id
  ) VALUES (
    v_original.table_number, p_split_total, p_new_guest_count,
    'confirmed', 'pending',
    p_original_order_id, true, 1, now(),
    v_original.location_id, v_original.organization_id
  )
  RETURNING id INTO v_new_order_id;

  -- Move items from original to split order
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_split_items) AS x(
    id UUID, product_id UUID, product_name TEXT, quantity INTEGER,
    unit_price NUMERIC, total_price NUMERIC, modifiers TEXT,
    special_notes TEXT, combo_group_id UUID, variant_id UUID
  )
  LOOP
    -- Insert into new order
    -- NOTE: v_item.modifiers is TEXT (from jsonb_to_recordset); the column is
    -- jsonb. The live route stringifies modifiers (JSON.stringify), so cast it
    -- safely (empty/NULL -> '[]') — fixes a pre-existing type mismatch that
    -- surfaced when modifiers was a non-empty string.
    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price,
      total_price, modifiers, special_notes, combo_group_id, variant_id,
      kitchen_status
    ) VALUES (
      v_new_order_id, v_item.product_id, v_item.product_name,
      v_item.quantity, v_item.unit_price, v_item.total_price,
      COALESCE(NULLIF(trim(COALESCE(v_item.modifiers, '')), ''), '[]')::jsonb,
      v_item.special_notes, v_item.combo_group_id,
      v_item.variant_id, 'ready'
    );

    -- Reduce or delete from original order
    UPDATE order_items
    SET quantity = quantity - v_item.quantity,
        total_price = GREATEST(0, total_price - v_item.total_price)
    WHERE id = v_item.id AND quantity > v_item.quantity;

    DELETE FROM order_items
    WHERE id = v_item.id AND quantity <= v_item.quantity;
  END LOOP;

  -- Update original order total
  UPDATE orders
  SET total_amount = GREATEST(0, COALESCE(v_original.total_amount, 0) - p_split_total),
      version = COALESCE(v_original.version, 0) + 1
  WHERE id = p_original_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'original_order_id', p_original_order_id,
    'new_order_id', v_new_order_id,
    'new_total', GREATEST(0, COALESCE(v_original.total_amount, 0) - p_split_total)
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 3. D-2: split_by_seat — inherit parent location/organization
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.split_by_seat(
  p_order_id uuid,
  p_seat_number integer,
  p_performed_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original RECORD;
  v_new_order_id UUID;
  v_new_total NUMERIC := 0;
  v_item_count INTEGER := 0;
BEGIN
  SELECT * INTO v_original FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_original.status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  -- Create new order for the split (INHERITS parent location/org — D-2 fix)
  INSERT INTO orders (
    table_number, order_source, status, guest_count,
    total_amount, is_split, merged_into, version, created_at,
    location_id, organization_id
  ) VALUES (
    v_original.table_number, v_original.order_source, 'confirmed', 1,
    0, true, p_order_id, 1, now(),
    v_original.location_id, v_original.organization_id
  )
  RETURNING id INTO v_new_order_id;

  -- Move seat items to new order
  INSERT INTO order_items (
    order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, special_notes, combo_group_id, variant_id,
    kitchen_status, seat_number, course, price_snapshot
  )
  SELECT
    v_new_order_id, product_id, product_name, quantity, unit_price, total_price,
    modifiers, special_notes, combo_group_id, variant_id,
    kitchen_status, seat_number, course, price_snapshot
  FROM order_items
  WHERE order_id = p_order_id
    AND seat_number = p_seat_number
    AND kitchen_status NOT IN ('cancelled');

  GET DIAGNOSTICS v_item_count = ROW_COUNT;

  -- Calculate new total
  SELECT COALESCE(SUM(total_price), 0) INTO v_new_total
  FROM order_items WHERE order_id = v_new_order_id;

  UPDATE orders SET total_amount = v_new_total WHERE id = v_new_order_id;

  -- Update original order total
  UPDATE orders SET
    total_amount = GREATEST(0, COALESCE(total_amount, 0) - v_new_total),
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Log events
  PERFORM log_order_event(
    p_order_id, 'bill_split',
    jsonb_build_object('total_amount', v_original.total_amount),
    jsonb_build_object('split_to', v_new_order_id, 'seat', p_seat_number, 'amount', v_new_total),
    NULL, p_performed_by, NULL, NULL, NULL
  );

  PERFORM log_operation(
    'split_bill', p_order_id,
    v_original.table_number, NULL,
    jsonb_build_object('total_amount', v_original.total_amount, 'seat', p_seat_number),
    jsonb_build_object('new_order_id', v_new_order_id, 'new_total', v_new_total),
    jsonb_build_object('undo_action', 'merge', 'order_id', v_new_order_id),
    p_performed_by, NULL, NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_order_id', v_new_order_id,
    'seat_number', p_seat_number,
    'items_moved', v_item_count,
    'new_total', v_new_total,
    'remaining_total', GREATEST(0, COALESCE(v_original.total_amount, 0) - v_new_total)
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 4. D-5: create_takeaway_order — accept + assert location/org
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_takeaway_order(
  p_customer_phone text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_note text DEFAULT NULL::text,
  p_estimated_pickup_time timestamp with time zone DEFAULT NULL::timestamp,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_organization_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- D-5: location/org are mandatory (NOT NULL columns). The route resolves
  -- them server-side; reject a direct/NULL call explicitly (no defaulting).
  IF p_location_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'NO_LOCATION_CONTEXT' USING ERRCODE = 'P0001';
  END IF;

  v_order_number := generate_takeaway_order_number();

  INSERT INTO orders (
    order_number, order_type, order_source, status, kitchen_status,
    customer_phone, customer_name, customer_note,
    estimated_delivery_time, total_amount, guest_count,
    is_draft, version, created_at,
    location_id, organization_id
  ) VALUES (
    v_order_number, 'takeaway', 'takeaway', 'confirmed', 'pending',
    p_customer_phone, p_customer_name, p_customer_note,
    p_estimated_pickup_time, 0, 1,
    false, 1, now(),
    p_location_id, p_organization_id
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
$$;

-- ════════════════════════════════════════════════════════════════════
-- 5. D-5: create_delivery_order — accept + assert location/org
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_customer_phone text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_note text DEFAULT NULL::text,
  p_delivery_address text DEFAULT NULL::text,
  p_delivery_district text DEFAULT NULL::text,
  p_delivery_street text DEFAULT NULL::text,
  p_delivery_building text DEFAULT NULL::text,
  p_delivery_floor text DEFAULT NULL::text,
  p_delivery_apartment text DEFAULT NULL::text,
  p_delivery_intercom text DEFAULT NULL::text,
  p_delivery_zone text DEFAULT NULL::text,
  p_delivery_fee numeric DEFAULT 0,
  p_estimated_delivery_time timestamp with time zone DEFAULT NULL::timestamp,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_performed_by uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_organization_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  IF p_delivery_address IS NULL OR trim(p_delivery_address) = '' THEN
    RAISE EXCEPTION 'delivery_address is required';
  END IF;

  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'delivery_fee must be a valid number >= 0';
  END IF;

  -- D-5: location/org are mandatory (NOT NULL columns). Route resolves them;
  -- reject a direct/NULL call explicitly (no defaulting).
  IF p_location_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'NO_LOCATION_CONTEXT' USING ERRCODE = 'P0001';
  END IF;

  v_order_number := generate_delivery_order_number();

  INSERT INTO orders (
    order_number, order_type, order_source, status, delivery_status,
    customer_phone, customer_name, customer_note,
    delivery_address, delivery_district, delivery_street, delivery_building,
    delivery_floor, delivery_apartment, delivery_intercom, delivery_zone,
    delivery_fee, estimated_delivery_time,
    total_amount, guest_count, is_draft, version, created_at,
    location_id, organization_id
  ) VALUES (
    v_order_number, 'delivery', 'delivery', 'new', 'pending',
    p_customer_phone, p_customer_name, p_customer_note,
    p_delivery_address, p_delivery_district, p_delivery_street, p_delivery_building,
    p_delivery_floor, p_delivery_apartment, p_delivery_intercom, p_delivery_zone,
    COALESCE(p_delivery_fee, 0), p_estimated_delivery_time,
    0, 1, false, 1, now(),
    p_location_id, p_organization_id
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
        modifiers, special_notes, kitchen_status
      ) VALUES (
        v_order_id,
        v_product_id,
        v_item->>'product_name',
        v_quantity,
        v_unit_price,
        v_unit_price * v_quantity,
        COALESCE(v_item->'modifiers', '[]'::JSONB),
        v_item->>'special_notes',
        'pending'
      );

      v_total := v_total + (v_unit_price * v_quantity);
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
$$;
