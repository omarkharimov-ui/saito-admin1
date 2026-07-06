-- Drop dead overload of reverse_stock_deduction_for_items (jsonb version, superseded by text version returning integer)
DROP FUNCTION IF EXISTS public.reverse_stock_deduction_for_items(p_items jsonb);

-- Fix unique index to allow split orders (same table, same active status is intentional for splits)
DROP INDEX IF EXISTS idx_orders_active_table;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_active_table
ON orders(table_number)
WHERE status NOT IN ('paid', 'cancelled', 'closed') AND (is_split IS DISTINCT FROM true);

-- Add update_order_item_quantity RPC (was deployed live, not tracked in migrations)

CREATE OR REPLACE FUNCTION public.update_order_item_quantity(
  p_order_item_id uuid,
  p_quantity integer,
  p_unit_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE order_items
  SET
    quantity = p_quantity,
    total_price = p_unit_price * p_quantity,
    kitchen_status = 'pending'
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'order_item_id', p_order_item_id, 'quantity', p_quantity);
END;
$function$;
