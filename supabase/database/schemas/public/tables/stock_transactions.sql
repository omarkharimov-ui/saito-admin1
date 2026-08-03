CREATE TABLE public.stock_transactions (
  id            uuid                          DEFAULT gen_random_uuid() NOT NULL,
  ingredient_id uuid                          NOT NULL,
  quantity      numeric(10,2)                 NOT NULL,
  type          public.stock_transaction_type DEFAULT 'manual_entry'::public.stock_transaction_type NOT NULL,
  description   text,
  created_at    timestamp with time zone      DEFAULT now() NOT NULL
);

CREATE INDEX idx_stock_transactions_ingredient ON public.stock_transactions (ingredient_id);

CREATE POLICY service_role_transactions ON public.stock_transactions
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.stock_transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_transactions
  ADD CONSTRAINT stock_transactions_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;

ALTER TABLE public.stock_transactions
  ADD CONSTRAINT stock_transactions_pkey PRIMARY KEY (id);

GRANT ALL ON public.stock_transactions TO anon;

GRANT ALL ON public.stock_transactions TO authenticated;

GRANT ALL ON public.stock_transactions TO service_role;