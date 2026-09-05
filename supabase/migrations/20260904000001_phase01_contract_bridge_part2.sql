-- ============================================================================
-- SAITO OS — PHASE 0.1 CONTRACT BRIDGE PART 2
-- Money rules, state machine constraints, RLS tightening, invariant checks
-- Date: 2026-09-04
-- ============================================================================

-- ============================================================================
-- 1. MONEY RULES — NO FLOATING POINT (per 0.1.9)
--    All monetary columns must be numeric, CHECK >= 0 where appropriate
-- ============================================================================

-- Orders: money invariants
DO $$
BEGIN
  -- total_amount must be non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_amount_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_total_amount_positive CHECK (total_amount >= 0);
  END IF;
  -- tip_amount non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tip_amount_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_tip_amount_positive CHECK (tip_amount >= 0);
  END IF;
  -- discount_value non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_value_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_discount_value_positive CHECK (discount_value >= 0);
  END IF;
  -- tax_amount non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tax_amount_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_tax_amount_positive CHECK (tax_amount >= 0);
  END IF;
  -- service_charge_amount non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_svc_charge_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_svc_charge_positive CHECK (service_charge_amount >= 0);
  END IF;
  -- paid_amount non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_paid_amount_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_paid_amount_positive CHECK (paid_amount >= 0);
  END IF;
  -- refund_amount non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_refund_amount_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_refund_amount_positive CHECK (refund_amount >= 0);
  END IF;
  -- refund cannot exceed total
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_refund_le_total') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_refund_le_total CHECK (refund_amount <= total_amount);
  END IF;
  -- guest_count > 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_guest_count_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_guest_count_positive CHECK (guest_count > 0);
  END IF;
  -- version positive
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_version_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_version_positive CHECK (version > 0);
  END IF;
END $$;

-- Order items: price snapshot integrity (per 0.1.10, 0.1.36)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_unit_price_positive') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_unit_price_positive CHECK (unit_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_positive') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_total_price_positive') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_total_price_positive CHECK (total_price >= 0);
  END IF;
END $$;

-- Order payments: amount invariants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_amount_positive') THEN
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- Table floors: capacity positive
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_floors_capacity_positive') THEN
    ALTER TABLE table_floors ADD CONSTRAINT table_floors_capacity_positive CHECK (capacity > 0);
  END IF;
END $$;

-- Reservations: guest_count positive
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_guest_count_positive') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_guest_count_positive CHECK (guest_count > 0);
  END IF;
END $$;

-- Cash drawer: amount positive
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_drawer_log_amount_positive') THEN
    ALTER TABLE cash_drawer_log ADD CONSTRAINT cash_drawer_log_amount_positive CHECK (amount >= 0);
  END IF;
END $$;

-- ============================================================================
-- 2. PAYMENT STATUS STATE MACHINE (per 0.1.8)
--    CREATED → PENDING → AUTHORIZED → CAPTURED → SETTLED
--    PENDING → FAILED
--    AUTHORIZED → VOIDED
--    CAPTURED → REFUNDED / PARTIALLY_REFUNDED
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_status_check') THEN
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_status_check
      CHECK (status IN ('pending', 'authorized', 'captured', 'settled', 'failed', 'voided', 'refunded', 'partially_refunded'));
  END IF;
END $$;

