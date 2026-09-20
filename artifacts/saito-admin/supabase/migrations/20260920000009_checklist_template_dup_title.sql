-- 20260920000009 — checklist_upsert_template: explicit duplicate-title guard
--
-- EVIDENCE: the UNIQUE index checklist_templates_title_uq (lower(title)) is
-- a backstop, but hitting it in the INSERT branch raises unique_violation →
-- PostgREST 500 (ugly + un-audited). Gate C5 requires a clean 400 contract.
BEGIN;

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
    IF EXISTS (SELECT 1 FROM public.checklist_templates WHERE lower(title) = lower(v_norm_title)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Template with this title already exists');
    END IF;
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

REVOKE ALL ON FUNCTION public.checklist_upsert_template(uuid, text, text, jsonb, time, text, boolean, uuid) FROM anon, authenticated;

COMMIT;
