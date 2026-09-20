-- 20260920000011 — Wave A #5: print device registry + print job routing (pr v1)
--
-- EVIDENCE (live, 2026-09-20):
--   * No print_jobs table, no device registry (map §9 claim "print_jobs var" was
--     STALE — verified against information_schema).
--   * Printer config = single `settings` row: Default Printer / thermal / 80mm /
--     interface=browser / auto_print_receipt=on / auto_print_kitchen=off.
--   * Only browser printing works: BrowserPrinterAdapter (iframe + window.print);
--     Network/USB/Serial adapters in src/lib/print are stubs
--     ("requires backend endpoint / native host. Not yet implemented.").
--   * /api/orders/reprint inserts into `order_reprints` — table does NOT exist →
--     route returns fake success ("Reprint logged (no table)").
--   * KDS precedent = the house routing pattern: DB trigger → outbox_events →
--     kds_ticket_poll (cursor, DB-anchored first load). Terminal identity =
--     client-generated term_* id already flowing on order mutations.
--
-- DECISION (v1, scope-protected — frozen P-series RPCs UNTOUCHED):
--   * print_devices: per-location registry (name, doc_types ⊆ {receipt,kitchen,
--     label}, iface ∈ {browser, escpos_network}, host/port, paper, copies,
--     enabled, online/last_seen/last_error, agent_key for LAN agents).
--   * print_jobs: server-side job queue. Enqueue = EXPLICIT client event
--     (payment captured → receipt; order sent to kitchen → kitchen ticket;
--     reprint/test → their triggers). Idempotent:
--     UNIQUE (location_id, doc_type, order_id NULL-safe, trigger_key).
--   * Routing: enqueue picks the oldest ENABLED device matching (location,
--     doc_type); none → {routed:false} (client falls back to legacy direct
--     browser print — store continuity).
--   * Claim: terminal claim loop (POS/KDS) claims only BROWSER jobs for its
--     location (FOR UPDATE SKIP LOCKED); LAN agent polls with its device
--     agent_key and claims only its own device's jobs. Stale claims
--     (> 5 min without result) requeue.
--   * Audit: device mutations, enqueue, result, rotate. HIGH-FREQUENCY claim
--     polling is NOT audited (queue hygiene, no operational consequence) —
--     decision logged per Rule 8.
--   * SECURITY (house style, mirrors checklists 20260920000007): RLS off,
--     access ONLY via SECURITY DEFINER RPCs from service_role routes;
--     REVOKE table DML from PUBLIC/anon/authenticated (default-privileges
--     quirk (f)); REVOKE EXECUTE PUBLIC+anon+authenticated on every fn;
--     agent_key is NEVER returned except once (upsert/rotate).
BEGIN;

-- ── tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.print_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  doc_types text[] NOT NULL DEFAULT '{receipt}'
    CHECK (cardinality(doc_types) BETWEEN 1 AND 4 AND doc_types <@ ARRAY['receipt','kitchen','label']),
  iface text NOT NULL DEFAULT 'browser' CHECK (iface IN ('browser','escpos_network')),
  host text CHECK (host IS NULL OR char_length(host) BETWEEN 1 AND 128),
  port integer CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
  paper_width text NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('58mm','80mm')),
  copies integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 5),
  enabled boolean NOT NULL DEFAULT true,
  online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  last_error text,
  agent_key text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, name)
);
CREATE INDEX IF NOT EXISTS print_devices_loc_doc_idx
  ON public.print_devices (location_id, enabled) ;

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.print_devices(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('receipt','kitchen','label')),
  trigger_key text NOT NULL CHECK (char_length(trigger_key) BETWEEN 1 AND 64),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  staff_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','printed','failed')),
  claimed_by text,
  claimed_at timestamptz,
  printed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- idempotent enqueue (NULL order_id = test/unbound jobs → null-safe uuid);
