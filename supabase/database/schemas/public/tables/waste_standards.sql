CREATE TABLE public.waste_standards (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  keyword          text                     NOT NULL,
  waste_percentage numeric                  NOT NULL,
  category         text,
  created_at       timestamp with time zone DEFAULT now()
);

CREATE POLICY waste_standards_all ON public.waste_standards
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

ALTER TABLE public.waste_standards
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.waste_standards
  ADD CONSTRAINT waste_standards_pkey PRIMARY KEY (id);

GRANT ALL ON public.waste_standards TO anon;

GRANT ALL ON public.waste_standards TO authenticated;

GRANT ALL ON public.waste_standards TO service_role;