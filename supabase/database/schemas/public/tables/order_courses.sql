CREATE TABLE public.order_courses (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id     uuid                     NOT NULL,
  course_name  text                     NOT NULL,
  course_order integer                  DEFAULT 0 NOT NULL,
  status       text                     DEFAULT 'pending'::text,
  fired_at     timestamp with time zone,
  completed_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_order_courses_order_id ON public.order_courses (order_id);

ALTER TABLE public.order_courses
  ADD CONSTRAINT order_courses_pkey PRIMARY KEY (id);

ALTER TABLE public.order_courses
  ADD CONSTRAINT order_courses_status_check CHECK (status = ANY (ARRAY['pending'::text, 'preparing'::text, 'completed'::text, 'skipped'::text]));

ALTER TABLE public.order_courses
  ADD CONSTRAINT order_courses_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.order_courses TO anon;

GRANT ALL ON public.order_courses TO authenticated;

GRANT ALL ON public.order_courses TO service_role;