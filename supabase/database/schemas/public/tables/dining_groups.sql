CREATE TABLE public.dining_groups (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  primary_order_id uuid,
  created_at       timestamp with time zone DEFAULT now(),
  closed_at        timestamp with time zone
);

CREATE POLICY dining_groups_all_staff ON public.dining_groups
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

ALTER TABLE public.dining_groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dining_groups
  ADD CONSTRAINT dining_groups_pkey PRIMARY KEY (id);

GRANT ALL ON public.dining_groups TO anon;

GRANT ALL ON public.dining_groups TO authenticated;

GRANT ALL ON public.dining_groups TO service_role;