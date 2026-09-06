-- ============================================================
-- 0.4-H / P1 — H10 Historical Double-Deduction Repair (H5, H9, H10)
--
-- SINGLE stock-mutation path enforcement + ledger reconciliation:
--   1. atomic_apply_invoice      -> log-only (was: direct UPDATE current +q
--                                   AND ledger trigger +q => +2q double-increment)
--   2. process_supplier_return   -> log-only (was: direct UPDATE current -q
--                                   AND 'waste'-type trigger +q => net 0 bug;
--                                   now positive-qty waste row => -q once)
--   3. mark_sold_out_atomic      -> log-only (was: direct SET current=0 AND
--                                   adjustment-row trigger -current => over-adjust)
--   4. Drop dead direct writers: create_order_consumption,
--      deduct_stock_on_consumption, update_stock_on_log (no live or app callers)
--   5. trg_apply_inventory_effect: reserved repair type 'historical_repair' moves
--      ONLY current_stock (theoretical_stock must stay the reconciliation target)
--   6. historical_repair ledger rows (31 ingredients, 34.7k net units) with
--      quantity = round(theoretical_stock - current_stock, 2)  -> drift 0
-- ============================================================

-- ------------------------------------------------------------------
-- 1. atomic_apply_invoice — log-only (single stock move via ledger trigger)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_apply_invoice(p_invoice_id uuid, p_stock_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_applied INT := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_updates)
  LOOP
    -- Log-only: current_stock moves ONCE via trg_z_inventory_log_effect.
    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason)
    VALUES (
      (v_item->>'ingredient_id')::UUID,
      'stock_in',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'cost_per_unit')::NUMERIC,
      'Invoice apply: ' || COALESCE((v_item->>'product_name')::TEXT, '')
    );

    v_applied := v_applied + 1;
  END LOOP;

  UPDATE invoices SET status = 'applied', applied_at = NOW()
  WHERE id = p_invoice_id;

  INSERT INTO transaction_logs (operation, status, details)
  VALUES ('atomic_apply_invoice', 'completed',
    'Invoice:' || p_invoice_id || ' applied:' || v_applied || ' items');

  RETURN jsonb_build_object('success', true, 'applied', v_applied);
END;
$function$;

-- ------------------------------------------------------------------
-- 2. process_supplier_return — log-only + correct sign.
--    Previously: direct -q AND waste-row +q (net 0). Now a single
--    positive-qty waste row => signed -q.  (qty sign fixed.)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_supplier_return(p_return_id uuid, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return RECORD;
  v_item RECORD;
  v_total NUMERIC(12,2) := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_return FROM supplier_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_return.status != 'draft' THEN RAISE EXCEPTION 'RETURN_ALREADY_PROCESSED' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN
    SELECT sri.*, i.name, i.current_stock
    FROM supplier_return_items sri
    JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE sri.supplier_return_id = p_return_id
    FOR UPDATE
  LOOP
    -- Log-only with positive quantity: 'waste' type signs -q in the effect
    -- trigger (one correct stock reduction). No direct current_stock UPDATE.
    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
    VALUES (v_item.ingredient_id, 'waste', v_item.quantity, v_item.unit_cost,
      'return_to_supplier', 'supplier_return', p_return_id,
      'Returned to supplier: ' || v_item.quantity || ' x ' || COALESCE(v_item.unit_cost, 0), now());

    v_total := v_total + v_item.total_cost;
  END LOOP;

  UPDATE supplier_returns SET status = 'completed', total_amount = v_total, returned_at = now(), updated_at = now()
  WHERE id = p_return_id;

  INSERT INTO notifications (type, title, body, data, created_at)
  VALUES ('stock', 'Təchizatçıya geri qaytarılma',
    v_return.return_number || ' — ' || v_total || ' AZN',
    jsonb_build_object('return_id', p_return_id, 'supplier_id', v_return.supplier_id, 'total_amount', v_total), now());

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'total_amount', v_total, 'return_number', v_return.return_number);
END;
$function$;

