-- ============================================================================
-- 20260911000004 — 4.1: login_hardened (A-FOUNDATION GATE əsasında)
--
-- HYBRID DİZAYN (gate §2): PG 17-də native PBKDF2 YOX → hash verify Node-da
-- (bounded: yalnız valid pbkdf2-260k hash-lər, ~5 staff). Lock/rate-limit/
-- audit/session/identity → BÜTÜNÜ DB, 1 transaction (SSOT: hər giriş
-- nöqtəsi eyni DB qatından keçir).
--
-- Qapalı gate qərarları:
--  * IP rate-limit: 10 wrong/IP/5 dəq → reject (login_attempts, düzgün sütunlarla)
--  * Staff lock:    5 wrong/staff → locked_until = +15 dəq (auto-expiry)
--  * Generic error (enumeration yoxdur): route staff adı/tərəf qaytarmır
--  * login_attempts + security_events AYNI transaction (atomic — birinin
--    itkisi digərini itməyə salmır)
--  * Banned PIN: login-də SOFT (login olur + weak_pin_login event +
--    pin_change_required=true); HARD block = 4.4 (set/reset)
--  * Route race: preflight→verify→commit arasında staff disabled olarsa
--    commit içindəki FOR UPDATE + status check reject edir
--
-- Qeyd (legacy debt): köhnə check_login_rate_limit() mövcud deyilən
-- 'identifier' kolonuna istinad edir (dead code, çağrılmır) — toxunulmur.
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- login_preflight(p_ip) — rate-limit + candidate list (verify üçün)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.login_preflight(
  p_ip text DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip_fails INT;
  v_candidates JSONB;
  v_row RECORD;
BEGIN
  -- 1) IP rate-limit: 10 wrong / 5 dəq
  -- IP rate-limit: 10 wrong/IP/5 dəq.
  -- LAN qeydi: restoran POS-ları eyni NAT/IP arxasında ola bilər → 10 fail
  -- bütün kassaları kilidləyə bilər. Buna görə:
  --   (a) per-staff lock (5 cəhd/15 dəq) əsas brute-force guard-dır,
  --   (b) IP limiti + GLOBAL backstop (50 wrong / 5 dəq — bütün sistem)
  --       real saldırını saxlayır, amma normal LAN istifadəsində nadir hallarda
  --       yalnız 5 dəq gözləmə tələb edir.
  IF p_ip IS NOT NULL THEN
    BEGIN
      SELECT count(*) INTO v_ip_fails
      FROM login_attempts
      WHERE success = false
        AND ip_address = p_ip::inet
        AND created_at > now() - interval '5 minutes';
    EXCEPTION WHEN OTHERS THEN
      v_ip_fails := 0;  -- invalid IP literal → no rate-limit for it
    END;
    IF v_ip_fails >= 10 THEN
      RETURN jsonb_build_object(
        'action', 'ip_locked',
        'retry_after_seconds', 300,
        'message', 'Çoxsaylı uğursuz cəhd. 5 dəqiqə gözləyin.'
      );
    END IF;
  END IF;

  -- Global backstop: 50 wrong / 5 dəq (bütün IP) — real brute-force.
  SELECT count(*) INTO v_ip_fails
  FROM login_attempts
  WHERE success = false
    AND created_at > now() - interval '5 minutes';
  IF v_ip_fails >= 50 THEN
    RETURN jsonb_build_object(
      'action', 'ip_locked',
      'retry_after_seconds', 300,
      'message', 'Sistem müvəqqəti əlçatansızdır. 5 dəqiqə sonra təkrar yoxlayın.'
    );
  END IF;

  -- 2) Candidates: active + ACTIVE + valid pbkdf2-260k hash (bounded loop,
  --    gate §2). Weak-hash staff candidate-DA DAXİL OLUR (login_commit-də
  --    weak_pin_hash event + inactive — amma route verify edə bilməz,
  --    deməli onları da göndəririk ki, route 'weak' flagini qoysun).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'pin_hash', s.pin_hash,
      'weak', s.pin_hash NOT LIKE 'pbkdf2_sha256$260000%'
  )), '[]'::jsonb) INTO v_candidates
  FROM staff s
  WHERE s.is_active = true
    AND s.status = 'ACTIVE'
    AND s.pin_hash IS NOT NULL
    AND s.pin_hash <> '';

  RETURN jsonb_build_object(
    'action', 'proceed',
    'candidates', v_candidates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_preflight(text) TO service_role;

-- ----------------------------------------------------------------------------
-- login_commit(...) — tək transaction: lock/reject + session + audit
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
      v_ip := NULL;  -- invalid IP literal → audit without IP
    END;
  END IF;
  -- Lock staff row first (FOR UPDATE cannot apply to nullable side of outer join)
  SELECT * INTO v_s FROM staff WHERE id = p_candidate_id FOR UPDATE;
  -- Then fetch role name separately
  IF FOUND THEN
    SELECT r.name INTO v_role_name
    FROM roles r WHERE r.id = v_s.role_id;
  END IF;

  IF NOT FOUND THEN
    -- No staff identified (wrong PIN, or null/unknown id): still record the
    -- attempt so IP rate-limit accounting works (staff_id stays NULL).
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
      -- weak/legacy hash: lock yox, amma signal + event (4.4 data migration qədər)
      INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
      VALUES (v_s.id, 'weak_pin_hash_attempt', false, v_ip, p_user_agent,
        jsonb_build_object('reason', 'legacy_hash_format'));
    ELSE
      UPDATE staff
      SET failed_login_attempts = coalesce(failed_login_attempts, 0) + 1
      WHERE id = v_s.id;

      IF coalesce(v_s.failed_login_attempts, 0) + 1 >= 5 THEN
        UPDATE staff
        SET locked_until = now() + interval '15 minutes',
            failed_login_attempts = 0
        WHERE id = v_s.id;
        INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
        VALUES (v_s.id, 'account_locked', false, v_ip, p_user_agent,
          jsonb_build_object('reason', '5_failed_attempts', 'locked_minutes', 15));
      ELSE
        INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
        VALUES (v_s.id, 'login_failed', false, v_ip, p_user_agent,
          jsonb_build_object('reason', coalesce(p_failure_reason, 'invalid_pin')));
      END IF;
    END IF;

    RETURN jsonb_build_object('success', false, 'reason', 'invalid');
  END IF;

  -- ====== SUCCESS path (race-safe: preflight-dən bəla status dəyişsə) ======
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

  -- Session
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

  -- Audit (həmin transaction)
  INSERT INTO login_attempts (staff_id, success, ip_address, user_agent)
  VALUES (v_s.id, true, v_ip, p_user_agent);

  INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
  VALUES (v_s.id, 'login', true, v_ip, p_user_agent,
    jsonb_build_object('role', v_role_name, 'method', 'pin'));

  IF p_pin_banned THEN
    INSERT INTO security_events (staff_id, event_type, success, ip_address, user_agent, metadata)
    VALUES (v_s.id, 'weak_pin_login', true, v_ip, p_user_agent,
      jsonb_build_object('reason', 'banned_default_pin', 'action', 'pin_change_required'));
  END IF;

  -- State reset
  UPDATE staff
  SET failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = now()
  WHERE id = v_s.id;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires,
    'staff_id', v_s.id,
    'name', coalesce(v_s.full_name, v_s.name),
    'role', v_role_name,
    'canonical_role', coalesce(normalize_role(v_role_name), 'cashier'),
    'shift', v_s.shift,
    'pin_change_required', p_pin_banned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_commit(uuid, boolean, text, text, text, boolean) TO service_role;
