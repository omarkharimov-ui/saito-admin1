-- Rollback for 20260920000010_w_a5_ck_item_note.sql (ck v1.1)
-- Data notes: item notes written via checklist_set_item_note remain in
-- checklist_run_items.note (column untouched — no data migration).
BEGIN;

REVOKE EXECUTE ON FUNCTION public.checklist_set_item_note(uuid, text, uuid) FROM service_role;
DROP FUNCTION IF EXISTS public.checklist_set_item_note(uuid, text, uuid);

COMMIT;
