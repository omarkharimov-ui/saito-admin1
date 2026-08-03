CREATE FUNCTION public.unmerge_tables_v3 (
  p_primary_table_number integer,
  p_child_table_numbers  integer[],
  p_performed_by         uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  primary_order_id uuid;
  child_num integer;
  child_order record;
  child_amount numeric := 0;
  total_subtracted numeric := 0;
  result jsonb;
BEGIN
  SELECT o.id INTO primary_order_id
  FROM orders o
  WHERE o.table_number = p_primary_table_number
    AND o.status NOT IN ('paid', 'cancelled', 'closed')
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF primary_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Primary order not found');
  END IF;

  FOREACH child_num IN ARRAY p_child_table_numbers
  LOOP
    FOR child_order IN
      SELECT id, total_amount FROM orders
      WHERE merged_into = primary_order_id
        AND table_number = child_num
        AND status NOT IN ('paid', 'cancelled')
    LOOP
      child_amount := COALESCE(child_order.total_amount, 0);
      total_subtracted := total_subtracted + child_amount;
      UPDATE orders SET merged_into = NULL, updated_at = now() WHERE id = child_order.id;
    END LOOP;

    UPDATE table_floors
    SET status = 'occupied', merged_into_table = NULL
    WHERE table_number = child_num;
  END LOOP;

  UPDATE orders
  SET total_amount = GREATEST(0, COALESCE(total_amount, 0) - total_subtracted),
      updated_at = now()
  WHERE id = primary_order_id;

  result := jsonb_build_object(
    'success', true,
    'primary_table', p_primary_table_number,
    'children_unmerged', to_jsonb(p_child_table_numbers),
    'amount_subtracted', total_subtracted
  );
  RETURN result;
END;
$function$;

CREATE FUNCTION public.unmerge_tables_v3 (
  p_primary_table integer,
  p_child_tables  integer[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_child INTEGER;
  v_primary_order_id UUID;
  v_child_order_id UUID;
BEGIN
  -- Find primary order
  SELECT id INTO v_primary_order_id FROM orders 
  WHERE table_number = p_primary_table AND status NOT IN ('paid', 'cancelled', 'closed') LIMIT 1;

  FOREACH v_child IN ARRAY p_child_tables
  LOOP
    -- Mark source order as NOT merged (point back to itself if needed, or just set null)
    UPDATE orders SET merged_into = NULL WHERE table_number = v_child AND merged_into = v_primary_order_id;
    
    -- Reset floor
    UPDATE table_floors SET status = 'occupied', merged_into_table = NULL WHERE table_number = v_child;
  END LOOP;

  -- Re-calculate primary table totals in DB
  UPDATE table_floors SET 
    total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE table_number = p_primary_table AND status NOT IN ('paid', 'cancelled', 'closed')),
    guest_count = (SELECT COALESCE(SUM(guest_count), 0) FROM orders WHERE table_number = p_primary_table AND status NOT IN ('paid', 'cancelled', 'closed'))
  WHERE table_number = p_primary_table;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.unmerge_tables_v3(integer, integer[], uuid) TO anon;

GRANT ALL ON FUNCTION public.unmerge_tables_v3(integer, integer[], uuid) TO authenticated;

GRANT ALL ON FUNCTION public.unmerge_tables_v3(integer, integer[], uuid) TO service_role;

GRANT ALL ON FUNCTION public.unmerge_tables_v3(integer, integer[]) TO anon;

GRANT ALL ON FUNCTION public.unmerge_tables_v3(integer, integer[]) TO authenticated;

GRANT ALL ON FUNCTION public.unmerge_tables_v3(integer, integer[]) TO service_role;