-- =============================================================================
-- P-9 M2 — settings READ VIEWS (ratified D-2: views-only; physical split deferred)
-- Zero changes to the settings table. Each view exposes one config domain as a
-- single row (LIMIT 1) over the 1-row settings table. The `settings` table stays
-- the SSOT; FROZEN-bound columns (cash_close_*) are surfaced in their own view
-- but never modified here.
-- Rollback: 20260918000002_p9_settings_views_rollback.sql
-- =============================================================================

CREATE VIEW public.v_settings_business AS
  SELECT restaurant_name, address, phone, city, contact_email,
         instagram_url, whatsapp_number, timezone, footer_text, inventory_mode
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_hours AS
  SELECT opening_hours, working_hours, is_open, morning_greeting_enabled,
         avg_meal_duration, kitchen_accept_timeout_minutes, order_delay_minutes
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_delivery AS
  SELECT delivery_fee, free_delivery_threshold, min_order_amount,
         qr_table_count, revenue_limit
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_receipt AS
  SELECT receipt_title, receipt_currency, receipt_service_fee_pct,
         receipt_show_service_fee, receipt_footer_text,
         receipt_staff_name, receipt_payment_method
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_printer AS
  SELECT printer_name, printer_type, printer_paper_width, printer_interface,
         auto_print_receipt, auto_print_kitchen, print_copies
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_vat AS
  SELECT vat_enabled, vat_percentage, auto_apply_vat
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_loyalty AS
  SELECT loyalty_enabled, loyalty_points_per_manat, loyalty_point_value,
         loyalty_min_redeem
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_cash_close AS
  SELECT cash_close_variance_threshold, cash_close_manager_required
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_ai AS
  SELECT ai_target_revenue, ai_insight_depth
  FROM public.settings LIMIT 1;

CREATE VIEW public.v_settings_payments AS
  SELECT payment_cash, payment_card
  FROM public.settings LIMIT 1;

GRANT SELECT ON public.v_settings_business, public.v_settings_hours,
  public.v_settings_delivery, public.v_settings_receipt, public.v_settings_printer,
  public.v_settings_vat, public.v_settings_loyalty, public.v_settings_cash_close,
  public.v_settings_ai, public.v_settings_payments TO service_role, authenticated;