-- expression uniques require an index, not a table constraint (PG)
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_idem_uq
  ON public.print_jobs (location_id, doc_type,
      COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid),
      trigger_key);
CREATE INDEX IF NOT EXISTS print_jobs_claim_idx
  ON public.print_jobs (location_id, status, created_at);
CREATE INDEX IF NOT EXISTS print_jobs_device_idx
  ON public.print_jobs (device_id, status);

-- ── table privileges (default-privileges quirk (f)) ─────────────────────────
REVOKE ALL ON TABLE public.print_devices, public.print_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.print_devices, public.print_jobs FROM anon, authenticated;

-- ── helper: device summary jsonb (NEVER includes agent_key) ─────────────────

CREATE OR REPLACE FUNCTION public._print_device_json(d public.print_devices)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'location_id', d.location_id, 'name', d.name,
    'doc_types', d.doc_types, 'iface', d.iface,
    'host', d.host, 'port', d.port, 'paper_width', d.paper_width,
    'copies', d.copies, 'enabled', d.enabled, 'online', d.online,
    'last_seen_at', d.last_seen_at, 'last_error', d.last_error,
    'created_at', d.created_at
  );
$$;

-- ── helper: requeue stale claims (> 5 min) for a device / location ───────────

CREATE OR REPLACE FUNCTION public._print_requeue_stale(p_device_id uuid, p_location_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE print_jobs
     SET status = 'queued', claimed_by = NULL, claimed_at = NULL,
         updated_at = now()
   WHERE status = 'claimed' AND claimed_at < now() - interval '5 minutes'
     AND (p_device_id IS NOT NULL AND device_id = p_device_id
          OR (p_device_id IS NULL AND location_id = p_location_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── device registry ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.print_device_upsert(
  p_location_id uuid, p_name text, p_doc_types text[], p_iface text,
  p_host text, p_port integer, p_paper_width text, p_copies integer,
  p_enabled boolean, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_dev print_devices;
  v_actor text;
  v_iface text;
  v_existed boolean;
BEGIN
  SELECT name INTO v_actor FROM staff WHERE id = p_staff_id;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Location not found');
  END IF;
  v_iface := COALESCE(p_iface, 'browser');
  IF v_iface NOT IN ('browser','escpos_network') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid iface');
  END IF;
  IF p_doc_types IS NULL OR cardinality(p_doc_types) = 0 THEN
    p_doc_types := ARRAY['receipt'];
  END IF;
  v_existed := EXISTS (SELECT 1 FROM print_devices
                        WHERE location_id = p_location_id AND name = trim(p_name));

  INSERT INTO print_devices (location_id, name, doc_types, iface, host, port,
                             paper_width, copies, enabled, created_by)
    VALUES (p_location_id, trim(p_name), p_doc_types, v_iface, p_host, p_port,
            COALESCE(p_paper_width, '80mm'), COALESCE(p_copies, 1),
            COALESCE(p_enabled, true), p_staff_id)
    ON CONFLICT (location_id, name) DO UPDATE
      SET doc_types = EXCLUDED.doc_types,
          iface = EXCLUDED.iface,
          host = EXCLUDED.host,
          port = EXCLUDED.port,
          paper_width = EXCLUDED.paper_width,
          copies = EXCLUDED.copies,
          enabled = EXCLUDED.enabled,
          updated_at = now()
    RETURNING * INTO v_dev;

  PERFORM log_audit('print_device_upsert', 'print_device', v_dev.id::text,
    p_staff_id, v_actor, NULL,
    _print_device_json(v_dev), NULL, NULL);

  -- agent_key returned ONCE (new devices only) so the operator can configure
  -- the LAN agent; existing devices keep their key (rotate endpoint for churn).
  RETURN jsonb_build_object('success', true, 'device', _print_device_json(v_dev),
    'agent_key', CASE WHEN NOT v_existed
                      THEN (SELECT agent_key FROM print_devices WHERE id = v_dev.id)
                      ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_device_patch(p_id uuid, p_patch jsonb, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_dev print_devices;
  v_actor text;
  v_name text; v_doc_types text[]; v_iface text; v_host text;
  v_port integer; v_paper text; v_copies integer; v_enabled boolean;
BEGIN
  SELECT * INTO v_dev FROM print_devices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;
  SELECT name INTO v_actor FROM staff WHERE id = p_staff_id;

  IF p_patch ? 'name' THEN v_name := trim(p_patch->>'name');
    IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 80 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid name');
    END IF;
  END IF;
  IF p_patch ? 'doc_types' THEN
    v_doc_types := (SELECT ARRAY_agg(x) FROM jsonb_array_elements_text(p_patch->'doc_types') x);
    IF v_doc_types IS NULL OR cardinality(v_doc_types) = 0
       OR NOT v_doc_types <@ ARRAY['receipt','kitchen','label'] THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid doc_types');
    END IF;
  END IF;
  IF p_patch ? 'iface' THEN v_iface := p_patch->>'iface';
    IF v_iface NOT IN ('browser','escpos_network') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid iface');
    END IF;
  END IF;
  IF p_patch ? 'host' THEN v_host := NULLIF(trim(coalesce(p_patch->>'host','')), ''); END IF;
  IF p_patch ? 'port' THEN
    v_port := (p_patch->>'port')::int;
    IF v_port NOT BETWEEN 1 AND 65535 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid port');
    END IF;
  END IF;
  IF p_patch ? 'paper_width' THEN v_paper := p_patch->>'paper_width';
    IF v_paper NOT IN ('58mm','80mm') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid paper_width');
    END IF;
  END IF;
  IF p_patch ? 'copies' THEN v_copies := (p_patch->>'copies')::int;
    IF v_copies NOT BETWEEN 1 AND 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid copies');
    END IF;
  END IF;
  IF p_patch ? 'enabled' THEN v_enabled := p_patch->>'enabled' = 'true'; END IF;

  UPDATE print_devices SET
    name = coalesce(v_name, name),
    doc_types = coalesce(v_doc_types, doc_types),
    iface = coalesce(v_iface, iface),
    host = coalesce(v_host, host),
    port = coalesce(v_port, port),
    paper_width = coalesce(v_paper, paper_width),
    copies = coalesce(v_copies, copies),
    enabled = coalesce(v_enabled, enabled),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_dev;

  PERFORM log_audit('print_device_patch', 'print_device', v_dev.id::text,
    p_staff_id, v_actor, NULL, _print_device_json(v_dev), p_patch, NULL);

  RETURN jsonb_build_object('success', true, 'device', _print_device_json(v_dev));
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_device_list(p_location_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = 'public'
AS $function$
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(_print_device_json(d) ORDER BY d.created_at), '[]'::jsonb)
      FROM print_devices d
     WHERE d.location_id = p_location_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_device_delete(p_id uuid, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_dev print_devices;
  v_open integer;
  v_actor text;
BEGIN
  SELECT * INTO v_dev FROM print_devices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;
  SELECT count(*) INTO v_open FROM print_jobs
   WHERE device_id = p_id AND status IN ('queued','claimed');
  IF v_open > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Device has ' || v_open || ' open job(s) — finish or delete them first');
  END IF;
  SELECT name INTO v_actor FROM staff WHERE id = p_staff_id;
  PERFORM log_audit('print_device_delete', 'print_device', v_dev.id::text,
    p_staff_id, v_actor, _print_device_json(v_dev), NULL, NULL, NULL);
  DELETE FROM print_devices WHERE id = p_id;
  RETURN jsonb_build_object('success', true, 'deleted', v_dev.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_device_rotate_key(p_id uuid, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_dev print_devices;
  v_key text;
  v_actor text;
BEGIN
  SELECT * INTO v_dev FROM print_devices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;
  SELECT name INTO v_actor FROM staff WHERE id = p_staff_id;
  v_key := encode(gen_random_bytes(24), 'hex');
  UPDATE print_devices SET agent_key = v_key, updated_at = now() WHERE id = p_id;
  PERFORM log_audit('print_device_rotate_key', 'print_device', v_dev.id::text,
    p_staff_id, v_actor, NULL, _print_device_json(v_dev), NULL, NULL);
  RETURN jsonb_build_object('success', true, 'device', _print_device_json(v_dev),
    'agent_key', v_key);
END;
$function$;

-- ── job lifecycle ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.print_enqueue(
  p_location_id uuid, p_doc_type text, p_order_id uuid, p_trigger_key text,
  p_payload jsonb, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_loc uuid;
  v_dev print_devices;
  v_job print_jobs;
  v_actor text;
  v_dup boolean;
  n integer;
BEGIN
  IF p_doc_type NOT IN ('receipt','kitchen','label') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid doc_type');
  END IF;
  IF p_trigger_key IS NULL OR char_length(trim(p_trigger_key)) NOT BETWEEN 1 AND 64 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid trigger_key');
  END IF;
  IF p_order_id IS NOT NULL THEN
    SELECT location_id INTO v_loc FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;
    v_loc := COALESCE(v_loc, p_location_id);
  ELSE
    v_loc := p_location_id;
  END IF;
  IF v_loc IS NULL OR NOT EXISTS (SELECT 1 FROM locations WHERE id = v_loc) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Location not found');
  END IF;
  SELECT name INTO v_actor FROM staff WHERE id = p_staff_id;

  -- routing: oldest ENABLED device matching (location, doc_type);
  -- FOR UPDATE so a concurrent delete cannot remove it mid-enqueue
  SELECT * INTO v_dev FROM print_devices
   WHERE location_id = v_loc AND enabled AND p_doc_type = ANY(doc_types)
   ORDER BY created_at, id
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'routed', false);
  END IF;

  INSERT INTO print_jobs (location_id, device_id, order_id, doc_type, trigger_key,
                          payload, staff_name)
    VALUES (v_loc, v_dev.id, p_order_id, p_doc_type, trim(p_trigger_key),
            coalesce(p_payload, '{}'::jsonb), v_actor)
    ON CONFLICT DO NOTHING;  -- print_jobs_idem_uq (expression index: no inference)
  GET DIAGNOSTICS n = ROW_COUNT;
  v_dup := (n = 0);  -- 0 rows inserted → idempotent duplicate
  SELECT * INTO v_job FROM print_jobs
   WHERE location_id = v_loc AND doc_type = p_doc_type
     AND COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_order_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND trigger_key = trim(p_trigger_key);
  IF v_job IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job lookup failed');
  END IF;

  IF NOT v_dup THEN
    PERFORM log_audit('print_enqueue', 'print_job', v_job.id::text,
      p_staff_id, v_actor, NULL,
      jsonb_build_object('job', v_job.id, 'doc_type', p_doc_type,
        'order_id', p_order_id, 'trigger', p_trigger_key, 'device', v_dev.name),
      NULL, NULL);
  END IF;

  RETURN jsonb_build_object('success', true, 'routed', true,
    'duplicate', v_dup,
    'job', jsonb_build_object('id', v_job.id, 'status', v_job.status,
      'device', jsonb_build_object('id', v_dev.id, 'name', v_dev.name,
        'iface', v_dev.iface)));
END;
$function$;

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
  )
  UPDATE print_jobs j
     SET status = 'claimed', claimed_by = p_terminal_id, claimed_at = now(),
         updated_at = now()
    FROM picked WHERE j.id = picked.id
    RETURNING j.id INTO v_claimed;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'doc_type', j.doc_type, 'order_id', j.order_id,
        'trigger_key', j.trigger_key, 'payload', j.payload,
        'staff_name', j.staff_name,
        'device', _print_device_json(d))
      ORDER BY j.created_at), '[]'::jsonb)
      FROM print_jobs j
      JOIN print_devices d ON d.id = j.device_id
     WHERE j.id = ANY(coalesce(v_claimed, ARRAY[]::uuid[]))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_result(
  p_job_id uuid, p_claimer text, p_success boolean, p_error text, p_from_agent boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_job print_jobs;
BEGIN
  SELECT * INTO v_job FROM print_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;
  IF v_job.status <> 'claimed' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Job is ' || v_job.status || ' (result only valid on claimed)');
  END IF;
  IF NOT p_from_agent AND v_job.claimed_by IS DISTINCT FROM p_claimer THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your claimed job');
  END IF;

  UPDATE print_jobs SET
    status = CASE WHEN p_success THEN 'printed' ELSE 'failed' END,
    printed_at = CASE WHEN p_success THEN now() ELSE NULL END,
    error = CASE WHEN p_success THEN NULL ELSE coalesce(p_error, 'print failed') END,
    updated_at = now()
  WHERE id = p_job_id;

  IF p_from_agent THEN
    UPDATE print_devices SET
      last_seen_at = now(), online = enabled,
      last_error = CASE WHEN p_success THEN NULL ELSE coalesce(p_error, 'print failed') END
    WHERE id = v_job.device_id;
  END IF;

  PERFORM log_audit('print_result', 'print_job', v_job.id::text,
    NULL, NULL,
    jsonb_build_object('status', 'claimed'),
    jsonb_build_object('status', CASE WHEN p_success THEN 'printed' ELSE 'failed' END,
      'error', CASE WHEN p_success THEN NULL ELSE coalesce(p_error, 'print failed') END),
    jsonb_build_object('from_agent', p_from_agent, 'device', v_job.device_id), NULL);

  RETURN jsonb_build_object('success', true, 'job', jsonb_build_object(
    'id', v_job.id,
    'status', CASE WHEN p_success THEN 'printed' ELSE 'failed' END));
END;
$function$;

-- agent entry point: key auth + heartbeat + device-scoped claim
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
  )
  UPDATE print_jobs j
     SET status = 'claimed', claimed_by = 'agent:' || v_dev.name, claimed_at = now(),
         updated_at = now()
    FROM picked WHERE j.id = picked.id
    RETURNING j.id INTO v_claimed;

  RETURN jsonb_build_object('success', true, 'enabled', true,
    'device', _print_device_json(v_dev),
    'jobs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', j.id, 'doc_type', j.doc_type, 'order_id', j.order_id,
          'trigger_key', j.trigger_key, 'payload', j.payload,
          'staff_name', j.staff_name)
        ORDER BY j.created_at), '[]'::jsonb)
        FROM print_jobs j
       WHERE j.id = ANY(coalesce(v_claimed, ARRAY[]::uuid[]))
    ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.print_queue_counts(p_location_id uuid, p_terminal_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = 'public'
AS $function$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'queued', (SELECT count(*) FROM print_jobs WHERE location_id = p_location_id AND status = 'queued'),
      'claimed_mine', (SELECT count(*) FROM print_jobs
                        WHERE location_id = p_location_id
                          AND status = 'claimed' AND claimed_by = p_terminal_id))
  );
END;
$function$;

-- ── EXECUTE grants (quirk (f): default privileges) ──────────────────────────
REVOKE ALL ON FUNCTION public._print_device_json(print_devices) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._print_requeue_stale(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_device_upsert(uuid, text, text[], text, text, integer, text, integer, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_device_patch(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_device_list(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_device_delete(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_device_rotate_key(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_enqueue(uuid, text, uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_claim(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_result(uuid, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_agent_poll(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_queue_counts(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._print_device_json(print_devices) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_device_upsert(uuid, text, text[], text, text, integer, text, integer, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_device_patch(uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_device_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_device_delete(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_device_rotate_key(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_enqueue(uuid, text, uuid, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_claim(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_result(uuid, text, boolean, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_agent_poll(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_queue_counts(uuid, text) TO service_role;

COMMIT;
