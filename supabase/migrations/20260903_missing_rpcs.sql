-- =====================================================================
-- SAITO ADMIN 1 — MISSING SHIFT RPCs
-- Applied: 2026-08-27
-- Purpose: Atomic clock in/out operations for staff attendance tracking
-- =====================================================================

-- ---------------------------------------------------------------------
-- clock_in_atomic
-- ---------------------------------------------------------------------
-- Validates staff is active, checks no open shift exists, creates shift
-- atomically, and writes audit log.

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

  -- Check for existing open shift
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

  -- Create shift
  INSERT INTO shifts (staff_id, opened_at, notes)
  VALUES (p_staff_id, now(), p_notes)
  RETURNING * INTO v_result;

  -- Audit
  PERFORM log_audit('clock_in', 'staff', p_staff_id::text, p_performed_by,
    NULL, jsonb_build_object('shift_id', v_result->>'id'), NULL, NULL, NULL);

  RETURN jsonb_build_object(
    'success', true, 'shift_id', v_result->>'id',
    'staff_id', p_staff_id, 'opened_at', now()
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in_atomic(uuid, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- clock_out_atomic
-- ---------------------------------------------------------------------
-- Validates staff is active, finds open shift, closes it atomically,
-- and writes audit log.

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

  -- Find open shift
  SELECT * INTO v_open_shift
    FROM shifts
   WHERE staff_id = p_staff_id
     AND closed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_OPEN_SHIFT');
  END IF;

  -- Close shift
  UPDATE shifts
  SET closed_at = now(),
      notes = COALESCE(notes, '') || COALESCE(' | ' || p_notes, ''),
      updated_at = now()
  WHERE id = v_open_shift.id
  RETURNING * INTO v_result;

  -- Audit
  PERFORM log_audit('clock_out', 'staff', p_staff_id::text, p_performed_by,
    jsonb_build_object('shift_id', v_open_shift.id, 'opened_at', v_open_shift.opened_at),
    jsonb_build_object('shift_id', v_open_shift.id, 'closed_at', now()), NULL, NULL, NULL);

  RETURN jsonb_build_object(
    'success', true, 'shift_id', v_result->>'id',
    'staff_id', p_staff_id, 'closed_at', now()
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_out_atomic(uuid, text, uuid) TO authenticated, service_role;
