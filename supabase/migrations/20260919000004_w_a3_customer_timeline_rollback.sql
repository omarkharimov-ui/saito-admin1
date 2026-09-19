-- W-A3 rollback: drop the additive read-only function.
REVOKE EXECUTE ON FUNCTION public.get_customer_timeline(uuid, int) FROM service_role;
DROP FUNCTION IF EXISTS public.get_customer_timeline(uuid, int);
