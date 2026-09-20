-- 20260920000006 — drop dead onboarding RPCs (complete 09-14 C-class decision)
--
-- EVIDENCE / PROVENANCE (live, 2026-09-20):
--   * PRE_P7_SCHEMA_REALITY_AUDIT_2026-09-14: onboarding_tasks(0),
--     onboarding_workflows(0) — class B, "empty, only referenced by legacy DB fns".
--   * PRE_P7 addendum: DROPPED by migration 20260914000006 (child-first, 32 tables)
--     — onboarding_tasks among the C2C children, onboarding_workflows standalone.
--   * LIVE PROBE (2026-09-20): get_onboarding_status() →
--     ERROR: relation "onboarding_workflows" does not exist. All 3 RPCs broken.
--   * App residue (never cleaned): /api/onboarding route (NO auth — Rule 10 gap)
--     + staff page "Onboarding" tab (renders "No onboarding started" + a
--     dead Start button; errors swallowed by the component).
--
-- DECISION: the data plane was intentionally dropped on 09-14 (audited). The
-- RPCs are unreachable-in-function; dropping them completes that decision.
-- The app-side residue (route + UI tab) is removed in the same commit.
-- Daily operating checklists (map §21 J) will be a NEW vertical
-- (checklist_templates/checklist_runs/checklist_run_items) — NOT a revival of
-- onboarding (not in the ratified roadmap).

BEGIN;

DROP FUNCTION IF EXISTS public.start_onboarding(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_onboarding_status(uuid);
DROP FUNCTION IF EXISTS public.complete_onboarding_task(uuid, uuid);

COMMIT;
