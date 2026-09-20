-- 20260920000010 — W-A5 checklists: note-only item update (ck v1.1)
--
-- EVIDENCE (live, 2026-09-20, real-mouse E2E round 1 — finding #1, HIGH):
--   * checklist_toggle_item() rejects p_completed=true when the RUN is already
--     completed ('Run already completed') — by design (gate C18: re-check is a
--     no-op state-wise, must stay 400).
--   * The note payload is only writable through the toggle RPC — there is no
--     note-only path. The UI "Qeyd əlavə et" on a completed item therefore
--     re-sends completed:true → 400 → the note is silently lost (optimistic
--     rollback).
--
-- FIX (additive — frozen toggle contract UNTOUCHED, C18 unchanged):
--   New SECURITY DEFINER fn checklist_set_item_note(p_item_id, p_note, p_staff_id)
--   = note-only update. Allowed on pending / in_progress / completed runs,
--   rejected on skipped runs ('Run is skipped — unskip first' — consistent
--   with the toggle guard). Empty/whitespace note → NULL (toggle semantics).
--   Own audit action 'checklist_item_note'.
--   EXECUTE = {postgres, service_role} only — house quirk (f): default
--   privileges grant anon+authenticated on new objects → explicit REVOKE pair
--   (PUBLIC + anon + authenticated); gate C28's checklist_% OID sweep covers
--   the new fn automatically.
BEGIN;

CREATE OR REPLACE FUNCTION public.checklist_set_item_note(p_item_id uuid, p_note text, p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.checklist_run_items%ROWTYPE;
  v_run public.checklist_runs%ROWTYPE;
  v_old_note text;
  v_new_note text;
  v_performer_name text;
BEGIN
  SELECT * INTO v_item FROM public.checklist_run_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item not found');
  END IF;
  SELECT * INTO v_run FROM public.checklist_runs WHERE id = v_item.run_id FOR UPDATE;
  IF v_run.status = 'skipped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run is skipped — unskip first', 'run_id', v_run.id);
  END IF;

  v_old_note := v_item.note;
  v_new_note := CASE WHEN p_note IS NULL OR trim(p_note) = '' THEN NULL ELSE trim(p_note) END;

  UPDATE public.checklist_run_items SET note = v_new_note WHERE id = p_item_id;

  IF p_staff_id IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_staff_id;
  END IF;
  PERFORM public.log_audit(
    'checklist_item_note', 'checklist_run', v_run.id::text,
    p_staff_id, v_performer_name,
    jsonb_build_object('item', v_item.title, 'note', v_old_note, 'run_status', v_run.status),
    jsonb_build_object('item', v_item.title, 'note', v_new_note),
    jsonb_build_object('item_id', v_item.id), NULL
  );

  RETURN jsonb_build_object('success', true, 'item', jsonb_build_object(
    'id', v_item.id, 'title', v_item.title, 'note', v_new_note
  ));
END;
$function$;

REVOKE ALL ON FUNCTION public.checklist_set_item_note(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checklist_set_item_note(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checklist_set_item_note(uuid, text, uuid) TO service_role;

COMMIT;
