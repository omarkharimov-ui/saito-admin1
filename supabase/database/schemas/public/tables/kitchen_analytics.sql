CREATE TABLE public.kitchen_analytics (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id          uuid                     NOT NULL,
  order_item_id     uuid                     NOT NULL,
  station           text                     NOT NULL,
  prep_time_seconds integer,
  delay_seconds     integer,
  rush              boolean                  DEFAULT false,
  created_at        timestamp with time zone DEFAULT now(),
  created_by        uuid,
  action            text
);

CREATE INDEX idx_kitchen_analytics_created_at ON public.kitchen_analytics (created_at);

CREATE INDEX idx_kitchen_analytics_order_id ON public.kitchen_analytics (order_id);

CREATE INDEX idx_kitchen_analytics_station ON public.kitchen_analytics (station);

ALTER TABLE public.kitchen_analytics
  ADD CONSTRAINT kitchen_analytics_pkey PRIMARY KEY (id);

ALTER TABLE public.kitchen_analytics
  ADD CONSTRAINT kitchen_analytics_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;

ALTER TABLE public.kitchen_analytics
  ADD CONSTRAINT kitchen_analytics_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.kitchen_analytics TO anon;

GRANT ALL ON public.kitchen_analytics TO authenticated;

GRANT ALL ON public.kitchen_analytics TO service_role;