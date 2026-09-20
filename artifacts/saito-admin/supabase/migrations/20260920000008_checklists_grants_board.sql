-- 20260920000008 — checklists: table/function grants fix + self-refreshing board
--
-- EVIDENCE (live, 2026-09-20, after 000007):
--   * Supabase default privileges grant anon+authenticated arwdDxtm on NEW
--     tables: checklist_templates/runs/run_items → anon could INSERT/UPDATE/
--     DELETE checklist rows via PostgREST, bypassing all RPC/audit layers
--     (Rule 10 security chain broken).
--   * PRE-EXISTING GAP (disclosure): gift_cards re-acl = anon=rm (SELECT +
--     REFERENCES), rls=false → any unauthenticated client could list all
--     card codes / balances / holder names. The 000001 gate (G20) only
--     covered the ledger table.
--   * 000007 function REVOKEs covered PUBLIC only; explicit anon/authenticated
--     EXECUTE grants survived (same quirk as 000002 — fixed there by the
--     two-line revoke pair; mirrored here).
--   * pg_cron is unreachable via the pooler (INSERT cron.job → permission
--     denied; cron.job_add not visible) → recurrence implemented as
--     LAZY materialization inside checklist_board() (idempotent: UNIQUE
--     (template_id, run_date) + ON CONFLICT DO NOTHING). checklist_materialize_due()
--     stays available for a future cron job.
--
-- FIX (mirrors gift_card_ledger: rls on + service-only policy + no anon/auth):
BEGIN;

REVOKE ALL ON TABLE public.checklist_templates, public.checklist_runs, public.checklist_run_items
  FROM anon, authenticated;
REVOKE ALL ON TABLE public.gift_cards FROM anon;

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_full_checklist_templates ON public.checklist_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_full_checklist_runs ON public.checklist_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_full_checklist_run_items ON public.checklist_run_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public._checklist_normalize_items(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_upsert_template(uuid, text, text, jsonb, time, text, boolean, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_create_run(text, text, jsonb, uuid, date, timestamptz, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_toggle_item(uuid, boolean, text, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_assign_run(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_skip_run(uuid, text, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_board(date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.checklist_materialize_due() FROM anon, authenticated;

-- Self-refreshing board: materialize due daily templates, then render.
-- (Read endpoint with a documented side effect — idempotent, no cron needed.)
CREATE OR REPLACE FUNCTION public.checklist_board(p_date date)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_date IS NULL OR p_date = current_date THEN
    PERFORM public.checklist_materialize_due();
  END IF;

  RETURN (
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
    ) x
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checklist_board(date) FROM anon, authenticated;

COMMIT;
