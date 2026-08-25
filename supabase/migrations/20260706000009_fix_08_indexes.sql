-- ============================================================================
-- FIX 8/8: Missing indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ingredients_critical ON ingredients(critical_limit) WHERE critical_limit > 0;
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(date, status);
CREATE INDEX IF NOT EXISTS idx_table_floors_status ON table_floors(status);
CREATE INDEX IF NOT EXISTS idx_table_floors_reservation ON table_floors(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders(kitchen_status) WHERE kitchen_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_reservation ON orders(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(status, start_date, end_date);
