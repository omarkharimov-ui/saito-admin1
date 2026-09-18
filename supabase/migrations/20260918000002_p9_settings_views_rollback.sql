-- P-9 M2 ROLLBACK — drop the 10 read-views (settings table was never touched)
DROP VIEW IF EXISTS public.v_settings_business;
DROP VIEW IF EXISTS public.v_settings_hours;
DROP VIEW IF EXISTS public.v_settings_delivery;
DROP VIEW IF EXISTS public.v_settings_receipt;
DROP VIEW IF EXISTS public.v_settings_printer;
DROP VIEW IF EXISTS public.v_settings_vat;
DROP VIEW IF EXISTS public.v_settings_loyalty;
DROP VIEW IF EXISTS public.v_settings_cash_close;
DROP VIEW IF EXISTS public.v_settings_ai;
DROP VIEW IF EXISTS public.v_settings_payments;
