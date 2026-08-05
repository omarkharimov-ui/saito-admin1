-- Add RLS policies to unprotected tables
-- These tables had GRANT ALL but no RLS policies, leaving them fully open

-- app_settings
CREATE POLICY service_full_app_settings ON public.app_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- delivery_zones
CREATE POLICY service_full_delivery_zones ON public.delivery_zones
  TO service_role
  USING (true)
  WITH CHECK (true);

-- expenses
CREATE POLICY service_full_expenses ON public.expenses
  TO service_role
  USING (true)
  WITH CHECK (true);

-- kitchen_analytics
CREATE POLICY service_full_kitchen_analytics ON public.kitchen_analytics
  TO service_role
  USING (true)
  WITH CHECK (true);

-- migrations
CREATE POLICY service_full_migrations ON public.migrations
  TO service_role
  USING (true)
  WITH CHECK (true);

-- order_changes
CREATE POLICY service_full_order_changes ON public.order_changes
  TO service_role
  USING (true)
  WITH CHECK (true);

-- order_counters
CREATE POLICY service_full_order_counters ON public.order_counters
  TO service_role
  USING (true)
  WITH CHECK (true);

-- order_courses
CREATE POLICY service_full_order_courses ON public.order_courses
  TO service_role
  USING (true)
  WITH CHECK (true);

-- payment_idempotency_keys
CREATE POLICY service_full_payment_idempotency_keys ON public.payment_idempotency_keys
  TO service_role
  USING (true)
  WITH CHECK (true);

-- reservation_preorder_items
CREATE POLICY service_full_reservation_preorder_items ON public.reservation_preorder_items
  TO service_role
  USING (true)
  WITH CHECK (true);

-- stations
CREATE POLICY service_full_stations ON public.stations
  TO service_role
  USING (true)
  WITH CHECK (true);

-- recipe_headers (has RLS enabled but no policies)
CREATE POLICY service_full_recipe_headers ON public.recipe_headers
  TO service_role
  USING (true)
  WITH CHECK (true);
