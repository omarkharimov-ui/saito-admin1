-- ============================================================================
-- 20260911000003 — A#1 (scheduler): fix check_stock_thresholds()
--
-- Two pre-existing bugs surfaced when pg_cron started invoking it every 10s:
--
-- 1) AMBIGUOUS COLUMN: the FOR-loop subquery referenced `current_stock` /
--    `critical_limit` unqualified, which collides with the function's result
--    column names ("It could refer to either a PL/pgSQL variable or a table
--    column"). The final RETURN QUERY was already qualified (i.) — the loop
--    was not. Function NEVER ran successfully in production.
--
-- 2) NOTIFICATION SPAM: the function had dedupe only for discrepancy_alerts;
--    the `notifications` insert ran unconditionally → at a 10s schedule each
--    low-stock ingredient would generate a notification every 10 seconds
--    (~8640/day/ingredient). Now: a stock notification is suppressed when the
--    same one (by title) exists within the last 4 hours — same dedupe window
--    as outbox_dispatch() low-stock handler.
--
-- Schedule note: job lowered from */10s to */5 * * * * (5 min) — low-stock
-- alerts do not need second-level granularity.
--
-- Body otherwise UNCHANGED (same alerts, same return shape:
--   id, name, current_stock, critical_limit, unit for low-stock ingredients).
-- GOLDEN RULE 5: auto-commit. Idempotent (OR REPLACE).
-- ============================================================================

-- NOTE: RETURNS TABLE keeps the original OUT-parameter names so the PostgREST
-- RPC contract is unchanged. Those names (current_stock, critical_limit) are
-- EXACTLY what collides with the table columns — so every reference to the
-- `ingredients` columns below is qualified with the `i.` alias.
CREATE OR REPLACE FUNCTION public.check_stock_thresholds()
RETURNS TABLE(ingredient_id uuid, ingredient_name text, current_stock numeric, critical_limit numeric, unit text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ingredient RECORD;
BEGIN
  FOR v_ingredient IN
    SELECT * FROM ingredients i
    WHERE i.current_stock <= i.critical_limit AND i.critical_limit > 0
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM discrepancy_alerts
      WHERE source_id = v_ingredient.id::text
        AND source_table = 'ingredients'
        AND type = 'stock_vs_sales'
        AND status = 'open'
    ) THEN
      INSERT INTO discrepancy_alerts (type, severity, title, description, source_id, source_table, value, expected_value, variance_pct, status, created_at)
      VALUES ('stock_vs_sales',
        CASE WHEN v_ingredient.current_stock <= 0 THEN 'critical'
             WHEN v_ingredient.current_stock <= v_ingredient.critical_limit * 0.5 THEN 'high'
             ELSE 'medium' END,
        'Low stock: ' || v_ingredient.name,
        'Current: ' || v_ingredient.current_stock || ' ' || v_ingredient.unit || ' (threshold: ' || v_ingredient.critical_limit || ')',
        v_ingredient.id, 'ingredients', v_ingredient.current_stock, v_ingredient.critical_limit,
        GREATEST(0, (1 - v_ingredient.current_stock / NULLIF(v_ingredient.critical_limit, 0)) * 100), 'open', now());
    END IF;

    -- dedupe: suppress if the same stock notification exists within 4 hours
    IF NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE type = 'stock'
        AND title = 'Ehtiyat azalıb: ' || v_ingredient.name
        AND created_at >= now() - interval '4 hours'
    ) THEN
      INSERT INTO notifications (type, title, body, data, created_at)
      VALUES ('stock', 'Ehtiyat azalıb: ' || v_ingredient.name,
        'Cari: ' || v_ingredient.current_stock || ' ' || v_ingredient.unit || ' (limit: ' || v_ingredient.critical_limit || ')',
        jsonb_build_object('ingredient_id', v_ingredient.id, 'current_stock', v_ingredient.current_stock, 'critical_limit', v_ingredient.critical_limit, 'unit', v_ingredient.unit), now());
    END IF;
  END LOOP;

  RETURN QUERY SELECT i.id, i.name::TEXT, i.current_stock, i.critical_limit, i.unit
    FROM ingredients i WHERE i.current_stock <= i.critical_limit AND i.critical_limit > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_stock_thresholds() TO service_role;
