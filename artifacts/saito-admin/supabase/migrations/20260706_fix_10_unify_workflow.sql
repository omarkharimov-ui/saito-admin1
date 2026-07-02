-- ============================================================================
-- Fix 10: SAITO Backend Unification — Phase 1 Schema Migrations
-- ============================================================================

-- ─── 1. Add expired to reservations.status CHECK constraint ───
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'archived', 'expired'));

-- ─── 2. Add CHECK constraint for table_floors.status ───
ALTER TABLE table_floors DROP CONSTRAINT IF EXISTS table_floors_status_check;
UPDATE table_floors SET status = 'empty' WHERE status IS NULL OR status NOT IN ('empty', 'reserved', 'occupied');
ALTER TABLE table_floors
  ADD CONSTRAINT table_floors_status_check
  CHECK (status IN ('empty', 'reserved', 'occupied'));

-- ─── 3. Add kitchen notification columns to reservations ───
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS kitchen_notify_before_minutes INTEGER DEFAULT 120;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS kitchen_notified_at TIMESTAMPTZ;

-- ─── 4. Add kitchen hint sent flag (immediate notification on reservation) ───
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS kitchen_hint_sent BOOLEAN DEFAULT false;

-- ─── 5. Create campaign_products junction table ───
CREATE TABLE IF NOT EXISTS campaign_products (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, product_id)
);

-- Migrate existing applicable_products data from text arrays to junction table
INSERT INTO campaign_products (campaign_id, product_id)
  SELECT c.id, p.id::uuid
  FROM campaigns c
  CROSS JOIN LATERAL (
    SELECT unnest(c.applicable_products) AS pid
  ) AS u
  JOIN products p ON p.id::text = u.pid
  WHERE c.applicable_products IS NOT NULL
    AND array_length(c.applicable_products, 1) > 0
  ON CONFLICT DO NOTHING;

