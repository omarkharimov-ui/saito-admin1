-- ============================================================================
-- 20260911000012 — S-03: clock-in/out PIN → A-frozen verifyPin (TS), md5 DB-dən çıx
--
-- ROOT CAUSE (ES_FOUNDATION_CURRENT_STATE §S-03): clock_in/clock_out DB-də
-- `pin_hash != md5(p_pin)` ilə yoxlayırdı — amma real PIN-lər A-frozen
-- `pbkdf2_sha256$260000$…` formatıdır → md5 heç vaxt match olmur → real staff
-- clock-in/out edə bilmir. Üstəlik `md5(NULL)` → NULL → (bypass yolu, S-02-də
-- PIN_REQUIRED ilə qismən bağlanıb idi).
--
-- FIX (S boundary — A frozen contract-ı toxunulmur, read-only istifadə olunur):
-- DB pure-plpgsql PBKDF2 hesablaya BİLMƏZ. A-nın frozen modeli
-- (login_preflight → TS `verifyPin` lib/crypto.ts PBKDF2-260k → login_commit)
-- eyni üsul: **PIN verify DB-dən çıxarılır, TS route-a köçürülür A-frozen
-- `verifyPin`-lə**. RPC-lər PIN-agnostic olur: identity = `set_session_staff`
-- (A-frozen), target = self OR `timeclock.override` (dəyişmir), atomic
-- shift/state logic eyni. NULL-PIN qorunması TS route-a keçir (`!pin` → 400).
-- `login_commit` / `verifyPin` / PIN policy / session contract = READ-ONLY,
-- dəyişdirilmir. clock_in_atomic_token / clock_out_atomic_token = PIN-siz
-- session-trust (S-03 scope-unda deyil, toxunulmur).
--
-- GOLDEN RULE 5: auto-commit. Idempotent (DROP IF EXISTS + OR REPLACE).
-- ============================================================================

-- Old 4-arg (p_pin var) overload-ları sil
DROP FUNCTION IF EXISTS public.clock_in_token(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.clock_out_token(text, uuid, text, text);

-- ----------------------------------------------------------------------------
-- clock_in_token(p_token, p_target_id, p_source) — PIN-AGNOSTIC
-- (PIN verify indi TS route-da A-frozen verifyPin-lə olur)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_in_token(
  p_token text,
  p_target_id uuid,
  p_source text DEFAULT 'pos_terminal'::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_staff RECORD;
  v_latest_entry RECORD;
  v_shift_id UUID;
  v_loc uuid;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();

  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'clock_in', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_staff FROM staff WHERE id = p_target_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staff not found or inactive');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_target_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;
  IF v_latest_entry.entry_type IN ('clock_in', 'break_end') THEN
    RETURN json_build_object('success', false, 'error', 'Already clocked in');
  END IF;

  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  WHERE l.staff_id = v_staff.id AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = v_staff.id AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;
  IF v_loc IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NO_LOCATION_ASSIGNED');
  END IF;

  INSERT INTO shifts (staff_id, opened_at, starting_cash, organization_id, location_id)
  VALUES (v_staff.id, NOW(), 0, v_staff.organization_id, v_loc)
  RETURNING id INTO v_shift_id;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, source, timestamp)
  VALUES (v_staff.id, 'clock_in', true, p_source, NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_in', v_staff.id,
    jsonb_build_object('shift_id', v_shift_id, 'location_id', v_loc,
                       'actor', v_actor, 'override', v_override, 'pin_verified_by', 'route_verifyPin'));

  RETURN json_build_object(
    'success', true, 'shift_id', v_shift_id, 'staff_name', v_staff.full_name,
    'location_id', v_loc, 'override', v_override, 'timestamp', NOW()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- clock_out_token(p_token, p_target_id, p_notes) — PIN-AGNOSTIC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_out_token(
  p_token text,
  p_target_id uuid,
  p_notes text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_override boolean;
  v_latest_entry RECORD;
  v_active_break RECORD;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_override := (p_target_id IS DISTINCT FROM v_actor)
                AND coalesce(has_permission(v_actor, 'timeclock.override'), false);
  IF p_target_id IS DISTINCT FROM v_actor AND NOT v_override THEN
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_actor, 'permission_denied', false,
      jsonb_build_object('action', 'clock_out', 'target', p_target_id));
    RETURN json_build_object('success', false, 'error', 'PERMISSION_DENIED');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_target_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;
  IF v_latest_entry IS NULL OR v_latest_entry.entry_type = 'clock_out' THEN
    RETURN json_build_object('success', false, 'error', 'Not clocked in');
  END IF;

  SELECT * INTO v_active_break FROM shift_breaks sb
  JOIN shifts s ON s.id = sb.shift_id
  WHERE s.staff_id = p_target_id AND sb.ended_at IS NULL;
  IF FOUND THEN
    UPDATE shift_breaks SET ended_at = NOW() WHERE id = v_active_break.id;
    INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
    VALUES (p_target_id, 'break_end', 'pos_terminal', NOW());
  END IF;

  UPDATE shifts SET closed_at = NOW(), notes = COALESCE(p_notes, notes)
  WHERE staff_id = p_target_id AND closed_at IS NULL;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, notes, source, timestamp)
  VALUES (p_target_id, 'clock_out', true, p_notes, 'pos_terminal', NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_out', p_target_id, jsonb_build_object('notes', p_notes, 'actor', v_actor, 'override', v_override, 'pin_verified_by', 'route_verifyPin'));

  RETURN json_build_object('success', true, 'override', v_override, 'timestamp', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in_token(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_out_token(text, uuid, text) TO service_role;
