-- ============================================================================
-- FIX: clear-table (dirty → empty) was silently failing because the route
-- PATCHed table_floors with updated_by_terminal_id, a column that did not exist.
-- Guest-count updates were also allowed on empty tables (no active order).
--
-- Restores SSOT: `orders` stays authoritative, `table_floors` is a snapshot.
-- ============================================================================

-- 1. table_floors was missing updated_by_terminal_id (intended by local migration
--    00032 design). Its absence broke 14 deployed RPCs (dismiss/merge/transfer/
--    kitchen ops) that write it to table_floors.
ALTER TABLE public.table_floors
  ADD COLUMN IF NOT EXISTS updated_by_terminal_id TEXT;

-- NOTE: remote `operation_logs` uses a different schema than the local migration
-- set: (operation, order_id, source_table_number, target_table_number, old_state,
-- new_state, undo_payload, ...) instead of (table_number, action, old_values,
-- new_values, ...). The new RPCs below write using the REMOTE schema.

-- 2. clear_table_atomic: reset a table snapshot (status → 'empty') WITHOUT
--    touching orders (unlike dismiss_table_atomic, which cancels them). Used
--    after payment marks the table dirty.
CREATE OR REPLACE FUNCTION public.clear_table_atomic(
  p_table_number INT,
  p_performed_by UUID DEFAULT NULL,
  p_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table RECORD;
BEGIN
  SELECT * INTO v_table FROM public.table_floors WHERE table_number = p_table_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  UPDATE public.table_floors SET
    status = 'empty',
    total_amount = 0,
    order_count = 0,
    guest_count = NULL,
    current_order_id = NULL,
    merged_into_table = NULL,
    reservation_id = NULL,
    reservation_name = NULL,
    reservation_phone = NULL,
    reservation_time = NULL,
    reservation_status_snapshot = NULL,
    reserved_at = NULL,
    reserved_until = NULL,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = NOW(),
    updated_by_terminal_id = p_terminal_id
  WHERE table_number = p_table_number;

  INSERT INTO public.operation_logs (
    operation, order_id, source_table_number, old_state, new_state, performed_by, created_at
  ) VALUES (
    'clear_table',
    NULL,
    p_table_number,
    jsonb_build_object('status', v_table.status),
    jsonb_build_object('status', 'empty'),
    p_performed_by,
    NOW()
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. update_guest_count: guard — only allowed when an active order exists on the
--    table. Updates orders (SSOT) first, then the table_floors snapshot.
--    Return type changed void → jsonb so callers can read success/error.
DROP FUNCTION IF EXISTS public.update_guest_count(integer, integer);

CREATE OR REPLACE FUNCTION public.update_guest_count(
  p_table_number INT,
  p_guest_count INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_count INT;
BEGIN
  IF p_guest_count IS NULL OR p_guest_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Guest count must be at least 1');
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.orders
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed');

  IF v_active_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active order on this table');
  END IF;

  UPDATE public.orders SET
    guest_count = p_guest_count,
    updated_at = NOW()
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled', 'closed', 'completed');

  UPDATE public.table_floors SET
    guest_count = p_guest_count,
    updated_at = NOW()
  WHERE table_number = p_table_number;

  RETURN jsonb_build_object('success', true, 'guest_count', p_guest_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
