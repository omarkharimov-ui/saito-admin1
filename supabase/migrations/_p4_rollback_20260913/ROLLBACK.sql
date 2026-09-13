-- P-4 ROLLBACK (reverse of 20260913000001). Restores PRE-state functions + schema.
BEGIN;
DROP FUNCTION IF EXISTS public.prune_expired_idempotency_keys();
\i complete_payment_atomic_v2_PRE.sql
\i refund_with_inventory_PRE.sql
ALTER TABLE public.payment_idempotency_keys DROP CONSTRAINT IF EXISTS payment_idempotency_keys_ns_key_pkey;
ALTER TABLE public.payment_idempotency_keys ADD PRIMARY KEY (key);
ALTER TABLE public.payment_idempotency_keys DROP COLUMN IF EXISTS expires_at;
ALTER TABLE public.payment_idempotency_keys DROP COLUMN IF EXISTS namespace;
COMMIT;
