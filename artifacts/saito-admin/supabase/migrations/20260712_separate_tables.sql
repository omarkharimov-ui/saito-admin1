-- ============================================================
-- Separate tables (unmerge) — works even with no active orders
-- ============================================================
CREATE OR REPLACE FUNCTION separate_tables_v1(
  p_primary_table INTEGER,
  p_child_tables INTEGER[],
  p_performed_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_child INTEGER;
  v_primary_has_order BOOLEAN := FALSE;
  v_reset_primary BOOLEAN := FALSE;
BEGIN
  IF p_child_tables IS NULL OR array_length(p_child_tables, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'no children');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM orders WHERE table_number = p_primary_table AND status NOT IN ('paid', 'cancelled', 'closed')
  ) INTO v_primary_has_order;

  IF NOT v_primary_has_order THEN
    v_reset_primary := TRUE;
  END IF;

  FOR v_child IN SELECT unnest(p_child_tables) LOOP
    UPDATE table_floors SET
      status = 'empty',
      guest_count = NULL,
      total_amount = 0,
      merged_into_table = NULL,
      updated_at = now()
    WHERE table_number = v_child;
  END LOOP;

  IF v_reset_primary THEN
    UPDATE table_floors SET
      status = 'empty',
      guest_count = NULL,
      total_amount = 0,
      merged_into_table = NULL,
      updated_at = now()
    WHERE table_number = p_primary_table;
  ELSE
    UPDATE table_floors SET
      merged_into_table = NULL,
      updated_at = now()
    WHERE table_number = p_primary_table;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'primary_reset', v_reset_primary,
    'primary_has_order', v_primary_has_order
  );
END;
$$;
