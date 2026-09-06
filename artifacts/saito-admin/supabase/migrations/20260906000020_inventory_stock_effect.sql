-- ============================================================
-- 0.4-H / M2 — Single Stock-Mutation Path (H5)
--
-- Fixes the double-deduction defect at its root: two AFTER INSERT
-- triggers (deduct_stock_on_consumption + update_stock_on_log) both
-- decremented ingredients.current_stock for the same order_consumption
-- row. Replaced by ONE AFTER INSERT row-trigger that applies the
-- canonical effect matrix (§5.2). Writers become log-only; the input
-- of ingredients is exhausted to the ledger trigger.
--
-- KEPT unchanged in this migration:
--   trg_inventory_log_order_location   (BEFORE; enforced on INSERT)
--   trg_set_inventory_log_unit_cost    (BEFORE INSERT; fills unit_cost,
--      no stock mutation - deviation from plan SS5.1 drop list to avoid
--      a unit_cost NULL regression for REST direct-insert writers)
--   trg_product_availability_on_stock  (statement-level; availability nudge)
--   apply_wac_on_stock_in              (stock_in WAC recompute; never
--      touches current_stock). Fires BEFORE the effect trigger
--      (FOLLOWS ordering below) so it reads pre-increment stock.
--
-- Stock-effect matrix (no GREATEST clamp => read-model == ledger math):
--   stock_in            current +q, theoretical +q
--   order_consumption   current -q, theoretical -q
--   reversal            current +q, theoretical +q
--   stock_return / order_restore  current +q, theoretical +q   (was wrongly -q)
--   waste               current -q, theoretical -q
--   adjustment          current +q (signed variance); theoretical NOT touched
--                       (audit/stock-count fns set theoretical = counted actual)
--   historical_repair   current +q, theoretical +q  (signed, computed by H10)
--   (future/unknown)    no-op, forward compatible
-- ============================================================

-- 1. The single stock-mutation trigger
CREATE OR REPLACE FUNCTION public.trg_apply_inventory_effect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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
  -- (counted actual), never here.
  IF NEW.type IN ('stock_in','order_consumption','waste','reversal',
                  'stock_return','order_restore','historical_repair') THEN
    UPDATE ingredients
    SET theoretical_stock = COALESCE(theoretical_stock, 0) + v_signed_qty,
        updated_at        = now()
    WHERE id = NEW.ingredient_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger name is chosen so that alphabetical firing order is correct:
-- PG fires same-event row triggers alphabetically by name, so
--   trg_wac_on_stock_in  ('w')  fires BEFORE
--   trg_z_inventory_log_effect ('z')
-- => for stock_in, WAC recompute runs first (reads pre-increment
--    current_stock for the correct weighted average); the effect trigger
--    then moves stock. Non-stock_in rows fire the effect trigger only.
CREATE TRIGGER trg_z_inventory_log_effect
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_inventory_effect();

-- 2. Drop legacy mutation triggers (double deduction, wrong decrement on
--    stock_return/order_restore, redundant theoretical update).
DROP TRIGGER IF EXISTS trg_inventory_logs_after_insert ON public.inventory_logs;
DROP TRIGGER IF EXISTS trg_update_stock_on_log         ON public.inventory_logs;
DROP TRIGGER IF EXISTS trg_theoretical_stock           ON public.inventory_logs;

