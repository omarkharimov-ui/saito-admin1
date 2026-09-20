-- Rollback for 20260920000015 (upsell v1) — pure read function, no data.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.suggest_addons(uuid[], integer) FROM service_role;
DROP FUNCTION IF EXISTS public.suggest_addons(uuid[], integer);
COMMIT;
