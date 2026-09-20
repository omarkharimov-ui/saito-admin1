-- 20260920000007 — Daily operating checklists (map §21 J, Wave A #5)
--
-- SCOPE (v1, ratified roadmap "daily checklists"): opening/closing/cleaning/
-- manager/maintenance checklists; assignment; due time; completion; proof
-- (note per item); recurring (daily + manual). Weekly recurrence = FOLLOW-UP.
--
-- PATTERN: onboarding precedent (workflow → tasks → completion) applied as a
-- clean vertical — onboarding itself was dead legacy (tables dropped 09-14
-- C-class, RPCs dropped by 20260920000006). NOT a revival.
--
-- HOUSE STYLE (mirrors gift_cards vertical, 20260920000001):
--   * no org column (single-org deployment), RLS off, access ONLY through
--     SECURITY DEFINER RPCs called by service_role from authed routes
--   * every mutating RPC: FOR UPDATE lock, state guard, log_audit (9-arg)
--   * REVOKE EXECUTE FROM PUBLIC on every function (Supabase default quirk)
--
-- RECURRENCE: pg_cron job 'checklist-daily' (*/5 min) calls
-- checklist_materialize_due(); idempotency = UNIQUE (template_id, run_date)
-- + ON CONFLICT DO NOTHING (NULL-safe for manual runs).

BEGIN;

-- ── tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('opening','closing','cleaning','manager','maintenance')),
  items jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
  scheduled_at time,
  recurring text NOT NULL DEFAULT 'manual' CHECK (recurring IN ('daily','manual')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_templates_title_uq
  ON public.checklist_templates (lower(title));

CREATE TABLE IF NOT EXISTS public.checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('opening','closing','cleaning','manager','maintenance')),
  run_date date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('template','manual')),
  assigned_to uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- idempotent daily materialization (NULL template_id = manual → unconstrained)
  UNIQUE (template_id, run_date)
);
CREATE INDEX IF NOT EXISTS checklist_runs_date_status_idx
  ON public.checklist_runs (run_date, status);

CREATE TABLE IF NOT EXISTS public.checklist_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  completed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_run_items_run_idx
  ON public.checklist_run_items (run_id, sort_order);

-- ── item normalization helper (shared validation) ───────────────────────────

