-- Migration v8: Transaction safety + Reconciliation state machine
-- Drops existing objects with CASCADE first

-- ── 1. Create transaction_logs table ──────────────────────────────────────────
DROP TABLE IF EXISTS transaction_logs CASCADE;
CREATE TABLE transaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  details TEXT,
  snapshot JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transaction_logs_created_at ON transaction_logs(created_at);
CREATE INDEX idx_transaction_logs_operation ON transaction_logs(operation);
ALTER TABLE transaction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON transaction_logs FOR ALL TO service_role USING (true);

-- ── 2. Update invoice statuses ──────────────────────────────────────────────
-- Drop existing constraint if any
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- Add applied_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'applied_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN applied_at TIMESTAMPTZ;
  END IF;
END $$;

-- Update existing statuses to new lifecycle
UPDATE invoices SET status = 'draft' WHERE status = 'pending';
UPDATE invoices SET status = 'needs_review' WHERE status = 'discrepancy';
UPDATE invoices SET status = 'matched' WHERE status = 'matched';
UPDATE invoices SET status = 'partially_applied' WHERE status = 'partial';
UPDATE invoices SET status = 'applied' WHERE status = 'reconciled';

-- Add CHECK constraint for new statuses
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'draft', 'matched', 'needs_review', 'approved',
    'applied', 'rejected', 'rolled_back', 'partially_applied'
  ));

-- ── 3. Update procurement_reviews statuses ─────────────────────────────────
ALTER TABLE procurement_reviews DROP CONSTRAINT IF EXISTS procurement_reviews_status_check;
ALTER TABLE procurement_reviews ADD CONSTRAINT procurement_reviews_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'mapped', 'rolled_back'));

-- ── 4. Add severity to procurement_reviews ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_reviews' AND column_name = 'severity'
  ) THEN
    ALTER TABLE procurement_reviews ADD COLUMN severity TEXT NOT NULL DEFAULT 'medium'
      CHECK (severity IN ('critical', 'high', 'medium', 'low'));
  END IF;
END $$;

-- ── 5. Update discrepancy_alerts types ─────────────────────────────────────
ALTER TABLE discrepancy_alerts DROP CONSTRAINT IF EXISTS discrepancy_alerts_type_check;
ALTER TABLE discrepancy_alerts ADD CONSTRAINT discrepancy_alerts_type_check
  CHECK (type IN (
    'invoice_amount', 'received_qty', 'stock_vs_sales',
    'recipe_vs_actual', 'supplier_price', 'waste_vs_norm', 'margin_drop'
  ));

-- ── 6. RLS policies for new tables ─────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_all" ON transaction_logs;
CREATE POLICY "service_role_all" ON transaction_logs FOR ALL TO service_role USING (true);

-- ── 7. Atomic goods receiving function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION atomic_receive_goods(
  p_purchase_order_id UUID,
  p_stock_updates JSONB,  -- [{ingredient_id, quantity, cost_per_unit}]
  p_reviews JSONB,        -- [{product_name, quantity, unit, unit_cost, suggested_ingredient_id}]
  p_invoice_id UUID DEFAULT NULL,
  p_po_status TEXT DEFAULT 'partial',
  p_order_number TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
  v_matched INT := 0;
  v_total INT;
BEGIN
  v_total := jsonb_array_length(p_stock_updates);

  -- Update stock for matched items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_updates)
  LOOP
    UPDATE ingredients
    SET current_stock = COALESCE(current_stock, 0) + (v_item->>'quantity')::NUMERIC
    WHERE id = (v_item->>'ingredient_id')::UUID;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason, order_id)
    VALUES (
      (v_item->>'ingredient_id')::UUID,
      'stock_in',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'cost_per_unit')::NUMERIC,
      'Auto-receive from PO ' || p_order_number,
      p_purchase_order_id
    );

    v_matched := v_matched + 1;
  END LOOP;

  -- Insert reviews
  IF jsonb_array_length(p_reviews) > 0 THEN
    INSERT INTO procurement_reviews (purchase_order_id, invoice_id, product_name, quantity, unit, unit_cost, suggested_ingredient_id, status, severity)
    SELECT
      p_purchase_order_id,
      p_invoice_id,
      (v_item->>'product_name')::TEXT,
      (v_item->>'quantity')::NUMERIC,
      COALESCE((v_item->>'unit')::TEXT, 'gram'),
      (v_item->>'unit_cost')::NUMERIC,
      (v_item->>'suggested_ingredient_id')::UUID,
      'pending',
      'medium'
    FROM jsonb_array_elements(p_reviews) AS v_item;
  END IF;

  -- Update PO status
  UPDATE purchase_orders
  SET status = p_po_status, received_at = NOW()
  WHERE id = p_purchase_order_id;

  -- Log transaction
  INSERT INTO transaction_logs (operation, status, details)
  VALUES ('atomic_receive_goods', 'completed',
    'PO:' || p_purchase_order_id || ' matched:' || v_matched || '/' || v_total);

  RETURN jsonb_build_object(
    'success', true,
    'matched', v_matched,
    'total', v_total,
    'reviews', jsonb_array_length(p_reviews)
  );
END;
$$;

-- ── 8. Atomic invoice apply function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION atomic_apply_invoice(
  p_invoice_id UUID,
  p_stock_updates JSONB  -- [{ingredient_id, quantity, cost_per_unit, product_name}]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
  v_applied INT := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_updates)
  LOOP
    UPDATE ingredients
    SET current_stock = COALESCE(current_stock, 0) + (v_item->>'quantity')::NUMERIC
    WHERE id = (v_item->>'ingredient_id')::UUID;

    INSERT INTO inventory_logs (ingredient_id, type, quantity, cost_per_unit, reason)
    VALUES (
      (v_item->>'ingredient_id')::UUID,
      'stock_in',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'cost_per_unit')::NUMERIC,
      'Invoice apply: ' || (v_item->>'product_name')::TEXT
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
$$;
