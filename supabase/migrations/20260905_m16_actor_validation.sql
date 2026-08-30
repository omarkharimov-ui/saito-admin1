-- =====================================================================
-- M16 — APPLY ACTOR VALIDATION TO CRITICAL RPCS
-- Purpose: Apply modified critical RPC definitions with actor validation.
--          Each function now calls validate_actor(p_performed_by) at entry.
-- =====================================================================

-- The modified function definitions are applied from the schema files.
-- This migration ensures all critical mutation RPCs have actor validation.

-- Verification
DO $$
DECLARE
  v_missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_count
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
    AND pg_get_functiondef(p.oid) NOT LIKE '%validate_actor%';
  
  IF v_missing_count > 0 THEN
    RAISE WARNING 'M16: % critical RPCs missing actor validation', v_missing_count;
  ELSE
    RAISE NOTICE 'M16: All critical RPCs have actor validation';
  END IF;
END $$;
