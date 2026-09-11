-- ============================================================================
-- 20260911000005 — A-FREEZE fixes (FINAL FREEZE CONTRACT §2/§7/§8/§12)
--
-- Gaps found by the coverage audit (not present in 4.1):
--  G1. login_commit: banned PIN was SOFT (login allowed) — contract §2
--      "banned PIN-lər reject" → now HARD REJECT (401 generic).
--  G2. reset_staff_pin: *** hash vs PBKDF2 verify → reset staff could
--      NEVER log in + plaintext PIN in RPC response. New `set_staff_pin`
--      (hash supplied by server Node via hashPin, format-validated,
--      banned-PIN rejected, sessions revoked). reset_staff_pin DEPRECATED
--      (kept for compat, now rejects non-pbkdf2 output).
--  G3. approve_override: no self-approve guard (§8) → requester cannot
--      approve their own override.
--  G4. staff lifecycle: PATCH /api/staff/[id] wrote status raw (no
--      transition rules, no audit, no session consequence, §12).
--      New `set_staff_status_atomic` with authorized transitions
--      (ACTIVE<->SUSPENDED, *->TERMINATED one-way), session revoke,
--      security_event + operation_logs in one tx.
--  G5. weak/legacy hash staff (seed/fakehash) still ACTIVE (§2
--      "weak hash staff avtomatik deaktiv") → data migration below
--      (idempotent): ACTIVE + non-pbkdf2-260k + non-empty hash →
--      SUSPENDED + weak_pin_hash event. (0000-PIN holders keep ACTIVE:
--      hash valid, banned-PIN now hard-rejected at login.)
--
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE + guarded data step).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- G1+G2: login_commit v2 — banned PIN hard-reject + weak-hash hard-reject
-- (replaces 20260911000004 body; everything else identical)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.login_commit(
  p_candidate_id uuid,
  p_success boolean,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_pin_banned boolean DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s RECORD;
  v_role_name text;
  v_token uuid;
  v_expires timestamptz;
  v_loc uuid;
  v_ip inet;
BEGIN
  IF p_ip IS NOT NULL AND p_ip <> '' THEN
    BEGIN
      v_ip := p_ip::inet;
    EXCEPTION WHEN OTHERS THEN
      v_ip := NULL;
    END;
  END IF;

  SELECT * INTO v_s FROM staff WHERE id = p_candidate_id FOR UPDATE;
  IF FOUND THEN
    SELECT r.name INTO v_role_name FROM roles r WHERE r.id = v_s.role_id;
  END IF;

  IF NOT FOUND THEN
    IF NOT p_success THEN
      INSERT INTO login_attempts (staff_id, success, failure_reason, ip_address, user_agent)
      VALUES (NULL, false, p_failure_reason, v_ip, p_user_agent);
    END IF;
    RETURN jsonb_build_object('success', false, 'reason', 'invalid');
  END IF;

  -- ====== FAIL path ======
  IF NOT p_success THEN
    INSERT INTO login_attempts (staff_id, success, failure_reason, ip_address, user_agent)
    VALUES (v_s.id, false, p_failure_reason, v_ip, p_user_agent);

    IF v_s.pin_hash NOT LIKE 'pbkdf2_sha256$260000%' THEN
      INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
      VALUES (v_s.id, 'weak_pin_hash_attempt', false, v_ip, p_user_agent,
        jsonb_build_object('reason', 'legacy_hash_format'));
    ELSE
      UPDATE staff SET failed_login_attempts = coalesce(failed_login_attempts, 0) + 1
      WHERE id = v_s.id;
      IF coalesce(v_s.failed_login_attempts, 0) + 1 >= 5 THEN
        UPDATE staff SET locked_until = now() + interval '15 minutes', failed_login_attempts = 0
        WHERE id = v_s.id;
        INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
        VALUES (v_s.id, 'lockout', false, v_ip, p_user_agent,
          jsonb_build_object('reason', '5_failed_attempts', 'locked_minutes', 15));
      ELSE
        INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
        VALUES (v_s.id, 'login_failed', false, v_ip, p_user_agent,
          jsonb_build_object('reason', coalesce(p_failure_reason, 'invalid_pin')));
      END IF;
    END IF;
    RETURN jsonb_build_object('success', false, 'reason', 'invalid');
  END IF;

  -- ====== SUCCESS path (race-safe) ======
  IF v_s.status <> 'ACTIVE' OR NOT v_s.is_active THEN
    INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
    VALUES (v_s.id, 'login_rejected_inactive', false, v_ip, p_user_agent,
      jsonb_build_object('status', v_s.status, 'is_active', v_s.is_active));
    RETURN jsonb_build_object('success', false, 'reason', 'inactive');
  END IF;
  IF v_s.locked_until IS NOT NULL AND v_s.locked_until > now() THEN
    INSERT INTO login_attempts (staff_id, success, failure_reason, ip_address, user_agent)
    VALUES (v_s.id, false, 'locked', v_ip, p_user_agent);
    RETURN jsonb_build_object('success', false, 'reason', 'invalid');
  END IF;
  IF v_s.pin_hash NOT LIKE 'pbkdf2_sha256$260000%' THEN
    -- G2: weak/legacy hash can never legitimately verify → never log in
    INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
    VALUES (v_s.id, 'weak_pin_hash_attempt', true, v_ip, p_user_agent,
      jsonb_build_object('reason', 'legacy_hash_rejected'));
    RETURN jsonb_build_object('success', false, 'reason', 'invalid');
  END IF;
  IF p_pin_banned THEN
    -- G1: banned default PIN → HARD reject (generic, no enumeration)
    INSERT INTO login_attempts (staff_id, success, failure_reason, ip_address, user_agent)
    VALUES (v_s.id, false, 'banned_pin', v_ip, p_user_agent);
    INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
    VALUES (v_s.id, 'weak_pin_login', false, v_ip, p_user_agent,
      jsonb_build_object('reason', 'banned_default_pin', 'action', 'pin_change_required'));
    RETURN jsonb_build_object('success', false, 'reason', 'banned_pin');
  END IF;

  v_token := gen_random_uuid();
  v_expires := now() + interval '12 hours';

  SELECT l.location_id INTO v_loc
  FROM staff_locations l
  WHERE l.staff_id = v_s.id AND l.active = true
    AND (l.is_primary = true OR NOT EXISTS (
        SELECT 1 FROM staff_locations l2
        WHERE l2.staff_id = v_s.id AND l2.active = true AND l2.is_primary = true))
  LIMIT 1;

  INSERT INTO sessions (token, user_id, role, expires_at, status,
                        organization_id, active_location_id)
  VALUES (v_token, v_s.id, coalesce(normalize_role(v_role_name), 'cashier'),
          v_expires, 'ACTIVE', v_s.organization_id, v_loc);

  INSERT INTO login_attempts (staff_id, success, ip_address, user_agent)
  VALUES (v_s.id, true, v_ip, p_user_agent);
  INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
  VALUES (v_s.id, 'login', true, v_ip, p_user_agent,
    jsonb_build_object('role', v_role_name, 'method', 'pin'));

  UPDATE staff SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
  WHERE id = v_s.id;

  RETURN jsonb_build_object(
    'success', true, 'token', v_token, 'expires_at', v_expires,
    'staff_id', v_s.id, 'name', coalesce(v_s.full_name, v_s.name),
    'role', v_role_name, 'canonical_role', coalesce(normalize_role(v_role_name), 'cashier'),
    'shift', v_s.shift, 'pin_change_required', false
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- G2: set_staff_pin — server-side PBKDF2 hash (from Node hashPin), validated
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_pin(
  p_staff_id uuid,
  p_new_pin_hash text,
  p_performed_by uuid
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;
  IF p_new_pin_hash IS NULL OR p_new_pin_hash NOT LIKE 'pbkdf2_sha256$260000$%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PIN_FORMAT');
  END IF;

  UPDATE staff SET pin_hash = p_new_pin_hash, failed_login_attempts = 0,
                   locked_until = NULL, updated_at = now()
  WHERE id = p_staff_id;

  -- invalidating all existing sessions (pin change = identity re-establish)
  UPDATE sessions SET status = 'REVOKED', revoked_at = now()
  WHERE user_id = p_staff_id AND status = 'ACTIVE';

  INSERT INTO security_events (staff_id, event_type, success, metadata)
  VALUES (p_staff_id, 'pin_change', true,
    jsonb_build_object('performed_by', p_performed_by));
  INSERT INTO operation_logs (entity_type, entity_id, operation, performed_by, after_state)
  VALUES ('staff', p_staff_id, 'pin_change', p_performed_by,
    jsonb_build_object('pin_length', 4));

  RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id,
    'message', 'PIN updated. Old sessions revoked.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_pin(uuid, text, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- G3: approve_override — self-approve guard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_override(
  p_token text,
  p_override_id uuid
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_org_id uuid;
  v_override RECORD;
  v_manager_has_perm boolean;
BEGIN
  PERFORM set_session_staff(p_token);
  v_staff_id := current_staff_id();
  v_org_id := current_org_id();

  SELECT * INTO v_override FROM manager_overrides WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Override not found'; END IF;
  IF v_override.status != 'PENDING' THEN RAISE EXCEPTION 'Override already %', v_override.status; END IF;
  IF v_override.requested_by = v_staff_id THEN
    UPDATE manager_overrides SET status = 'DENIED', denied_at = now(),
      denial_reason = 'self_approval_forbidden' WHERE id = p_override_id;
    RAISE EXCEPTION 'Self-approval is not allowed';
  END IF;
  IF v_override.expires_at <= now() THEN
    UPDATE manager_overrides SET status = 'EXPIRED' WHERE id = p_override_id;
    RAISE EXCEPTION 'Override expired';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM role_permissions rp JOIN staff s ON s.role_id = rp.role_id
    WHERE s.id = v_staff_id AND rp.permission_key = v_override.permission
  ) INTO v_manager_has_perm;
  IF NOT v_manager_has_perm THEN
    RAISE EXCEPTION 'Manager does not have permission: %', v_override.permission;
  END IF;

  UPDATE manager_overrides SET status = 'APPROVED', approved_by = v_staff_id, approved_at = now()
  WHERE id = p_override_id;
  INSERT INTO operation_logs (entity_type, entity_id, operation, after_state, performed_by, correlation_id, location_id, organization_id)
  VALUES ('manager_override', p_override_id, 'override.approved',
          jsonb_build_object('permission', v_override.permission, 'requested_by', v_override.requested_by, 'approved_by', v_staff_id),
          v_staff_id, gen_random_uuid(), v_override.location_id, v_org_id);
  RETURN jsonb_build_object('override_id', p_override_id, 'status', 'APPROVED');
END;
$$;

-- ----------------------------------------------------------------------------
-- G4: set_staff_status_atomic — lifecycle transitions (authorized, atomic,
-- audited, session consequence defined)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_status_atomic(
  p_token text,
  p_staff_id uuid,
  p_new_status staff_status,
  p_reason text DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_staff staff%ROWTYPE;
  v_actor_staff staff%ROWTYPE;
  v_sessions_revoked int;
BEGIN
  PERFORM set_session_staff(p_token);
  v_actor := current_staff_id();
  v_org := current_org_id();

  -- actor must be able to manage staff
  IF NOT (SELECT coalesce(has_permission(v_actor, 'staff.manage'), false)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: staff.manage' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff not found'; END IF;

  -- org scope
  IF v_staff.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'ORG_SCOPE_DENIED';
  END IF;

  -- transition rules (staff_status enum: ACTIVE, INACTIVE, SUSPENDED)
  IF p_new_status = v_staff.status THEN
    RETURN jsonb_build_object('success', true, 'noop', true, 'status', v_staff.status);
  END IF;
  IF v_staff.status = 'INACTIVE' THEN
    RAISE EXCEPTION 'INACTIVE (terminated) is terminal; cannot transition to %', p_new_status;
  END IF;

  UPDATE staff SET status = p_new_status,
                   is_active = (p_new_status = 'ACTIVE'),
                   updated_at = now()
  WHERE id = p_staff_id;

  -- session consequence: non-ACTIVE → revoke all active sessions
  IF p_new_status <> 'ACTIVE' THEN
    UPDATE sessions SET status = 'REVOKED', revoked_at = now()
    WHERE user_id = p_staff_id AND status = 'ACTIVE';
    GET DIAGNOSTICS v_sessions_revoked = ROW_COUNT;
  END IF;

  INSERT INTO security_events (staff_id, event_type, success, metadata)
  VALUES (p_staff_id,
    CASE WHEN p_new_status = 'ACTIVE' THEN 'staff_enabled'
         WHEN p_new_status = 'SUSPENDED' THEN 'staff_suspended'
         ELSE 'staff_terminated' END,
    true,
    jsonb_build_object('actor_id', v_actor, 'from', v_staff.status, 'to', p_new_status,
                       'reason', p_reason, 'sessions_revoked', v_sessions_revoked));
  INSERT INTO operation_logs (entity_type, entity_id, operation, before_state, after_state, performed_by, correlation_id, organization_id)
  VALUES ('staff', p_staff_id, 'status_change',
          jsonb_build_object('status', v_staff.status),
          jsonb_build_object('status', p_new_status, 'reason', p_reason),
          v_actor, gen_random_uuid(), v_org);

  RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id,
    'status', p_new_status, 'sessions_revoked', COALESCE(v_sessions_revoked, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_status_atomic(text, uuid, staff_status, text) TO service_role;

-- ----------------------------------------------------------------------------
-- G1b: banned-PIN POLICY in DB (contract: "0000, 1234, ... policy-də müəyyən").
-- Policy lives here (authoritative, single place). To change the list:
-- ALTER this function in a migration (settings has no key/value columns).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_banned_pin(p_pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_pin IN ('0000','1111','0001','2222','1234','1213','1122','1212');
$$;

GRANT EXECUTE ON FUNCTION public.is_banned_pin(text) TO service_role;

-- ----------------------------------------------------------------------------
-- G5: data migration — weak/legacy hash ACTIVE staff → SUSPENDED (idempotent)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_s RECORD;
BEGIN
  FOR v_s IN
    SELECT id, name FROM staff
    WHERE is_active = true AND status = 'ACTIVE'
      AND pin_hash IS NOT NULL AND pin_hash <> ''
      AND pin_hash NOT LIKE 'pbkdf2_sha256$260000%'
  LOOP
    UPDATE staff SET status = 'SUSPENDED', is_active = false, updated_at = now()
    WHERE id = v_s.id;
    UPDATE sessions SET status = 'REVOKED', revoked_at = now()
    WHERE user_id = v_s.id AND status = 'ACTIVE';
    INSERT INTO security_events (staff_id, event_type, success, metadata)
    VALUES (v_s.id, 'weak_pin_hash', true,
      jsonb_build_object('reason', 'legacy_or_fake_hash', 'auto_suspended_by', 'migration_20260911000005'));
    RAISE NOTICE 'G5 suspended: % (%)', v_s.name, v_s.id;
  END LOOP;
END;
$$;