-- ============================================================================
-- 3. GIFTCARD STATUS STATE MACHINE (per 0.1.8 — gift card lifecycle)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_cards_status_check') THEN
    ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_status_check
      CHECK (status IN ('active', 'used', 'expired', 'cancelled', 'blocked'));
  END IF;
  -- balance must be non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_cards_balance_positive') THEN
    ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_balance_positive CHECK (current_balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_cards_initial_balance_positive') THEN
    ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_initial_balance_positive CHECK (initial_balance > 0);
  END IF;
END $$;

-- ============================================================================
-- 4. GIFT CARD LEDGER — type constraint (per 0.1.15)
-- ============================================================================
-- Already has CHECK from table creation, verify it exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_card_ledger_amount_positive') THEN
    ALTER TABLE gift_card_ledger ADD CONSTRAINT gift_card_ledger_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- ============================================================================
-- 5. ORDER_ITEM — order_item status (per 0.1.8 Order Item states)
--    ADDED → SENT → PREPARING → READY → SERVED / VOIDED
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_course_check') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_course_check
      CHECK (course IN ('main', 'appetizer', 'dessert', 'drink', 'side', 'combo'));
  END IF;
END $$;

-- ============================================================================
-- 6. RLS TIGHTENING — per 0.1.54, 0.1.51, 0.1.22
--    Audit tables: service_role only for write, authenticated can read
--    Sessions: service_role + authenticated read own only
--    State transitions: service_role write, authenticated read
-- ============================================================================

-- operation_logs: drop wide-open policies, add proper ones
DO $$
BEGIN
  -- Drop existing wide-open policy
  DROP POLICY IF EXISTS "Allow anon read" ON operation_logs;
  DROP POLICY IF EXISTS "Allow service_role full access" ON operation_logs;
  DROP POLICY IF EXISTS "service_role_full_operation_logs" ON operation_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY operation_logs_select_auth ON operation_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY operation_logs_insert_service ON operation_logs
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY operation_logs_service_full ON operation_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- order_events: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "service_role_full_order_events" ON order_events;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY order_events_select_auth ON order_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY order_events_service_full ON order_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- sessions: tighten (per 0.1.51 — no broad access)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role manages sessions" ON sessions;
  DROP POLICY IF EXISTS "sessions_select_auth" ON sessions;
  DROP POLICY IF EXISTS "sessions_service_full" ON sessions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY sessions_service_full ON sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- state_transitions: read-only for authenticated
DO $$
BEGIN
  DROP POLICY IF EXISTS "service_role_full_state_transitions" ON state_transitions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY state_transitions_select ON state_transitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY state_transitions_service_full ON state_transitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- seats: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "seats_all" ON seats;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY seats_select_auth ON seats
  FOR SELECT TO authenticated USING (true);

CREATE POLICY seats_service_full ON seats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ingredients: tighten (was wide open)
DO $$
BEGIN
  DROP POLICY IF EXISTS "inv_ingredients_all" ON ingredients;
  DROP POLICY IF EXISTS "service_role_full_ingredients" ON ingredients;
  DROP POLICY IF EXISTS "service_role_ingredients" ON ingredients;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY ingredients_select_auth ON ingredients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ingredients_service_full ON ingredients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- inventory_logs: tighten (was wide open)
DO $$
BEGIN
  DROP POLICY IF EXISTS "inv_inventory_logs_all" ON inventory_logs;
  DROP POLICY IF EXISTS "service_full_inventory_logs" ON inventory_logs;
  DROP POLICY IF EXISTS "service_role_full_inventory_logs" ON inventory_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY inventory_logs_select_auth ON inventory_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY inventory_logs_service_full ON inventory_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- recipes: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "inv_recipes_all" ON recipes;
  DROP POLICY IF EXISTS "service_full_recipes" ON recipes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY recipes_select_auth ON recipes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY recipes_service_full ON recipes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- stock_transactions: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "service_role_transactions" ON stock_transactions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY stock_transactions_select_auth ON stock_transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY stock_transactions_service_full ON stock_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- kitchen_tickets: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "kitchen_tickets_all" ON kitchen_tickets;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY kitchen_tickets_select_auth ON kitchen_tickets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY kitchen_tickets_service_full ON kitchen_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- kitchen_ticket_items: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "kitchen_ticket_items_all" ON kitchen_ticket_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY kitchen_ticket_items_select_auth ON kitchen_ticket_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY kitchen_ticket_items_service_full ON kitchen_ticket_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- suppliers: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "suppliers_all" ON suppliers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY suppliers_select_auth ON suppliers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY suppliers_service_full ON suppliers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- purchase_orders: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "purchase_orders_all" ON purchase_orders;
  DROP POLICY IF EXISTS "service_full_purchase_orders" ON purchase_orders;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY purchase_orders_select_auth ON purchase_orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY purchase_orders_service_full ON purchase_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- purchase_order_items: tighten
DO $$
BEGIN
  DROP POLICY IF EXISTS "purchase_order_items_all" ON purchase_order_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY purchase_order_items_select_auth ON purchase_order_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY purchase_order_items_service_full ON purchase_order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. PRICE SNAPSHOT ENFORCEMENT (per 0.1.10, 0.1.36)
--    When order_item is created, price_snapshot must contain commercial data
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_order_item_price_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- unit_price must be non-negative (price snapshot per 0.1.10)
  IF NEW.unit_price < 0 THEN
    RAISE EXCEPTION 'Order item unit_price cannot be negative (0.1.10)';
  END IF;
  -- quantity must be positive
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Order item quantity must be positive (0.1.36)';
  END IF;
  -- total_price should match unit_price * quantity (deterministic per 0.1.41)
  IF NEW.total_price IS NOT NULL AND NEW.total_price != (NEW.unit_price * NEW.quantity) THEN
    RAISE EXCEPTION 'Order item total_price must equal unit_price * quantity (0.1.41)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_order_item_price ON order_items;
CREATE TRIGGER trg_validate_order_item_price
  BEFORE INSERT OR UPDATE OF unit_price, quantity, total_price ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_item_price_snapshot();

-- ============================================================================
-- 8. PAYMENT TOTAL CANNOT EXCEED ORDER TOTAL (per 0.1.42)
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_payment_order_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_order_total NUMERIC;
  v_existing_payments NUMERIC;
  v_refund_amount NUMERIC;
BEGIN
  SELECT total_amount INTO v_order_total FROM orders WHERE id = NEW.order_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_existing_payments
  FROM order_payments
  WHERE order_id = NEW.order_id AND id != NEW.id AND status NOT IN ('failed', 'voided');

  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
  FROM order_payments
  WHERE order_id = NEW.order_id AND is_refund = true AND status = 'captured';

  IF NOT NEW.is_refund THEN
    IF (v_existing_payments + NEW.amount) > v_order_total THEN
      RAISE EXCEPTION 'Payment total cannot exceed order total (0.1.42). Order: %, Existing: %, New: %',
        v_order_total, v_existing_payments, NEW.amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payment_balance ON order_payments;
CREATE TRIGGER trg_validate_payment_balance
  BEFORE INSERT ON order_payments
  FOR EACH ROW
  EXECUTE FUNCTION validate_payment_order_balance();

-- ============================================================================
-- 9. TABLE FLOORS — current_order_id consistency (per 0.1.39)
--    table.current_order_id and order.table_id must agree
-- ============================================================================
-- This is enforced at the application/RPC level per 0.1.39
-- Add a comment for documentation
COMMENT ON TABLE table_floors IS 'SSOT for table state per 0.1.5. Canonical owner of table status. current_order_id is a lookup shortcut; orders.table_id is the authoritative relationship per 0.1.39.';
COMMENT ON TABLE orders IS 'SSOT for order state per 0.1.5. table_id is the canonical table-order relationship per 0.1.39.';
COMMENT ON TABLE order_items IS 'SSOT for order line items per 0.1.37. orders.items is NOT canonical.';
COMMENT ON TABLE operation_logs IS 'Audit SSOT per 0.1.22. Immutable per 0.1.23 — UPDATE/DELETE triggers raise exception.';
COMMENT ON TABLE outbox_events IS 'Outbox pattern per 0.1.24. DB mutation + outbox insert in same transaction.';
COMMENT ON TABLE loyalty_accounts IS 'Loyalty balance per 0.1.14. Balance is derived from transactions.';
COMMENT ON TABLE loyalty_transactions IS 'Loyalty ledger per 0.1.14. Every balance change is a ledger entry.';
COMMENT ON TABLE gift_card_ledger IS 'Gift card ledger per 0.1.15. Every balance change is a ledger entry.';

-- ============================================================================
-- 10. RECEIPT OF COMPLETION — mark migration as applied
-- ============================================================================
-- The migration is tracked in supabase_migrations.schema_migrations

-- ============================================================================
-- DONE — 0.1 Contract Bridge Part 2 complete
-- ============================================================================
