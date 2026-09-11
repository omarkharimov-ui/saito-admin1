-- ============================================================================
-- 20260911000009 — S-01: clock-in NOT NULL crash fix (E/S FOUNDATION frozen)
--
-- ROOT CAUSE (live proof, ES_FOUNDATION_CURRENT_STATE §S-01):
--   shifts.location_id + shifts.organization_id are NOT NULL, but both
--   clock_in and clock_in_atomic INSERT without them and no trigger fills
--   them (enforce_shift_staff_org only VALIDATES org match) →
--   "null value in column location_id" on EVERY clock-in. No one could
--   clock in since the constraint was added.
--
-- FIX (frozen contract, gate decision #4 scope):
--   Resolve location_id + organization_id from the staff member's PRIMARY
--   ACTIVE staff_locations assignment (same pattern as login_commit) and
--   staff.organization_id. Never trust client input. Staff without an
--   active location → explicit NO_LOCATION_ASSIGNED (clean error, audited).
--
-- SCOPE: S-01 only. S-03 (clock_in md5-PIN vs PBKDF2 login hash) stays OPEN
-- and is deliberately NOT changed here — it is a separate frozen decision
-- (PIN model unification) handled in its own migration.
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- clock_in(p_staff_id, p_pin, p_source) — + location/org resolution
-- (PIN check left as-is: md5 — S-03 unification is a separate frozen item)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_in(
  p_staff_id uuid,
  p_pin text,
  p_source text DEFAULT 'pos_terminal'::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff RECORD;
  v_latest_entry RECORD;
  v_shift_id UUID;
  v_loc uuid;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staff not found or inactive');
  END IF;

  IF v_staff.pin_hash != md5(p_pin) THEN
    INSERT INTO time_clock_audit (action, performed_by, details)
    VALUES ('failed_clock_in', p_staff_id, json_build_object('reason', 'invalid_pin'));
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_staff_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;

  IF v_latest_entry.entry_type IN ('clock_in', 'break_end') THEN
    RETURN json_build_object('success', false, 'error', 'Already clocked in');
  END IF;

  -- S-01: resolve location/org from staff's PRIMARY ACTIVE assignment
  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  WHERE l.staff_id = v_staff.id AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = v_staff.id AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;
  IF v_loc IS NULL THEN
    INSERT INTO time_clock_audit (action, performed_by, details)
    VALUES ('failed_clock_in', v_staff.id, json_build_object('reason', 'no_location_assigned'));
    RETURN json_build_object('success', false, 'error', 'NO_LOCATION_ASSIGNED');
  END IF;

  INSERT INTO shifts (staff_id, opened_at, starting_cash, organization_id, location_id)
  VALUES (v_staff.id, NOW(), 0, v_staff.organization_id, v_loc)
  RETURNING id INTO v_shift_id;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, source, timestamp)
  VALUES (v_staff.id, 'clock_in', true, p_source, NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_in', v_staff.id, json_build_object('shift_id', v_shift_id, 'location_id', v_loc));

  RETURN json_build_object(
    'success', true,
    'shift_id', v_shift_id,
    'staff_name', v_staff.full_name,
    'location_id', v_loc,
    'timestamp', NOW()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- clock_in_atomic(p_staff_id, p_notes, p_performed_by) — + location/org resolution
-- (session-trust identity, no PIN — kept per frozen A/S model)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_in_atomic(
  p_staff_id uuid,
  p_notes text DEFAULT NULL::text,
  p_performed_by uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff staff%ROWTYPE;
  v_open_shift shifts%ROWTYPE;
  v_result shifts%ROWTYPE;
  v_loc uuid;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;
  IF NOT v_staff.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
  END IF;

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

  -- S-01: resolve location/org from staff's PRIMARY ACTIVE assignment
  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  WHERE l.staff_id = v_staff.id AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = v_staff.id AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;
  IF v_loc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_LOCATION_ASSIGNED');
  END IF;

  INSERT INTO shifts (staff_id, opened_at, notes, organization_id, location_id)
  VALUES (v_staff.id, now(), p_notes, v_staff.organization_id, v_loc)
  RETURNING * INTO v_result;

  PERFORM log_audit(
    'clock_in'::text, 'staff'::text, v_staff.id::text, p_performed_by, NULL::text,
    jsonb_build_object('shift_id', v_result.id, 'location_id', v_loc),
    NULL::jsonb, NULL::jsonb, NULL::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'shift_id', v_result.id::text,
    'staff_id', v_staff.id,
    'location_id', v_loc,
    'opened_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_in_atomic(uuid, text, uuid) TO service_role;
