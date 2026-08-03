CREATE TABLE public.expenses (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  staff_id     uuid,
  category     text                     DEFAULT 'salary'::text,
  amount       numeric                  DEFAULT 0 NOT NULL,
  note         text,
  expense_date date                     DEFAULT CURRENT_DATE NOT NULL,
  created_by   uuid,
  created_at   timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_expenses_staff ON public.expenses (staff_id);

CREATE INDEX idx_expenses_date_category ON public.expenses (expense_date, category);

CREATE INDEX idx_expenses_date ON public.expenses (expense_date);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

GRANT ALL ON public.expenses TO anon;

GRANT ALL ON public.expenses TO authenticated;

GRANT ALL ON public.expenses TO service_role;