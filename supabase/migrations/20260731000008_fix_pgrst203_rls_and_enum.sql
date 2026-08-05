-- Fix PGRST203: drop the no-performer overload of cancel_table_orders
-- PostgREST cannot disambiguate between the two overloads when p_performed_by is omitted.
DROP FUNCTION IF EXISTS public.cancel_table_orders(integer);

-- Fix RLS: remove anonymous delete/insert on table_floors
-- Only service_role and authenticated staff should mutate table state.
DROP POLICY IF EXISTS anon_delete ON public.table_floors;
DROP POLICY IF EXISTS anon_insert ON public.table_floors;

-- Fix sessions policy: restrict to service_role so anon cannot read session tokens
DROP POLICY IF EXISTS "Service role manages sessions" ON public.sessions;
CREATE POLICY "Service role manages sessions" ON public.sessions
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix reservation status enum: add archived/expired to match frontend types
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'seated'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'archived'::text, 'expired'::text]));