CREATE OR REPLACE FUNCTION public._checklist_normalize_items(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_out jsonb := '[]';
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array';
  END IF;
  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'items must contain 1..50 entries';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'each item must be an object';
      END IF;
      IF trim(coalesce(v_item->>'title','')) = '' THEN
        RAISE EXCEPTION 'item title required';
      END IF;
      IF char_length(trim(v_item->>'title')) > 200 THEN
        RAISE EXCEPTION 'item title too long (max 200)';
      END IF;
      v_out := v_out || jsonb_build_object(
        'title', trim(v_item->>'title'),
        'note', coalesce(trim(v_item->>'note'), '')
      );
    END;
  END LOOP;
  RETURN v_out;
END;
$$;

-- ── templates ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.checklist_upsert_template(
  p_id uuid, p_title text, p_category text, p_items jsonb,
  p_scheduled_at time, p_recurring text, p_is_active boolean, p_staff_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_norm_title text;
  v_norm_items jsonb;
  v_row public.checklist_templates%ROWTYPE;
  v_performer_name text;
  v_old public.checklist_templates%ROWTYPE;
BEGIN
  v_norm_title := trim(coalesce(p_title,''));
  IF v_norm_title = '' OR char_length(v_norm_title) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template title required (1..120)');
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('opening','closing','cleaning','manager','maintenance') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid category (opening/closing/cleaning/manager/maintenance)');
  END IF;
  IF p_recurring IS NOT NULL AND p_recurring <> '' AND p_recurring NOT IN ('daily','manual') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid recurring (daily/manual)');
  END IF;
  BEGIN
    v_norm_items := public._checklist_normalize_items(p_items);
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  IF p_recurring IS NULL OR p_recurring = '' THEN p_recurring := 'manual'; END IF;
  IF p_is_active IS NULL THEN p_is_active := true; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.checklist_templates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Template not found');
    END IF;
    UPDATE public.checklist_templates SET
      title = v_norm_title, category = p_category, items = v_norm_items,
      scheduled_at = p_scheduled_at, recurring = p_recurring,
      is_active = p_is_active, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.checklist_templates
      (title, category, items, scheduled_at, recurring, is_active, created_by)
    VALUES
      (v_norm_title, p_category, v_norm_items, p_scheduled_at, p_recurring, p_is_active, p_staff_id)
    RETURNING * INTO v_row;
  END IF;

  IF p_staff_id IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_staff_id;
  END IF;
  PERFORM public.log_audit(
    'checklist_template_' || CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,
    'checklist_template', v_row.id::text,
    p_staff_id, v_performer_name,
    CASE WHEN p_id IS NULL THEN NULL ELSE jsonb_build_object('title', v_old.title, 'category', v_old.category, 'items', v_old.items, 'recurring', v_old.recurring, 'is_active', v_old.is_active) END,
    jsonb_build_object('title', v_row.title, 'category', v_row.category, 'items', v_row.items, 'recurring', v_row.recurring, 'scheduled_at', v_row.scheduled_at, 'is_active', v_row.is_active),
    NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'template', jsonb_build_object(
    'id', v_row.id, 'title', v_row.title, 'category', v_row.category,
    'items', v_row.items, 'scheduled_at', v_row.scheduled_at,
    'recurring', v_row.recurring, 'is_active', v_row.is_active
  ));
END;
$$;

-- ── runs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.checklist_create_run(
  p_title text, p_category text, p_items jsonb,
  p_assigned_to uuid, p_run_date date, p_due_at timestamptz, p_staff_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_norm_title text;
  v_norm_items jsonb;
  v_item jsonb;
  v_run public.checklist_runs%ROWTYPE;
  v_performer_name text;
BEGIN
  v_norm_title := trim(coalesce(p_title,''));
  IF v_norm_title = '' OR char_length(v_norm_title) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run title required (1..120)');
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('opening','closing','cleaning','manager','maintenance') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid category (opening/closing/cleaning/manager/maintenance)');
  END IF;
  BEGIN
    v_norm_items := public._checklist_normalize_items(p_items);
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  IF p_run_date IS NULL THEN p_run_date := current_date; END IF;

  INSERT INTO public.checklist_runs
    (title, category, run_date, source, assigned_to, due_at, created_by)
  VALUES
    (v_norm_title, p_category, p_run_date, 'manual', p_assigned_to, p_due_at, p_staff_id)
  RETURNING * INTO v_run;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_norm_items) LOOP
    INSERT INTO public.checklist_run_items (run_id, title, sort_order, note)
    VALUES (v_run.id, v_item->>'title', GREATEST((SELECT count(*) FROM public.checklist_run_items WHERE run_id = v_run.id), 0),
            CASE WHEN coalesce(trim(v_item->>'note'),'') = '' THEN NULL ELSE trim(v_item->>'note') END);
  END LOOP;

  IF p_staff_id IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_staff_id;
  END IF;
  PERFORM public.log_audit(
    'checklist_run_create', 'checklist_run', v_run.id::text,
    p_staff_id, v_performer_name,
    NULL,
    jsonb_build_object('title', v_run.title, 'category', v_run.category, 'run_date', v_run.run_date, 'items', jsonb_array_length(v_norm_items)),
    NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'run', jsonb_build_object(
    'id', v_run.id, 'title', v_run.title, 'category', v_run.category,
    'run_date', v_run.run_date, 'status', v_run.status,
    'items_total', jsonb_array_length(v_norm_items)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.checklist_toggle_item(
  p_item_id uuid, p_completed boolean, p_note text, p_staff_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item public.checklist_run_items%ROWTYPE;
  v_run public.checklist_runs%ROWTYPE;
  v_done int; v_total int;
  v_old_status text;
  v_new_status text;
  v_performer_name text;
BEGIN
  SELECT * INTO v_item FROM public.checklist_run_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item not found');
  END IF;
  SELECT * INTO v_run FROM public.checklist_runs WHERE id = v_item.run_id FOR UPDATE;
  IF v_run.status = 'completed' AND p_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run already completed', 'run_id', v_run.id);
  END IF;
  IF v_run.status = 'skipped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run is skipped — unskip first', 'run_id', v_run.id);
  END IF;

  UPDATE public.checklist_run_items SET
    completed = p_completed,
    completed_by = CASE WHEN p_completed THEN p_staff_id ELSE NULL END,
    completed_at = CASE WHEN p_completed THEN now() ELSE NULL END,
    note = CASE WHEN p_note IS NULL OR trim(p_note) = '' THEN NULL ELSE trim(p_note) END
  WHERE id = p_item_id;

  SELECT count(*) FILTER (WHERE completed), count(*)
    INTO v_done, v_total FROM public.checklist_run_items WHERE run_id = v_run.id;

  v_old_status := v_run.status;
  IF v_done = v_total THEN
    v_new_status := 'completed';
  ELSIF v_done > 0 THEN
    v_new_status := 'in_progress';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.checklist_runs SET
    status = v_new_status,
    started_at = CASE WHEN v_new_status IN ('in_progress','completed') THEN coalesce(v_run.started_at, now()) ELSE NULL END,
    completed_at = CASE WHEN v_new_status = 'completed' THEN coalesce(v_run.completed_at, now()) ELSE NULL END,
    updated_at = now()
  WHERE id = v_run.id;

  IF p_staff_id IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_staff_id;
  END IF;
  PERFORM public.log_audit(
    'checklist_item_toggle', 'checklist_run', v_run.id::text,
    p_staff_id, v_performer_name,
    jsonb_build_object('item', v_item.title, 'completed', v_item.completed, 'run_status', v_old_status),
    jsonb_build_object('item', v_item.title, 'completed', p_completed, 'run_status', v_new_status, 'done', v_done, 'total', v_total),
    jsonb_build_object('item_id', v_item.id), NULL
  );

  RETURN jsonb_build_object('success', true, 'run', jsonb_build_object(
    'id', v_run.id, 'status', v_new_status, 'items_done', v_done, 'items_total', v_total
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.checklist_assign_run(
  p_run_id uuid, p_staff_id uuid, p_performed_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run public.checklist_runs%ROWTYPE;
  v_performer_name text;
BEGIN
  SELECT * INTO v_run FROM public.checklist_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run not found');
  END IF;
  IF v_run.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run already completed');
  END IF;
  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Assigned staff not found');
    END IF;
  END IF;

  UPDATE public.checklist_runs SET assigned_to = p_staff_id, updated_at = now() WHERE id = p_run_id;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;
  PERFORM public.log_audit(
    'checklist_run_assign', 'checklist_run', v_run.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('assigned_to', v_run.assigned_to),
    jsonb_build_object('assigned_to', p_staff_id),
    NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'run', jsonb_build_object(
    'id', v_run.id, 'assigned_to', p_staff_id, 'status', v_run.status
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.checklist_skip_run(
  p_run_id uuid, p_reason text, p_performed_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run public.checklist_runs%ROWTYPE;
  v_new_status text;
  v_performer_name text;
BEGIN
  SELECT * INTO v_run FROM public.checklist_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run not found');
  END IF;
  IF v_run.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run already completed — cannot skip');
  END IF;
  IF v_run.status = 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run already started — complete or reassign instead');
  END IF;

  -- pending → skipped ; skipped → pending (unskip, reason cleared)
  v_new_status := CASE WHEN v_run.status = 'skipped' THEN 'pending' ELSE 'skipped' END;

  UPDATE public.checklist_runs SET
    status = v_new_status,
    skipped_reason = CASE WHEN v_new_status = 'skipped' THEN coalesce(trim(p_reason), '—') ELSE NULL END,
    updated_at = now()
  WHERE id = p_run_id;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;
  PERFORM public.log_audit(
    'checklist_run_' || v_new_status, 'checklist_run', v_run.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('status', v_run.status),
    jsonb_build_object('status', v_new_status, 'reason', coalesce(trim(p_reason), '')),
    NULL, NULL
  );

  RETURN jsonb_build_object('success', true, 'run', jsonb_build_object(
    'id', v_run.id, 'status', v_new_status, 'skipped_reason', coalesce(trim(p_reason), '')
  ));
END;
$$;

-- ── board (read) ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.checklist_board(p_date date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY
    CASE row->>'status' WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'skipped' THEN 2 ELSE 3 END,
    row->>'category', row->>'title'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'title', r.title, 'category', r.category, 'run_date', r.run_date,
      'source', r.source, 'template_id', r.template_id,
      'status', r.status,
      'assigned_to', r.assigned_to,
      'assigned_name', coalesce(s.name, ''),
      'due_at', r.due_at, 'started_at', r.started_at, 'completed_at', r.completed_at,
      'skipped_reason', r.skipped_reason,
      'items_total', coalesce(tot.n, 0),
      'items_done', coalesce(tot.d, 0),
      'overdue', (r.status IN ('pending','in_progress') AND r.due_at IS NOT NULL AND r.due_at < now())
    ) AS row
    FROM public.checklist_runs r
    LEFT JOIN public.staff s ON s.id = r.assigned_to
    LEFT JOIN (
      SELECT run_id, count(*) AS n, count(*) FILTER (WHERE completed) AS d
      FROM public.checklist_run_items GROUP BY run_id
    ) tot ON tot.run_id = r.id
    WHERE r.run_date = coalesce(p_date, current_date)
  ) x;
$$;

-- ── recurrence materializer (pg_cron target) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.checklist_materialize_due()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t public.checklist_templates%ROWTYPE;
  v_item jsonb;
  v_created int := 0;
  v_run_id uuid;
BEGIN
  FOR v_t IN
    SELECT * FROM public.checklist_templates
    WHERE is_active AND recurring = 'daily'
      AND (scheduled_at IS NULL OR now()::time >= scheduled_at)
    ORDER BY id
  LOOP
    BEGIN
      INSERT INTO public.checklist_runs (template_id, title, category, run_date, source)
      VALUES (v_t.id, v_t.title, v_t.category, current_date, 'template')
      ON CONFLICT (template_id, run_date) DO NOTHING
      RETURNING id INTO v_run_id;

      IF FOUND THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_t.items) LOOP
          INSERT INTO public.checklist_run_items (run_id, title, sort_order, note)
          VALUES (v_run_id, v_item->>'title', GREATEST((SELECT count(*) FROM public.checklist_run_items WHERE run_id = v_run_id), 0),
                  CASE WHEN coalesce(trim(v_item->>'note'),'') = '' THEN NULL ELSE trim(v_item->>'note') END);
        END LOOP;
        v_created := v_created + 1;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- concurrent materialization — safe
    END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'date', current_date);
END;
$$;

-- ── privileges (Supabase default EXECUTE TO PUBLIC — always revoke) ─────────

REVOKE EXECUTE ON FUNCTION public._checklist_normalize_items(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_upsert_template(uuid, text, text, jsonb, time, text, boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_create_run(text, text, jsonb, uuid, date, timestamptz, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_toggle_item(uuid, boolean, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_assign_run(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_skip_run(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_board(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checklist_materialize_due() FROM PUBLIC;

COMMIT;

-- ── cron job (outside txn; idempotent by jobname) ───────────────────────────

INSERT INTO cron.job (schedule, command, jobname)
SELECT '*/5 * * * *', 'SELECT public.checklist_materialize_due();', 'checklist-daily'
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'checklist-daily');
