CREATE TABLE public.stock_counts (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  count_number   text                     NOT NULL,
  status         text                     DEFAULT 'draft'::text NOT NULL,
  counted_by     uuid,
  notes          text,
  total_variance numeric(12,2)            DEFAULT 0,
  counted_at     timestamp with time zone,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_stock_counts_status ON public.stock_counts (status);

CREATE POLICY stock_counts_delete ON public.stock_counts
  FOR DELETE
  USING (true);

CREATE POLICY stock_counts_insert ON public.stock_counts
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY stock_counts_select ON public.stock_counts
  FOR SELECT
  USING (true);

CREATE POLICY stock_counts_update ON public.stock_counts
  FOR UPDATE
  USING (true);

ALTER TABLE public.stock_counts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_counts
  ADD CONSTRAINT stock_counts_count_number_key UNIQUE (count_number);

ALTER TABLE public.stock_counts
  ADD CONSTRAINT stock_counts_pkey PRIMARY KEY (id);

ALTER TABLE public.stock_counts
  ADD CONSTRAINT stock_counts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]));

GRANT ALL ON public.stock_counts TO anon;

GRANT ALL ON public.stock_counts TO authenticated;

GRANT ALL ON public.stock_counts TO service_role;