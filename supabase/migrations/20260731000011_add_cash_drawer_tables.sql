-- Add cash drawer tables for shift management

CREATE TABLE public.cash_drawer_sessions (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  staff_id        uuid                     NOT NULL,
  staff_name      text                     NOT NULL,
  shift_start     timestamp with time zone DEFAULT now() NOT NULL,
  shift_end       timestamp with time zone,
  opening_cash    numeric(12,2)            DEFAULT 0,
  expected_cash   numeric(12,2)            DEFAULT 0,
  actual_cash    numeric(12,2)            DEFAULT 0,
  difference      numeric(12,2)            DEFAULT 0,
  status          text                     DEFAULT 'open'::text,
  notes           text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.cash_movements (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  session_id      uuid                     NOT NULL,
  type            text                     NOT NULL,
  amount          numeric(12,2)            NOT NULL,
  reason          text,
  reference_id    uuid,
  reference_type  text,
  performed_by    uuid                     NOT NULL,
  performed_by_name text                   NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_cash_drawer_sessions_staff ON public.cash_drawer_sessions (staff_id);
CREATE INDEX idx_cash_drawer_sessions_status ON public.cash_drawer_sessions (status);
CREATE INDEX idx_cash_movements_session ON public.cash_movements (session_id);
CREATE INDEX idx_cash_movements_type ON public.cash_movements (type);

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE public.cash_drawer_sessions
  ADD CONSTRAINT cash_drawer_sessions_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'balanced'::text]));

ALTER TABLE public.cash_drawer_sessions
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_full_cash_drawer_sessions ON public.cash_drawer_sessions
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.cash_drawer_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_type_check CHECK (type = ANY (ARRAY['safe_drop'::text, 'paid_out'::text, 'cash_in'::text, 'cash_out'::text, 'correction'::text]));

ALTER TABLE public.cash_movements
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_full_cash_movements ON public.cash_movements
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.cash_drawer_sessions TO service_role;
GRANT ALL ON public.cash_movements TO service_role;
