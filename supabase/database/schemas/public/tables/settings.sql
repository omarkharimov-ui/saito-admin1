CREATE TABLE public.settings (
  id                             text                     DEFAULT '1'::text NOT NULL,
  restaurant_name                text                     DEFAULT 'Saito Sushi'::text,
  address                        text,
  phone                          text,
  opening_hours                  text,
  is_open                        boolean                  DEFAULT true,
  min_order_amount               numeric(10,2)            DEFAULT 15.00,
  delivery_fee                   numeric(10,2)            DEFAULT 2.00,
  free_delivery_threshold        numeric(10,2)            DEFAULT 50.00,
  payment_cash                   boolean                  DEFAULT true,
  payment_card                   boolean                  DEFAULT true,
  updated_at                     timestamp with time zone DEFAULT now(),
  instagram_url                  text,
  whatsapp_number                text,
  footer_text                    text,
  working_hours                  text,
  admin_password                 text,
  superadmin_password            text,
  qr_table_count                 integer,
  order_delay_minutes            integer                  DEFAULT 30,
  city                           text                     DEFAULT 'Baku'::text,
  kitchen_password               text                     DEFAULT 'kitchen2025'::text,
  ai_target_revenue              text,
  ai_insight_depth               text                     DEFAULT 'standard'::text,
  smtp_host                      text                     DEFAULT 'smtp.gmail.com'::text,
  smtp_port                      integer                  DEFAULT 587,
  smtp_user                      text                     DEFAULT ''::text,
  smtp_pass                      text                     DEFAULT ''::text,
  smtp_from_name                 text                     DEFAULT 'Saito Admin'::text,
  receipt_title                  text                     DEFAULT 'SİFARİŞ ÇEKİ'::text,
  receipt_currency               text                     DEFAULT '₼'::text,
  receipt_service_fee_pct        numeric                  DEFAULT 10,
  receipt_show_service_fee       boolean                  DEFAULT true,
  receipt_footer_text            text                     DEFAULT 'Zəhmət olmasa gözləyin, tezliklə sizinlə olacağıq.'::text,
  contact_email                  text                     DEFAULT ''::text,
  morning_greeting_enabled       boolean                  DEFAULT true,
  kitchen_accept_timeout_minutes integer                  DEFAULT 10 NOT NULL,
  timezone                       text                     DEFAULT 'Asia/Baku'::text,
  avg_meal_duration              integer                  DEFAULT 90,
  revenue_limit                  numeric(10,2),
  inventory_mode                 text                     DEFAULT 'on_kitchen_accept'::text,
  printer_name                   text                     DEFAULT 'Default Printer'::text,
  printer_type                   text                     DEFAULT 'thermal'::text,
  printer_paper_width            text                     DEFAULT '80mm'::text,
  printer_interface              text                     DEFAULT 'browser'::text,
  auto_print_receipt             boolean                  DEFAULT true,
  auto_print_kitchen             boolean                  DEFAULT false,
  print_copies                   integer                  DEFAULT 1
);

CREATE POLICY auth_read_settings ON public.settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY service_full_settings ON public.settings
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY settings_select_admin ON public.settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin_staff());

CREATE POLICY settings_select_kitchen ON public.settings
  FOR SELECT
  TO authenticated
  USING (public.is_kitchen_staff());

CREATE POLICY settings_select_public ON public.settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY settings_write_staff ON public.settings
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY settings_write_superadmin ON public.settings
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY auth_modify_settings ON public.settings
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_pkey PRIMARY KEY (id);

GRANT ALL ON public.settings TO anon;

GRANT ALL ON public.settings TO authenticated;

GRANT ALL ON public.settings TO service_role;