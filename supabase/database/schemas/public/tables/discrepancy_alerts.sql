CREATE TABLE public.discrepancy_alerts (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  type           text                     NOT NULL,
  severity       text                     DEFAULT 'medium'::text NOT NULL,
  title          text                     NOT NULL,
  description    text,
  source_id      text,
  source_table   text,
  value          numeric(12,2)            DEFAULT 0,
  expected_value numeric(12,2)            DEFAULT 0,
  variance_pct   numeric(6,2)             DEFAULT 0,
  status         text                     DEFAULT 'open'::text NOT NULL,
  created_at     timestamp with time zone DEFAULT now(),
  resolved_at    timestamp with time zone
);

CREATE INDEX idx_discrepancy_alerts_created ON public.discrepancy_alerts (created_at DESC);

CREATE INDEX idx_alerts_status ON public.discrepancy_alerts (status);

CREATE INDEX idx_discrepancy_alerts_status ON public.discrepancy_alerts (status);

CREATE INDEX idx_discrepancy_alerts_severity ON public.discrepancy_alerts (severity);

CREATE INDEX idx_discrepancy_alerts_type ON public.discrepancy_alerts (TYPE);

CREATE POLICY "Authenticated full access discrepancy_alerts" ON public.discrepancy_alerts
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.discrepancy_alerts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.discrepancy_alerts
  ADD CONSTRAINT discrepancy_alerts_pkey PRIMARY KEY (id);

ALTER TABLE public.discrepancy_alerts
  ADD CONSTRAINT discrepancy_alerts_severity_check CHECK (severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]));

ALTER TABLE public.discrepancy_alerts
  ADD CONSTRAINT discrepancy_alerts_status_check CHECK (status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text]));

ALTER TABLE public.discrepancy_alerts
  ADD CONSTRAINT discrepancy_alerts_type_check
    CHECK
    (type = ANY (ARRAY['invoice_amount'::text, 'received_qty'::text, 'stock_vs_sales'::text, 'recipe_vs_actual'::text, 'supplier_price'::text, 'waste_vs_norm'::text,
    'margin_drop'::text]));

GRANT ALL ON public.discrepancy_alerts TO anon;

GRANT ALL ON public.discrepancy_alerts TO authenticated;

GRANT ALL ON public.discrepancy_alerts TO service_role;