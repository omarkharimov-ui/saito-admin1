-- W-A1 M1 rollback (reverse order of apply; W_A1_PLAN.md §5)
BEGIN;

REVOKE EXECUTE ON FUNCTION public.guest_link_customer(text, text) FROM authenticated, service_role;
DROP FUNCTION IF EXISTS public.guest_link_customer(text, text);
DROP INDEX IF EXISTS customers_phone_uq;

COMMIT;
