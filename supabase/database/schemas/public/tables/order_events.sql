CREATE TABLE public.order_events (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id      uuid                     NOT NULL,
  event_type    public.order_event_type  NOT NULL,
  old_value     jsonb,
  new_value     jsonb,
  metadata      jsonb,
  performed_by  uuid,
  employee_name text,
  ip_address    text,
  device_id     text,
  created_at    timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_order_events_type ON public.order_events (event_type);

CREATE INDEX idx_order_events_order_type ON public.order_events (order_id, event_type);

CREATE INDEX idx_order_events_order ON public.order_events (order_id);

CREATE INDEX idx_order_events_created ON public.order_events (created_at);

CREATE POLICY service_role_full_order_events ON public.order_events
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.order_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_pkey PRIMARY KEY (id);

ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.order_events TO anon;

GRANT ALL ON public.order_events TO authenticated;

GRANT ALL ON public.order_events TO service_role;