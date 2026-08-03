-- ============================================================================
-- FIX 27: Add terminal/session tracking for optimistic locking audit
-- ============================================================================
-- Adds updated_by_terminal_id to orders and order_items so the backend
-- and realtime handlers can distinguish self-generated events from actual
-- cross-terminal conflicts.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_by_terminal_id TEXT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS updated_by_terminal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_terminal_id ON orders(updated_by_terminal_id);
CREATE INDEX IF NOT EXISTS idx_order_items_terminal_id ON order_items(updated_by_terminal_id);
