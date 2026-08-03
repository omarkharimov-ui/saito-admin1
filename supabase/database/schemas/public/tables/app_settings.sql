CREATE TABLE public.app_settings (
  key        text                     NOT NULL,
  value      text,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

GRANT ALL ON public.app_settings TO anon;

GRANT ALL ON public.app_settings TO authenticated;

GRANT ALL ON public.app_settings TO service_role;