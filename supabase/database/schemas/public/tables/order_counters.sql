CREATE TABLE public.order_counters (
  order_type   text    NOT NULL,
  counter_date date    DEFAULT CURRENT_DATE NOT NULL,
  last_number  integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.order_counters
  ADD CONSTRAINT order_counters_pkey PRIMARY KEY (order_type, counter_date);

GRANT ALL ON public.order_counters TO anon;

GRANT ALL ON public.order_counters TO authenticated;

GRANT ALL ON public.order_counters TO service_role;