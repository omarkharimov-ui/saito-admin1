-- Fix upsert_reservation_preorders full-sync mode.
-- Old behavior: when p_replace_all = true and the payload contained NO
-- referenced ids (v_keep_ids IS NULL), the DELETE was skipped entirely, so
-- stale duplicate rows for the reservation survived forever.
-- New behavior: a full sync always removes rows that are not referenced by
-- the payload. Rows freshly inserted by this run are tracked (v_new_ids) and
-- never deleted.

CREATE OR REPLACE FUNCTION public.upsert_reservation_preorders(p_reservation_id uuid, p_items jsonb, p_replace_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_existing uuid;
  v_keep_ids uuid[];
  v_new_ids uuid[];
  v_new_insert_id uuid;
  v_result jsonb;
BEGIN
  IF p_reservation_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE = 'P0001';
  END IF;

  -- Collect referenced row ids (only ones owned by this reservation)
  SELECT array_agg(id)
  INTO v_keep_ids
  FROM (
    SELECT (e->>'id')::uuid AS id
    FROM jsonb_array_elements(p_items) e
    WHERE e->>'id' IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.reservation_preorder_items r WHERE r.id = (e->>'id')::uuid AND r.reservation_id = p_reservation_id)
  ) t;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_existing := NULLIF(v_item->>'id', '')::uuid;

    IF v_existing IS NOT NULL AND EXISTS (SELECT 1 FROM public.reservation_preorder_items WHERE id = v_existing AND reservation_id = p_reservation_id) THEN
      -- Update existing row
      UPDATE public.reservation_preorder_items SET
        product_id = NULLIF(v_item->>'product_id', '')::uuid,
        product_name = COALESCE(v_item->>'product_name', product_name),
        quantity = GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1)),
        unit_price = COALESCE((v_item->>'unit_price')::numeric, unit_price),
        modifiers = COALESCE(v_item->'modifiers', modifiers),
        special_notes = COALESCE(v_item->>'special_notes', special_notes),
        course = COALESCE(v_item->>'course', course)
      WHERE id = v_existing;
    ELSIF v_existing IS NULL THEN
      -- Insert new row (track id so full-sync never deletes fresh rows)
      INSERT INTO public.reservation_preorder_items
        (reservation_id, product_id, product_name, quantity, unit_price, modifiers, special_notes, course)
      VALUES (
        p_reservation_id,
        NULLIF(v_item->>'product_id', '')::uuid,
        COALESCE(v_item->>'product_name', 'Məhsul'),
        GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1)),
        COALESCE((v_item->>'unit_price')::numeric, 0),
        COALESCE(v_item->'modifiers', '[]'::jsonb),
        COALESCE(v_item->>'special_notes', ''),
        COALESCE(v_item->>'course', 'main')
      )
      RETURNING id INTO v_new_insert_id;
      v_new_ids := array_append(v_new_ids, v_new_insert_id);
    END IF;
  END LOOP;

  -- Full-sync mode: remove rows for this reservation not referenced by the
  -- payload. With no referenced ids, remove all pre-existing rows but never
  -- the rows just inserted by this call.
  IF p_replace_all THEN
    DELETE FROM public.reservation_preorder_items
    WHERE reservation_id = p_reservation_id
      AND (v_keep_ids IS NULL OR id <> ALL (v_keep_ids))
      AND (v_new_ids IS NULL OR id <> ALL (v_new_ids));
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT * FROM public.reservation_preorder_items
    WHERE reservation_id = p_reservation_id
    ORDER BY created_at
  ) r;

  RETURN v_result;
END;
$function$;
