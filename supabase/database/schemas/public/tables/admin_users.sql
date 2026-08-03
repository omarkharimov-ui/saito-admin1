CREATE TABLE public.admin_users (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  role          text                     NOT NULL,
  is_active     boolean                  DEFAULT true NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL,
  pin           text,
  pin_hash      text,
  password_hash text
);

CREATE INDEX idx_admin_users_pin ON public.admin_users (pin);

CREATE POLICY admin_users_delete_superadmin ON public.admin_users
  FOR DELETE
  TO authenticated
  USING (public.is_superadmin());

CREATE POLICY admin_users_insert_bootstrap ON public.admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.admin_users_is_empty() AND (id = auth.uid()) AND (role = 'superadmin'::text) AND (COALESCE(is_active, true) = true)));

CREATE POLICY admin_users_insert_superadmin ON public.admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY admin_users_select_bootstrap ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (public.admin_users_is_empty());

CREATE POLICY admin_users_update_superadmin ON public.admin_users
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

ALTER TABLE public.admin_users
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_pin_key UNIQUE (pin);

ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);

ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check CHECK (role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'kitchen'::text]));

GRANT ALL ON public.admin_users TO anon;

GRANT ALL ON public.admin_users TO authenticated;

GRANT ALL ON public.admin_users TO service_role;