-- 20260920000012 — pr v1 fix: multi-row claim crash (gate round 1 finding)
--
-- EVIDENCE (live, 2026-09-20): print_claim / print_agent_poll used
--   UPDATE ... FROM picked ... RETURNING j.id INTO v_claimed;
-- When >1 job is claimed, `RETURNING ... INTO var` raises
-- "query returned more than one row" (PL/pgSQL line 6) — a claim of 2+
-- jobs crashed the whole call. Reproduced live: 6 queued → error.
-- FIX: collect picked ids via a final aggregate SELECT over the CTE
-- (single row guaranteed), update through the same CTE. Behavior identical
-- otherwise (FOR UPDATE SKIP LOCKED, same claim semantics).
BEGIN;

CREATE OR REPLACE FUNCTION public.print_claim(p_location_id uuid, p_terminal_id text, p_max integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_claimed uuid[];
BEGIN
  PERFORM _print_requeue_stale(NULL, p_location_id);
  WITH picked AS (
    SELECT id FROM print_jobs
     WHERE location_id = p_location_id AND status = 'queued'
       AND device_id IN (SELECT id FROM print_devices WHERE iface = 'browser')
     ORDER BY created_at, id
     LIMIT GREATEST(1, COALESCE(p_max, 3))
     FOR UPDATE SKIP LOCKED
  ),
  cl AS (
    UPDATE print_jobs j
       SET status = 'claimed', claimed_by = p_terminal_id, claimed_at = now(),
           updated_at = now()
      FROM picked
     WHERE j.id = picked.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_claimed FROM picked;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'doc_type', j.doc_type, 'order_id', j.order_id,
        'trigger_key', j.trigger_key, 'payload', j.payload,
        'staff_name', j.staff_name,
        'device', _print_device_json(d))
      ORDER BY j.created_at), '[]'::jsonb)
      FROM print_jobs j
      JOIN print_devices d ON d.id = j.device_id
     WHERE j.id = ANY(v_claimed)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_agent_poll(p_device_key text, p_max integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_dev print_devices;
  v_claimed uuid[];
BEGIN
  IF p_device_key IS NULL OR char_length(p_device_key) < 32 THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown device');
  END IF;
  SELECT * INTO v_dev FROM print_devices WHERE agent_key = p_device_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown device');
  END IF;

  UPDATE print_devices SET last_seen_at = now(), online = enabled
   WHERE id = v_dev.id;

  IF NOT v_dev.enabled THEN
    RETURN jsonb_build_object('success', true, 'enabled', false,
      'device', _print_device_json(v_dev), 'jobs', '[]'::jsonb);
  END IF;

  PERFORM _print_requeue_stale(v_dev.id, NULL);
  WITH picked AS (
    SELECT id FROM print_jobs
     WHERE device_id = v_dev.id AND status = 'queued'
     ORDER BY created_at, id
     LIMIT GREATEST(1, COALESCE(p_max, 3))
     FOR UPDATE SKIP LOCKED
  ),
  cl AS (
    UPDATE print_jobs j
       SET status = 'claimed', claimed_by = 'agent:' || v_dev.name, claimed_at = now(),
           updated_at = now()
      FROM picked
     WHERE j.id = picked.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_claimed FROM picked;

  RETURN jsonb_build_object('success', true, 'enabled', true,
    'device', _print_device_json(v_dev),
    'jobs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', j.id, 'doc_type', j.doc_type, 'order_id', j.order_id,
          'trigger_key', j.trigger_key, 'payload', j.payload,
          'staff_name', j.staff_name)
        ORDER BY j.created_at), '[]'::jsonb)
        FROM print_jobs j
       WHERE j.id = ANY(v_claimed)
    ));
END;
$function$;

COMMIT;
