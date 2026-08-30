-- =====================================================================
-- M15 — REMOVE PUBLIC RPC EXECUTE GRANTS
-- Purpose: Revoke anon/authenticated EXECUTE from critical mutation RPCs.
--          The application uses service_role for all DB access.
--          Critical mutation functions must NOT be callable without auth.
-- =====================================================================

-- =========================================================================
-- SECTION A: Critical payment/cash mutation RPCs
-- =========================================================================

-- Payment RPCs
REVOKE EXECUTE ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_payment_atomic(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_payment_v4(uuid, text, numeric, numeric, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_payment_v4(uuid, text, numeric, numeric, numeric, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_order_payment(uuid, text, numeric, numeric, uuid, numeric, text, uuid, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_order_payment(uuid, text, numeric, numeric, uuid, numeric, text, uuid, numeric, numeric) FROM authenticated;

-- Cash drawer RPCs
REVOKE EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.open_cash_register(numeric, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.open_cash_register(numeric, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.close_day_atomic(date, jsonb, jsonb, jsonb, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_day_atomic(date, jsonb, jsonb, jsonb, jsonb, uuid) FROM authenticated;

-- Void/Comp/Reopen RPCs
REVOKE EXECUTE ON FUNCTION public.void_order_item_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_order_item_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_item_with_pin(uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_item_with_pin(uuid, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.comp_order_item_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.comp_order_item_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.comp_item_with_pin(uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.comp_item_with_pin(uuid, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_order_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_order_with_pin(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_order_with_pin(uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_reverse_payment(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_reverse_payment(uuid, uuid) FROM authenticated;

-- Table management RPCs
REVOKE EXECUTE ON FUNCTION public.merge_tables_atomic(integer, integer[], uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_tables_atomic(integer, integer[], uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_tables_atomic(integer, integer[], uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_tables_atomic(integer, integer[], uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_table_atomic(integer, integer, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_table_atomic(integer, integer, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dismiss_table_atomic(integer, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dismiss_table_atomic(integer, text, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_table_atomic(integer, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_table_atomic(integer, uuid, text) FROM authenticated;

-- Kitchen RPCs
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_kitchen_ticket_atomic(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_ready_atomic(uuid, uuid, text, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_ready_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_ready_atomic(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_served_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_served_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_to_kitchen_atomic(uuid, uuid) FROM authenticated;

-- Inventory RPCs
REVOKE EXECUTE ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_inventory_atomic(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_stock_for_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_stock_for_order(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_stock_on_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_stock_on_order(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_stock_in(uuid, numeric, numeric, text, text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_stock_in(uuid, numeric, numeric, text, text, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_supplier_return(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_supplier_return(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rollback_inventory_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rollback_inventory_atomic(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_stock_deduction(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_stock_deduction(uuid) FROM authenticated;

-- Reservation RPCs
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_atomic(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_atomic(uuid, text, uuid) FROM authenticated;

-- Additional table/order RPCs
REVOKE EXECUTE ON FUNCTION public.cancel_ticket_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_ticket_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recall_ticket_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recall_ticket_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_kitchen_ticket_atomic(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_kitchen_ticket_atomic(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_sold_out_atomic(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_sold_out_atomic(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_payment_atomic(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_payment_atomic(uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_payment_atomic(text, jsonb, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_payment_atomic(text, jsonb, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_payment_atomic(uuid, numeric, text, text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_payment_atomic(uuid, numeric, text, text, uuid, uuid) FROM authenticated;

-- Table operation RPCs
REVOKE EXECUTE ON FUNCTION public.saito_dismiss_table(integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_dismiss_table(integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_transfer_table(integer, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_transfer_table(integer, integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_merge_tables(integer[], uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_merge_tables(integer[], uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_split_orders(integer[], uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_split_orders(integer[], uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_undo_table_operation(text, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_undo_table_operation(text, jsonb, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.saito_transfer_tables(integer, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saito_transfer_tables(integer, integer, uuid) FROM authenticated;

-- =========================================================================
-- SECTION B: Verification
-- =========================================================================

DO $$
DECLARE
  v_anon_count INTEGER;
  v_auth_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_anon_count
  FROM information_schema.routine_privileges
  WHERE specific_schema = 'public'
    AND routine_name IN (
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
    AND grantee = 'anon'
    AND privilege_type = 'EXECUTE';

  SELECT COUNT(*) INTO v_auth_count
  FROM information_schema.routine_privileges
  WHERE specific_schema = 'public'
    AND routine_name IN (
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
    AND grantee = 'authenticated'
    AND privilege_type = 'EXECUTE';

  IF v_anon_count > 0 THEN
    RAISE WARNING 'M15: % anon EXECUTE grants remain on critical mutation RPCs', v_anon_count;
  ELSE
    RAISE NOTICE 'M15: Anon EXECUTE grants removed from critical mutation RPCs';
  END IF;

  IF v_auth_count > 0 THEN
    RAISE WARNING 'M15: % authenticated EXECUTE grants remain on critical mutation RPCs', v_auth_count;
  ELSE
    RAISE NOTICE 'M15: Authenticated EXECUTE grants removed from critical mutation RPCs';
  END IF;
END $$;
