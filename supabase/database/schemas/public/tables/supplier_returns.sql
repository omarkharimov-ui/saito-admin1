CREATE TABLE public.supplier_returns (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  supplier_id   uuid                     NOT NULL,
  return_number text                     NOT NULL,
  status        text                     DEFAULT 'draft'::text NOT NULL,
  total_amount  numeric(12,2)            DEFAULT 0 NOT NULL,
  reason        text,
  returned_at   timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_supplier_returns_status ON public.supplier_returns (status);

CREATE INDEX idx_supplier_returns_supplier ON public.supplier_returns (supplier_id);

CREATE POLICY supplier_returns_insert ON public.supplier_returns
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY supplier_returns_select ON public.supplier_returns
  FOR SELECT
  USING (true);

CREATE POLICY supplier_returns_update ON public.supplier_returns
  FOR UPDATE
  USING (true);

ALTER TABLE public.supplier_returns
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_returns
  ADD CONSTRAINT supplier_returns_pkey PRIMARY KEY (id);

ALTER TABLE public.supplier_returns
  ADD CONSTRAINT supplier_returns_return_number_key UNIQUE (return_number);

ALTER TABLE public.supplier_returns
  ADD CONSTRAINT supplier_returns_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE public.supplier_returns
  ADD CONSTRAINT supplier_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;

GRANT ALL ON public.supplier_returns TO anon;

GRANT ALL ON public.supplier_returns TO authenticated;

GRANT ALL ON public.supplier_returns TO service_role;