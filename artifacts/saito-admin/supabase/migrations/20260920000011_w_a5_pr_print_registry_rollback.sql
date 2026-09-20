-- Rollback for 20260920000011_w_a5_pr_print_registry.sql (pr v1)
-- Data notes: print_jobs deleted with devices (no production prints yet —
-- v1 ships greenfield; if any jobs exist, they are lost on rollback).
BEGIN;

DROP FUNCTION IF EXISTS public.print_queue_counts(uuid, text);
DROP FUNCTION IF EXISTS public.print_agent_poll(text, integer);
DROP FUNCTION IF EXISTS public.print_result(uuid, text, boolean, text, boolean);
DROP FUNCTION IF EXISTS public.print_claim(uuid, text, integer);
DROP FUNCTION IF EXISTS public.print_enqueue(uuid, text, uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.print_device_rotate_key(uuid, uuid);
DROP FUNCTION IF EXISTS public.print_device_delete(uuid, uuid);
DROP FUNCTION IF EXISTS public.print_device_list(uuid);
DROP FUNCTION IF EXISTS public.print_device_patch(uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.print_device_upsert(uuid, text, text[], text, text, integer, text, integer, boolean, uuid);
DROP FUNCTION IF EXISTS public._print_requeue_stale(uuid, uuid);
DROP FUNCTION IF EXISTS public._print_device_json(print_devices);

DROP TABLE IF EXISTS public.print_jobs;
DROP TABLE IF EXISTS public.print_devices;

COMMIT;
