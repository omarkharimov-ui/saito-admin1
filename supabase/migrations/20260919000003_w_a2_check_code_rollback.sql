-- W-A2 D18 rollback: drop the additive surface. Pre-existing data untouched.
REVOKE EXECUTE ON FUNCTION public.qr_relink_check(text, int, text, text) FROM service_role;
DROP FUNCTION IF EXISTS public.qr_relink_check(text, int, text, text);
DROP INDEX IF EXISTS idx_orders_qr_check_code;
ALTER TABLE orders DROP COLUMN IF EXISTS qr_check_code_hash;
