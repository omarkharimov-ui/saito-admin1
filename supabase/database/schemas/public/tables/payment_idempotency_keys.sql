CREATE TABLE public.payment_idempotency_keys (
  key        text                     NOT NULL,
  order_id   uuid                     NOT NULL,
  amount     numeric                  NOT NULL,
  status     text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_payment_idempotency_keys_order ON public.payment_idempotency_keys (order_id);

ALTER TABLE public.payment_idempotency_keys
  ADD CONSTRAINT payment_idempotency_keys_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE public.payment_idempotency_keys
  ADD CONSTRAINT payment_idempotency_keys_pkey PRIMARY KEY (key);

GRANT ALL ON public.payment_idempotency_keys TO anon;

GRANT ALL ON public.payment_idempotency_keys TO authenticated;

GRANT ALL ON public.payment_idempotency_keys TO service_role;