-- 3. Writers become log-only: remove explicit current_stock UPDATEs.
--    process_stock_in: was UPDATE ingredients (stock +q AND WAC) + INSERT log
--      => double-add. Now log-only; stock moves via trigger, WAC via
--      apply_wac_on_stock_in, purchase_price via apply_wac_on_stock_in.
CREATE OR REPLACE FUNCTION public.process_stock_in(p_ingredient_id uuid, p_quantity numeric, p_unit_cost numeric DEFAULT NULL::numeric, p_reason text DEFAULT 'stock_in'::text, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_stock NUMERIC;
  v_ingredient RECORD;
BEGIN
  PERFORM public.validate_actor(p_performed_by);
  SELECT * INTO v_ingredient FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  v_old_stock := COALESCE(v_ingredient.current_stock, 0);

  INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
  VALUES (p_ingredient_id, 'stock_in', p_quantity, p_unit_cost, p_reason,
    p_reference_type, p_reference_id,
    'Stock in: +' || p_quantity || ' @ ' || COALESCE(p_unit_cost::TEXT, '0'), now());

  RETURN jsonb_build_object('success', true, 'ingredient_id', p_ingredient_id,
    'previous_stock', v_old_stock, 'new_stock', v_old_stock + p_quantity,
    'new_avg_cost', (SELECT average_cost_per_unit FROM ingredients WHERE id = p_ingredient_id),
    'purchase_price', (SELECT purchase_price FROM ingredients WHERE id = p_ingredient_id));
END;
$function$;

--    perform_stock_audit: variance ledger row + theoretical read-model set.
--    current_stock now lands at counted actual through the ledger trigger
--    (variance = actual - current), matching the pre-migration final state.
CREATE OR REPLACE FUNCTION public.perform_stock_audit(p_ingredient_id uuid, p_actual_qty numeric, p_reason text DEFAULT 'physical_count'::text, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ingredient RECORD;
  v_variance NUMERIC;
  v_variance_pct NUMERIC;
  v_alert_id UUID;
BEGIN
  SELECT * INTO v_ingredient FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_variance := p_actual_qty - COALESCE(v_ingredient.current_stock, 0);
  v_variance_pct := CASE
    WHEN COALESCE(v_ingredient.current_stock, 0) > 0
    THEN ABS(v_variance) / v_ingredient.current_stock * 100
    ELSE 0
  END;

  INSERT INTO inventory_logs (
    ingredient_id, type, quantity, cost_per_unit, reason,
    reference_type, reference_id
  ) VALUES (
    p_ingredient_id, 'adjustment', v_variance, v_ingredient.average_cost_per_unit,
    'Audit: ' || COALESCE(p_reason, 'physical_count'),
    'audit', gen_random_uuid()::TEXT
  );

  UPDATE ingredients SET
    theoretical_stock = GREATEST(0, p_actual_qty),
    updated_at = now()
  WHERE id = p_ingredient_id;

  v_variance_pct := CASE
    WHEN COALESCE(v_ingredient.current_stock, 0) > 0
    THEN ABS(v_variance) / v_ingredient.current_stock * 100
    ELSE 0
  END;

  IF v_variance_pct > 10 THEN
    INSERT INTO notifications (type, title, body, data, created_at)
    VALUES (
      'alert',
      'Böyük stok fərqi',
      v_ingredient.name || ' — fərq: ' || ROUND(ABS(v_variance), 2) || ' (' || ROUND(v_variance_pct, 1) || '%)',
      jsonb_build_object('ingredient_id', p_ingredient_id, 'variance', v_variance, 'variance_pct', v_variance_pct),
      now()
    )
    RETURNING id INTO v_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ingredient_id', p_ingredient_id,
    'variance', v_variance,
    'variance_pct', v_variance_pct,
    'new_stock', GREATEST(0, p_actual_qty),
    'alert_id', v_alert_id
  );
END;
$function$;

--    apply_stock_count: same rule - variance ledger row; theoretical
--    read-model set to counted actual; current lands via the trigger.
CREATE OR REPLACE FUNCTION public.apply_stock_count(p_count_id uuid, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item RECORD;
  v_count RECORD;
  v_total_variance NUMERIC(12,2) := 0;
  v_variance_pct NUMERIC;
  v_alert_id UUID;
BEGIN
  SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_count.status != 'completed' THEN RAISE EXCEPTION 'COUNT_NOT_COMPLETED' USING ERRCODE = 'P0001'; END IF;
  IF v_count.status = 'cancelled' THEN RAISE EXCEPTION 'COUNT_CANCELLED' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN
    SELECT sci.*, i.name AS ingredient_name, i.current_stock, i.average_cost_per_unit
    FROM stock_count_items sci
    JOIN ingredients i ON i.id = sci.ingredient_id
    WHERE sci.stock_count_id = p_count_id
    FOR UPDATE OF i
  LOOP
    v_variance_pct := CASE WHEN v_item.system_qty > 0 THEN ABS(v_item.variance) / v_item.system_qty * 100 ELSE 0 END;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, reference_type, reference_id, notes, created_at)
    VALUES (v_item.ingredient_id, 'adjustment', v_item.variance, v_item.average_cost_per_unit,
      'stock_count', 'stock_count', p_count_id,
      'Stock count: ' || v_item.actual_qty || ' (system: ' || v_item.system_qty || ')', now());

    UPDATE ingredients SET theoretical_stock = v_item.actual_qty, updated_at = now()
    WHERE id = v_item.ingredient_id;

    v_total_variance := v_total_variance + ABS(v_item.variance_cost);

    IF v_variance_pct > 10 AND ABS(v_item.variance) > 0 THEN
      INSERT INTO discrepancy_alerts (type, severity, title, description, source_id, source_table, value, expected_value, variance_pct, status, created_at)
      VALUES ('stock_vs_sales',
        CASE WHEN v_variance_pct > 50 THEN 'critical' WHEN v_variance_pct > 25 THEN 'high' ELSE 'medium' END,
        'Stock count variance: ' || v_item.ingredient_name,
        'Count ' || v_item.actual_qty || ' vs system ' || v_item.system_qty || ' (' || ROUND(v_variance_pct, 1) || '%)',
        v_item.ingredient_id, 'ingredients', v_item.actual_qty, v_item.system_qty, v_variance_pct, 'open', now());
    END IF;
  END LOOP;

  UPDATE stock_counts SET total_variance = v_total_variance, updated_at = now() WHERE id = p_count_id;

  RETURN jsonb_build_object('success', true, 'count_id', p_count_id, 'total_variance', v_total_variance, 'count_number', v_count.count_number);
END;
$function$;