-- ------------------------------------------------------------------
-- 3. mark_sold_out_atomic — log-only zeroing (was: SET current=0 AND
--    adjustment-row -current => over-adjust by the full stock amount)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_sold_out_atomic(p_product_id uuid, p_product_name text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
  v_ingredient_id UUID;
  v_current_stock NUMERIC := 0;
  v_ingredients_updated INT := 0;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  IF v_product.is_ready_product AND v_product.direct_ingredient_id IS NOT NULL THEN
    SELECT current_stock INTO v_current_stock FROM public.ingredients WHERE id = v_product.direct_ingredient_id;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    -- Log-only: 'adjustment' row signed -current => stock reaches 0 via trigger.
    INSERT INTO public.inventory_logs (
      ingredient_id, type, quantity, reason, reference_type, reference_id, created_at
    ) VALUES (
      v_product.direct_ingredient_id, 'adjustment', -v_current_stock,
      COALESCE(p_product_name, v_product.name, 'Unknown') || ' sold out — full stock zeroed',
      'sold_out', p_product_id, NOW()
    );

    v_ingredients_updated := v_ingredients_updated + 1;
  ELSE
    FOR v_ingredient_id IN
      SELECT r.ingredient_id FROM public.recipes r WHERE r.menu_item_id = p_product_id
    LOOP
      SELECT current_stock INTO v_current_stock FROM public.ingredients WHERE id = v_ingredient_id;
      IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

      INSERT INTO public.inventory_logs (
        ingredient_id, type, quantity, reason, reference_type, reference_id, created_at
      ) VALUES (
        v_ingredient_id, 'adjustment', -v_current_stock,
        COALESCE(p_product_name, v_product.name, 'Unknown') || ' sold out — full stock zeroed',
        'sold_out', p_product_id, NOW()
      );

      v_ingredients_updated := v_ingredients_updated + 1;
    END LOOP;
  END IF;

  UPDATE public.products SET
    is_available = false,
    updated_at = NOW()
  WHERE id = p_product_id;

  INSERT INTO public.operation_logs (
    action, old_values, new_values, performed_by
  ) VALUES (
    'mark_sold_out',
    jsonb_build_object('product_id', p_product_id, 'is_available', v_product.is_available),
    jsonb_build_object('product_id', p_product_id, 'is_available', false, 'ingredients_updated', v_ingredients_updated),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'ingredients_updated', v_ingredients_updated);
END;
$function$;

-- ------------------------------------------------------------------
-- 4. Drop dead direct-stock writers (no live or app callers).
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order_consumption(text, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.deduct_stock_on_consumption();
DROP FUNCTION IF EXISTS public.update_stock_on_log();

-- ------------------------------------------------------------------
-- 5. Effect trigger: 'historical_repair' reconciles ONLY current_stock;
--    theoretical_stock stays the pre-repair target (avoids double-moving
--    both read-models in the opposite direction).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_apply_inventory_effect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_qty numeric;
BEGIN
  IF NEW.type = 'stock_in' THEN
    v_signed_qty := NEW.quantity;
  ELSIF NEW.type IN ('order_consumption', 'waste') THEN
    v_signed_qty := -NEW.quantity;
  ELSIF NEW.type IN ('reversal', 'stock_return', 'order_restore') THEN
    v_signed_qty := NEW.quantity;
  ELSIF NEW.type = 'adjustment' THEN
    v_signed_qty := NEW.quantity;
  ELSIF NEW.type = 'historical_repair' THEN
    v_signed_qty := NEW.quantity;
  ELSE
    v_signed_qty := NULL;
  END IF;

  IF v_signed_qty IS NOT NULL THEN
    UPDATE ingredients
    SET current_stock = COALESCE(current_stock, 0) + v_signed_qty,
        updated_at    = now()
    WHERE id = NEW.ingredient_id;
  END IF;

  -- theoretical_stock: adjustment is set by the audit/stock-count function
  -- (counted actual), never here. historical_repair does NOT move
  -- theoretical_stock — it is the reconciliation target.
  IF NEW.type IN ('stock_in','order_consumption','waste','reversal',
                  'stock_return','order_restore') THEN
    UPDATE ingredients
    SET theoretical_stock = COALESCE(theoretical_stock, 0) + v_signed_qty,
        updated_at        = now()
    WHERE id = NEW.ingredient_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- 6. historical_repair ledger rows — one per ingredient with drift.
--    quantity = round(theoretical_stock - current_stock, 2) from the
--    0.4-H P1 classification run (read-only snapshot before this txn).
--    correlation_id is the run id; idempotency_key 'hist_repair:<id>'.
-- ------------------------------------------------------------------
INSERT INTO public.inventory_logs
  (ingredient_id, type, quantity, reason, reference_type, reference_id, correlation_id, idempotency_key, performed_by, created_at)
SELECT x.id, 'historical_repair'::public.inventory_log_type, x.q, x.reason,
       'classification'::text, 'deadbeef-0000-0000-0000-00000000d001'::uuid, 'deadbeef-0000-0000-0000-00000000d001'::uuid,
       'hist_repair:' || x.id::text, NULL, now()
FROM (VALUES
  ('ea47d32e-6695-4d29-bb64-a3b7aa88b53e'::uuid, 192000.00::numeric, 'auto'),
  ('05c45b3f-0424-4ed2-855d-b9cca44218f2'::uuid, 4730.00::numeric, 'auto'),
  ('3a5a6a1b-d379-4161-9fd1-e1bc2cc884d2'::uuid, 870.00::numeric, 'auto'),
  ('b0fef873-ea6b-491d-a112-ffdc0839311a'::uuid, 720.00::numeric, 'auto'),
  ('b7574a3c-c334-44b2-bcae-fe6d86fac6bf'::uuid, 590.00::numeric, 'auto'),
  ('34e85688-4547-4a91-ab98-b67db091a486'::uuid, 450.00::numeric, 'auto'),
  ('bd9d6257-bf37-4097-98b7-e2035ea009b6'::uuid, 430.00::numeric, 'auto'),
  ('550a701a-a876-4724-a3cb-7c6953696618'::uuid, 400.00::numeric, 'auto'),
  ('cc5ce05a-4dc1-4cfc-a3ed-138e9d83a6ef'::uuid, 390.00::numeric, 'auto'),
  ('81f3eacf-8578-4d9d-9df3-100881e47110'::uuid, 370.00::numeric, 'auto'),
  ('9deb2324-c50c-4819-950b-f2e655c91327'::uuid, 350.00::numeric, 'auto'),
  ('bff711c7-4267-4577-ae77-72f0e9f0d6dd'::uuid, 200.00::numeric, 'auto'),
  ('7d80c00d-fd30-4886-b72b-902bc393aa6e'::uuid, 155.00::numeric, 'auto'),
  ('7fc3a645-0edc-49c7-b462-80c80adefd9d'::uuid, 148.00::numeric, 'auto'),
  ('d7c04347-2b1d-4e02-b860-630c96a60329'::uuid, 100.00::numeric, 'auto'),
  ('480bb17f-9fd2-4990-9c91-707b7aa065ee'::uuid, 90.00::numeric, 'auto'),
  ('f75f8011-e862-40a7-8f7c-620bfdf75ff5'::uuid, 80.00::numeric, 'auto'),
  ('33c4b392-8279-4199-9476-725b0f601f93'::uuid, 70.00::numeric, 'auto'),
  ('990bc1b5-fbf5-4213-abf3-45cf5995720c'::uuid, 70.00::numeric, 'auto'),
  ('11387ccd-f69c-48e6-94ed-d1a53a60b434'::uuid, 60.00::numeric, 'auto'),
  ('e27b25a7-76fb-4e31-ad96-ceadd3eed9ba'::uuid, 57.00::numeric, 'auto'),
  ('81de8999-d6a4-4b9b-b4da-95e031773ee0'::uuid, 52.00::numeric, 'auto'),
  ('648b777b-e605-436c-a808-6fa6ed988fdb'::uuid, 50.00::numeric, 'auto'),
  ('90742845-d959-4f33-86dc-2cc3cbc56482'::uuid, 13.00::numeric, 'auto'),
  ('2a0fa3eb-154c-440b-88b2-216343ec3990'::uuid, 5.00::numeric, 'auto'),
  ('da05caa3-e75b-43ad-b1f2-ff470a99e929'::uuid, 5.00::numeric, 'auto'),
  ('2ab60ed1-020e-4a7e-b223-6b0887aa9f4a'::uuid, -50.00::numeric, 'auto'),
  ('32886697-f27e-499d-8201-9a8a503c29c8'::uuid, -162.00::numeric, 'auto'),
  ('2e3277ae-8ad2-49d5-9339-317c31a4f7ee'::uuid, -1900.00::numeric, 'auto'),
  ('55a2b67b-3654-4191-8c0f-47100391ac6f'::uuid, -64057.00::numeric, 'auto'),
  ('8f5ce0d7-e483-48d4-b0f2-6c1b5f8e8ae7'::uuid, -199980.00::numeric, 'auto')
) x(id, q, reason)
WHERE round(COALESCE(q,0), 2) <> 0
ON CONFLICT DO NOTHING;