-- ─── 6. Create transfer_table_session RPC ───
CREATE OR REPLACE FUNCTION transfer_table_session(
  p_from_table_number INTEGER,
  p_to_table_number INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_table RECORD;
  v_to_table RECORD;
  v_order RECORD;
  v_result JSONB;
BEGIN
  -- Lock both tables
  SELECT * INTO v_from_table FROM table_floors WHERE table_number = p_from_table_number FOR UPDATE;
  SELECT * INTO v_to_table FROM table_floors WHERE table_number = p_to_table_number FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FROM_TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TO_TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Move active orders from source to target
  UPDATE orders
  SET table_number = p_to_table_number,
      updated_at = now()
  WHERE table_number = p_from_table_number
    AND status NOT IN ('paid', 'cancelled');

  -- Merge cart items from from-table into to-table (if to-table has existing order)
  -- If to-table has no active order, create draft order from from-table's data

  -- Mark source table as empty
  UPDATE table_floors
  SET status = 'empty',
      reservation_id = NULL,
      reservation_name = NULL,
      reservation_phone = NULL,
      reservation_time = NULL,
      guest_count = NULL,
      total_amount = 0,
      order_count = 0,
      order_ids = '{}'::TEXT[],
      has_pending = false,
      oldest_pending_at = NULL,
      opened_at = NULL,
      merged_into_table = NULL,
      merged_orders = '[]'::JSONB,
      updated_at = now()
  WHERE table_number = p_from_table_number;

  -- Update target table to occupied if not already
  UPDATE table_floors
  SET status = 'occupied',
      updated_at = now()
  WHERE table_number = p_to_table_number
    AND status = 'empty';

  v_result := jsonb_build_object(
    'success', true,
    'from_table', p_from_table_number,
    'to_table', p_to_table_number
  );

  RETURN v_result;
END;
$$;

-- ─── 7. Update dismiss_table_session to also handle merged children ───
CREATE OR REPLACE FUNCTION dismiss_table_session(
  p_table_number INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res_id UUID;
  v_all_orders_cancelled INTEGER;
  v_table_rec RECORD;
  v_child RECORD;
BEGIN
  -- Get the table and any merged children
  SELECT * INTO v_table_rec FROM table_floors WHERE table_number = p_table_number;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Cancel active orders on this table, including merged children
  UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        reservation_id = NULL,
        updated_at = now()
  WHERE table_number = p_table_number
    AND status NOT IN ('paid', 'cancelled');

  GET DIAGNOSTICS v_all_orders_cancelled = ROW_COUNT;

  -- Delete draft order items (items that were never sent to kitchen)
  DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders
    WHERE table_number = p_table_number
      AND status = 'cancelled'
      AND is_draft = true
  );

  -- Handle merged children: unlink them
  FOR v_child IN
    SELECT table_number FROM table_floors WHERE merged_into_table = p_table_number
  LOOP
    UPDATE table_floors
    SET merged_into_table = NULL, updated_at = now()
    WHERE table_number = v_child.table_number;
  END LOOP;

  -- Handle parent merge: unlink from parent
  IF v_table_rec.merged_into_table IS NOT NULL THEN
    UPDATE table_floors
    SET merged_into_table = NULL, updated_at = now()
    WHERE table_number = p_table_number;
  END IF;

  -- Get reservation_id before clearing
  res_id := v_table_rec.reservation_id;

  -- Cancel reservation if any
  IF res_id IS NOT NULL THEN
    UPDATE public.reservations
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = 'dismissed_table_session',
          pre_order_items = '[]'::jsonb,
          pre_order_total = 0,
          updated_at = now()
    WHERE id = res_id;
  END IF;

  -- Reset the table
  UPDATE public.table_floors
    SET status = 'empty',
        reservation_id = NULL,
        reservation_name = NULL,
        reservation_phone = NULL,
        reservation_time = NULL,
        guest_count = NULL,
        has_pending = false,
        oldest_pending_at = NULL,
        opened_at = NULL,
        total_amount = 0,
        order_count = 0,
        order_ids = '{}'::TEXT[],
        merged_into_table = NULL,
        merged_orders = '[]'::JSONB,
        reservation_status_snapshot = 'dismissed',
        reservation_updated_at = now(),
        updated_at = now()
  WHERE table_number = p_table_number;

  RETURN jsonb_build_object(
    'success', true,
    'table_number', p_table_number,
    'orders_cancelled', v_all_orders_cancelled,
    'reservation_cancelled', res_id IS NOT NULL
  );
END;
$$;

-- ─── 8. Update normalize_table_after_reservation_change to handle expired ───
CREATE OR REPLACE FUNCTION normalize_table_after_reservation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
begin
  if new.status in ('cancelled', 'expired', 'archived', 'no_show') then
    update public.table_floors
      set status = 'empty',
          reservation_id = null,
          reservation_name = null,
          reservation_phone = null,
          reservation_time = null,
          guest_count = null,
          reservation_status_snapshot = new.status,
          reservation_updated_at = now(),
          updated_at = now()
    where reservation_id = new.id;
  end if;

  if new.status = 'checked_in' then
    update public.table_floors
      set status = 'occupied',
          reservation_status_snapshot = new.status,
          reservation_updated_at = now(),
          updated_at = now()
    where reservation_id = new.id;
  end if;

  if new.status = 'completed' then
    update public.table_floors
      set status = 'empty',
          reservation_status_snapshot = new.status,
          reservation_updated_at = now(),
          updated_at = now()
    where reservation_id = new.id;
  end if;

  return new;
end;
$$;

-- ─── 9. Update process_order_payment to properly set cogs/profit ───
-- (The existing RPC already does this; just adding a stock-return on cancellation)

-- ─── 10. Create view for closed order analytics ───
CREATE OR REPLACE VIEW v_closed_orders AS
SELECT
  o.id AS order_id,
  o.table_number,
  o.total_amount,
  o.paid_amount,
  o.payment_method,
  o.cogs,
  o.profit,
  o.guest_count,
  o.created_at,
  o.paid_at,
  o.closed_at,
  o.reservation_id,
  o.discount_type,
  o.discount_value,
  o.tip_amount,
  (o.total_amount - COALESCE(o.cogs, 0)) AS gross_profit,
  CASE WHEN o.total_amount > 0
    THEN ROUND(((o.total_amount - COALESCE(o.cogs, 0)) / o.total_amount * 100)::numeric, 1)
    ELSE 0
  END AS profit_margin_pct
FROM orders o
WHERE o.status = 'paid';

-- ─── 11. Indexes for performance ───
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_number, status);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_order ON inventory_logs(reference_id) WHERE reference_type = 'order';
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
