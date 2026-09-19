-- W-A1 M1: guest channel foundation
--   1) customers_phone_uq — UNIQUE partial index on customers.phone
--   2) guest_link_customer(p_phone, p_name) — service-role-only find-or-create RPC
--
-- Decision log: W_A1_PLAN.md §5 (owner delegated GO 2026-09-19).
-- Preflight evidence: .w-a1-audit/w_a1_preflight_out.txt
--   (0 duplicate phones, 0 NULL phones, 0 orphan orders.customer_id,
--    tables 410-430 free, loyalty_product_rules=0, loyalty_accounts=0,
--    settings.loyalty_enabled=true)
--
-- Red lines held: no trigger changes, no FK changes, no existing-row rewrites
-- (D3), no settings writes, G3 contract unchanged (phone-less path is identical).

BEGIN;

-- 1) Unique partial index on phone. Proven safe: 0 duplicate + 0 NULL phones (preflight).
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uq
  ON customers (phone)
  WHERE phone IS NOT NULL;

-- 2) Guest find-or-create. Atomic; deterministic winner on concurrent same-phone
--    creates via the unique index (unique_violation -> re-find).
CREATE OR REPLACE FUNCTION public.guest_link_customer(p_phone text, p_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_row  public.customers%ROWTYPE;
BEGIN
  v_norm := translate(p_phone, ' -', '');
  IF v_norm !~ '^\+?[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'GUEST_LINK_BAD_PHONE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.customers WHERE phone = v_norm FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('customer_id', v_row.id, 'created', false,
                              'phone', v_row.phone, 'name', v_row.name);
  END IF;

  BEGIN
    -- D10: explicit 0 baseline. customers.total_visits DEFAULT 1 is a schema
    -- quirk: a freshly linked guest must not show "1 visit" before any paid
    -- order (the spine increments on first paid). All 7 existing prod rows are 0.
    INSERT INTO public.customers (name, phone, total_visits, total_spent)
    VALUES (
      COALESCE(NULLIF(left(btrim(COALESCE(p_name, '')), 80), ''),
               'Qonaq ' || right(v_norm, 4)),
      v_norm,
      0, 0
    )
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('customer_id', v_row.id, 'created', true,
                              'phone', v_row.phone, 'name', v_row.name);
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-phone create: the unique index picked a deterministic winner.
    SELECT * INTO v_row FROM public.customers WHERE phone = v_norm;
    RETURN jsonb_build_object('customer_id', v_row.id, 'created', false,
                              'phone', v_row.phone, 'name', v_row.name);
  END;
END;
$$;

-- Supabase explicitly grants new public-schema functions to anon/authenticated;
-- house pattern (cf. transition_order_atomic ACL) = service_role only.
REVOKE ALL ON FUNCTION public.guest_link_customer(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guest_link_customer(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_customer(text, text) TO service_role;

COMMIT;
