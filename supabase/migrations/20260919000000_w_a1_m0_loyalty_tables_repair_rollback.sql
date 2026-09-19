-- W-A1 M0 rollback (reverse; both tables are empty at repair time — 0 rows lost)
BEGIN;
DROP POLICY IF EXISTS service_full_loyalty_transactions ON public.loyalty_transactions;
DROP TABLE IF EXISTS public.loyalty_transactions;
DROP TABLE IF EXISTS public.loyalty_order_points;
COMMIT;
