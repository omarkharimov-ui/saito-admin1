-- W-A2 rollback: drop the additive surface. Pre-existing data untouched.
-- (Orders created with a token hash simply lose the column — no other object
-- depends on it.)
REVOKE EXECUTE ON FUNCTION public.qr_add_items(text, int, jsonb, text) FROM service_role;
DROP FUNCTION IF EXISTS public.qr_add_items(text, int, jsonb, text);
DROP INDEX IF EXISTS idx_orders_qr_check_token;
ALTER TABLE orders DROP COLUMN IF EXISTS qr_check_token_hash;
