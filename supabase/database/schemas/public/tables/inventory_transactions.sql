CREATE TABLE public.inventory_transactions (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_item_id    uuid,
  ingredient_id    uuid                     NOT NULL,
  quantity         numeric                  NOT NULL,
  unit             text                     NOT NULL,
  transaction_type text                     NOT NULL,
  reference_type   text,
  reference_id     uuid,
  performed_by     uuid,
  created_at       timestamp with time zone DEFAULT now()
);

CREATE POLICY "Allow anon read" ON public.inventory_transactions
  FOR SELECT
  USING ((auth.role() = 'anon'::text));

CREATE POLICY "Allow service_role full access" ON public.inventory_transactions
  USING ((auth.role() = 'service_role'::text));

ALTER TABLE public.inventory_transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_order_item_id_key UNIQUE (order_item_id);

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);

GRANT ALL ON public.inventory_transactions TO anon;

GRANT ALL ON public.inventory_transactions TO authenticated;

GRANT ALL ON public.inventory_transactions TO service_role;