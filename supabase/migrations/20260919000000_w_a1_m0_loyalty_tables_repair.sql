-- W-A1 M0: REPAIR — recreate loyalty_transactions + loyalty_order_points
--
-- ANOMALY (discovered during W-A1 audit, 2026-09-19):
--   P-7 cclass_drop (20260914000006, ratified 2026-09-14) dropped these two
--   tables as "32 empty, zero-reference". The ref-scan MISSED the live
--   SECURITY INVOKER function bodies that INSERT/SELECT into them:
--     loyalty_earn      -> INSERT INTO public.loyalty_order_points (per-item snapshot)
--     _loyalty_post     -> INSERT INTO public.loyalty_transactions (ledger)
--     loyalty_reverse   -> SELECT loyalty_order_points / INSERT loyalty_transactions
--   Consequence in production (silent, since 2026-09-14):
--     * orders.status -> 'paid' fires trg_order_loyalty_spine -> loyalty_earn
--       -> INSERT fails (42P01 undefined_table) -> caught by the spine's
--         EXCEPTION WHEN OTHERS -> RAISE NOTICE => earn SILENTLY SKIPPED.
--     * orders.loyalty_points_earned never set; loyalty_ensure_account never
--       reached; no account/points/ledger ever created (loyalty_accounts = 0).
--     * Customer stats (total_visits/total_spent) still worked (separate
--       EXCEPTION block in the spine — verified in _trg_order_loyalty_spine src).
--   Why no gate caught it: no frozen gate asserts points-earned > 0 on paid
--   (O gate CC2 asserts order_payments cash only). The W-A1 gate is the first
--   gate to exercise the earn path end-to-end.
--
-- Fix (delegated GO, W_A1_PLAN.md §5 D9): restore both tables VERBATIM from
--   * baseline_live_schema_2026-09-14.sql (pre-drop live dump) for
--     loyalty_transactions (incl. RLS + service_full_loyalty_transactions
--     policy, FKs, indexes, comment) and
--   * 20260910000009_loyalty_points_snapshot.sql for loyalty_order_points.
--   Grants: service_role only (app path = triggers firing under service_role;
--   functions are SECURITY INVOKER). anon/authenticated: none.
--
-- Preflight: .w-a1-audit/w_a1_m0_preflight_out.txt
--   (both tables absent, 4 referencing fns, loyalty_accounts present,
--    svc rolbypassrls=true)
-- Red lines held: no existing-row changes (both tables were empty when dropped;
-- 0 rows lost), no trigger/function changes, no FK additions to other tables.

BEGIN;

-- ── 1. loyalty_transactions (verbatim from baseline_live_schema_2026-09-14.sql) ──
CREATE TABLE public.loyalty_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    type character varying(30) NOT NULL,
    points integer NOT NULL,
    balance_after integer NOT NULL,
    reference_type character varying(50),
    reference_id uuid,
    reason text,
    performed_by uuid,
    correlation_id uuid,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loyalty_transactions_type_check CHECK (((type)::text = ANY ((ARRAY['earn'::character varying, 'redeem'::character varying, 'adjustment'::character varying, 'expire'::character varying, 'reversal'::character varying])::text[])))
);
COMMENT ON TABLE public.loyalty_transactions IS 'Loyalty ledger per 0.1.14. Every balance change is a ledger entry.';

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);
CREATE INDEX idx_loyalty_account ON public.loyalty_transactions USING btree (account_id, created_at DESC);
CREATE UNIQUE INDEX idx_loyalty_idempotency ON public.loyalty_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.staff(id);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_full_loyalty_transactions ON public.loyalty_transactions TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.loyalty_transactions TO service_role;

-- ── 2. loyalty_order_points (verbatim from 20260910000009_loyalty_points_snapshot.sql) ──
CREATE TABLE IF NOT EXISTS public.loyalty_order_points (
  order_item_id      uuid PRIMARY KEY,   -- one row per item ever earned
  order_id           uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL,
  points_earned      integer NOT NULL,
  quantity_at_earn   integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_order_points_order ON public.loyalty_order_points(order_id);
GRANT SELECT, INSERT ON public.loyalty_order_points TO service_role;

COMMIT;
