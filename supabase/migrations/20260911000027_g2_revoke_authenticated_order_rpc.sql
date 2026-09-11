-- ============================================================================
-- 20260911000027 — O / G2: REVOKE `authenticated` EXECUTE on order-mutation RPCs
--
-- USER-FROZEN CONTRACT (O gate G2, confirmed):
--   "Raw PostgREST RPC ile route/auth bypass mümkün olmamalıdır. Lazım olan
--    server-side caller yalnız canonical controlled path olsun."
--
-- EVIDENCE (real DB jbxmlnsicbfkbsatnoej, 2026-09-11):
--   * The app never opens a Supabase Auth session (login = custom `saito_token`
--     cookie + `sessions` table; `auth.users` = 0; no signIn/setSession in src).
--     Browser client (lib/supabaseClient.ts) is built with the ANON key.
--   * Therefore:
--       - a staff's browser executes PostgREST as role `anon` (anon EXECUTE on
--         these fns is already N → browser-direct supabase.rpc returns 42501);
--       - every server route + cron uses the SERVICE_ROLE client
--         (lib/api-auth.ts createAuthClient()=svc()=SERVICE_ROLE_KEY).
--       - role `authenticated` is UNREACHABLE by any live path in this app.
--   * G2 REVOKEs `authenticated` on the order-mutation entry points so that IF a
--     Supabase Auth identity ever exists, it still CANNOT call these RPCs to
--     bypass route-level requireAuth/requirePermission/CSRF/rate-limit. This is
--     DB-level closure mirroring the frozen S-02 / F-01 pattern (defense in
--     depth) and makes "raw-RPC bypass = 0" airtight.
--
-- SCOPE: order/KDS/kitchen-ticket entry-point functions only (all overloads).
--   - `service_role` and `postgres`/owner GRANTs are UNTOUCHED (server path ok).
--   - Trigger bodies and internal helpers are NOT entry points; they run as the
--     owner inside SECURITY DEFINER, so no grant is needed.
--   - `walkin_atomic` already has NO `authenticated` grant (svc only) — verified.
--
-- GOLDEN RULE 5: auto-commit (no wrapping transaction).
-- ============================================================================

-- ---- G2: revoke authenticated EXECUTE on order-mutation entry points ----
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(p_order_id uuid, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_order_atomic(p_order_id uuid, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_item_atomic(p_token text, p_order_id uuid, p_product_id uuid, p_quantity integer, p_modifiers jsonb, p_course text, p_seat_number integer, p_special_notes text, p_tax_rate numeric, p_idempotency_key text, p_correlation_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_items_to_order(p_order_id uuid, p_items jsonb, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_items_to_order(p_order_id uuid, p_items jsonb, p_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_order_items(p_order_id uuid, p_items jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_courier(p_order_id uuid, p_courier_id uuid, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_order_staff(p_order_id uuid, p_staff_id uuid, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_order_total(p_items jsonb, p_campaign_id uuid, p_discount_amount numeric, p_discount_type text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_order_total_v2(p_order_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_order_total_v3(p_order_id uuid, p_apply_vat boolean, p_apply_service boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_delivery_order(p_order_id uuid, p_reason text, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_order_items(p_order_id uuid, p_items jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_table_orders(p_table_number integer, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_table_orders(p_table_number integer, p_reason text, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_takeaway_order(p_order_id uuid, p_reason text, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_ticket_atomic(p_order_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_reservation_draft_orders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_pre_order_cache() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.comp_order_item_atomic(p_order_item_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_delivery_order(p_customer_phone text, p_customer_name text, p_customer_note text, p_delivery_address text, p_delivery_district text, p_delivery_street text, p_delivery_building text, p_delivery_floor text, p_delivery_apartment text, p_delivery_intercom text, p_delivery_zone text, p_delivery_fee numeric, p_estimated_delivery_time timestamp with time zone, p_items jsonb, p_performed_by uuid, p_location_id uuid, p_organization_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_or_append_order(p_table_number integer, p_items jsonb, p_status text, p_guest_count integer, p_customer_note text, p_order_type text, p_reservation_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(p_table_number integer, p_items jsonb, p_total_amount numeric, p_status text, p_guest_count integer, p_customer_note text, p_order_type text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_takeaway_order(p_customer_phone text, p_customer_name text, p_customer_note text, p_estimated_pickup_time timestamp with time zone, p_items jsonb, p_performed_by uuid, p_location_id uuid, p_organization_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_order_number(p_order_type text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.item_kitchen_step(p_token text, p_item_id uuid, p_target text, p_reason text, p_metadata jsonb, p_correlation_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_all_served(p_order_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(p_order_id uuid, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_ready(p_order_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_orders_atomic(p_source_order_ids uuid[], p_target_order_id uuid, p_extra_amount numeric, p_extra_guests integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_order_items(p_order_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_due_kitchen_schedules() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.push_reservation_to_kitchen(p_order_id uuid, p_schedule_id uuid, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_order_payment_state(p_order_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recall_order_items(p_order_id uuid, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recall_ticket_atomic(p_order_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_kitchen_ticket_atomic(p_order_id uuid, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_order(p_order_id uuid, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_order_atomic(p_order_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.route_kitchen_order(p_order_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_split_orders(p_table_numbers integer[], p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.split_by_seat(p_order_id uuid, p_seat_number integer, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.split_equal(p_order_id uuid, p_split_count integer, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(p_original_order_id uuid, p_split_items jsonb, p_split_total numeric, p_new_guest_count integer, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.split_order_by_items_atomic(p_original_order_id uuid, p_splits jsonb, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_orders_atomic(p_from_table integer, p_to_table integer, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_order_atomic(p_token text, p_order_id uuid, p_new_status text, p_reason text, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_order_status(p_order_id uuid, p_new_status text, p_performed_by uuid, p_employee_name text, p_reason text, p_metadata jsonb, p_ip_address text, p_device_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_delivery_order(p_order_id uuid, p_customer_phone text, p_customer_name text, p_customer_note text, p_delivery_address text, p_delivery_fee numeric, p_courier_id uuid, p_estimated_delivery_time timestamp with time zone, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_order_item_prepared(p_order_item_id uuid, p_prepared_quantity integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_order_item_quantity(p_order_item_id uuid, p_quantity integer, p_unit_price numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_order_item_status(p_order_item_id uuid, p_status text, p_prepared_quantity integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_pre_order_cache() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_takeaway_order(p_order_id uuid, p_customer_phone text, p_customer_name text, p_customer_note text, p_estimated_pickup_time timestamp with time zone, p_performed_by uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_reservation_preorders(p_reservation_id uuid, p_items jsonb, p_replace_all boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_order_item_atomic(p_order_item_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.waste_order_item_atomic(p_order_item_id uuid, p_reason text, p_performed_by uuid, p_performed_by_terminal_id text) FROM authenticated;

-- ---- G2 fail-safe: the server path (service_role) MUST retain EXECUTE ----
-- If any canonical entry point lost service_role EXECUTE, this migration fails
-- loudly rather than silently breaking the working app.
DO $$
DECLARE
  v_bad text;
BEGIN
  IF NOT has_function_privilege('service_role',
       'public.transition_order_atomic(text, uuid, text, text, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.cancel_table_orders(integer, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.calculate_order_total_v3(uuid, boolean, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.add_item_atomic(text, uuid, uuid, integer, jsonb, text, integer, text, numeric, text, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'G2 FAIL-SAFE: service_role lost EXECUTE on a canonical order entry point — server path would break';
  END IF;
END;
$$;
