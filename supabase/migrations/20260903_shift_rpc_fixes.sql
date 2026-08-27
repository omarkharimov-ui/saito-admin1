-- =====================================================================
-- SAITO ADMIN 1 — SHIFT ATOMIC RPC FIXES
-- Purpose: Atomic clock in/out with proper locking and audit.
--          Runs AFTER schema_reconciliation (shifts.updated_at exists).
-- =====================================================================

-- ---------------------------------------------------------------------
-- clock_in_atomic
-- ---------------------------------------------------------------------
-- Validates:
--   - staff exists and is active
--   - no open shift for staff
-- Creates:
--   - new shift with opened_at = now()
-- Writes:
--   - audit log via log_audit()
-- Returns:
--   - success, shift_id, opened_at or error code

CREATE OR REPLACE FUNCTION public.clock_in_atomic(
  p_staff_id uuid,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff staff%ROWTYPE;
  v_open_shift shifts%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Lock and validate staff
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  IF NOT v_staff.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
  END IF;

  -- Check for existing open shift (prevents duplicate clock-in)
  SELECT * INTO v_open_shift
    FROM shifts
   WHERE staff_id = p_staff_id
     AND closed_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'ALREADY_CLOCKED_IN',
      'shift_id', v_open_shift.id,
      'opened_at', v_open_shift.opened_at
    );
  END IF;

  -- Create shift atomically
  INSERT INTO shifts (staff_id, opened_at, notes)
  VALUES (p_staff_id, now(), p_notes)
  RETURNING * INTO v_result;

  -- Audit
  PERFORM log_audit(
    'clock_in', 'staff', p_staff_id::text, p_performed_by,
    NULL,
    jsonb_build_object('shift_id', v_result->>'id'),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', v_result->>'id',
    'staff_id', p_staff_id,
    'opened_at', now()
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in_atomic(uuid, text, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- clock_out_atomic
-- ---------------------------------------------------------------------
-- Validates:
--   - staff exists and is active
--   - exactly one open shift exists
-- Closes:
--   - shift with closed_at = now()
--   - appends notes
-- Writes:
--   - audit log via log_audit()
-- Returns:
--   - success, shift_id, closed_at or error code

CREATE OR REPLACE FUNCTION public.clock_out_atomic(
  p_staff_id uuid,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff staff%ROWTYPE;
  v_open_shift shifts%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Lock and validate staff
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  IF NOT v_staff.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
  END IF;

  -- Find open shift (prevents duplicate clock-out)
  SELECT * INTO v_open_shift
    FROM shifts
   WHERE staff_id = p_staff_id
     AND closed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_OPEN_SHIFT');
  END IF;

  -- Close shift atomically
  UPDATE shifts
     SET closed_at = now(),
         notes = CASE
                   WHEN notes IS NULL OR notes = '' THEN p_notes
                   ELSE notes || ' | ' || p_notes
                 END,
         updated_at = now()
   WHERE id = v_open_shift.id
  RETURNING * INTO v_result;

  -- Audit
  PERFORM log_audit(
    'clock_out', 'staff', p_staff_id::text, p_performed_by,
    jsonb_build_object('shift_id', v_open_shift.id, 'opened_at', v_open_shift.opened_at),
    jsonb_build_object('shift_id', v_open_shift.id, 'closed_at', now()),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', v_result->>'id',
    'staff_id', p_staff_id,
    'closed_at', now()
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_out_atomic(uuid, text, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_clock_in_exists boolean;
  v_clock_out_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'clock_in_atomic'
  ) INTO v_clock_in_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'clock_out_atomic'
  ) INTO v_clock_out_exists;

  RAISE NOTICE 'Shift RPCs: clock_in_atomic=%, clock_out_atomic=%',
    v_clock_in_exists, v_clock_out_exists;
END $$;
