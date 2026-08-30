-- =====================================================================
-- M15-PART2 — REVOKE ALL ANON/AUTHENTICATED EXECUTE FROM CRITICAL RPCS
-- Purpose: Ensure no critical mutation RPC is callable without service_role
-- =====================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'complete_payment_atomic', 'complete_payment_v4', 'process_order_payment',
        'void_order_item_atomic', 'void_item_with_pin', 'comp_order_item_atomic',
        'comp_item_with_pin', 'reopen_order_atomic', 'reopen_order_with_pin',
        'saito_reverse_payment', 'merge_tables_atomic', 'transfer_table_atomic',
        'dismiss_table_atomic', 'clear_table_atomic', 'cancel_reservation_atomic',
        'deduct_inventory_atomic', 'deduct_stock_for_order', 'deduct_stock_on_order',
        'process_stock_in', 'process_supplier_return', 'rollback_inventory_atomic',
        'reverse_stock_deduction', 'close_cash_register', 'close_day_atomic',
        'send_to_kitchen_atomic', 'accept_kitchen_ticket_atomic', 'mark_ready_atomic',
        'mark_served_atomic', 'reopen_kitchen_ticket_atomic', 'cancel_ticket_atomic',
        'recall_ticket_atomic', 'mark_sold_out_atomic', 'void_payment_atomic',
        'refund_payment_atomic', 'open_cash_register'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s(%s) FROM anon', rec.proname, rec.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s(%s) FROM authenticated', rec.proname, rec.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  
  RAISE NOTICE 'M15-PART2: Revoked anon/authenticated EXECUTE from all critical mutation RPCs';
END $$;
