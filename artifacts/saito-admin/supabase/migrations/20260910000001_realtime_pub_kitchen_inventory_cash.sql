-- ─────────────────────────────────────────────────────────────────────
-- Migration 20260910000001  (task 1.3)
-- Realtime publication: add kitchen_tickets, inventory_logs, cash_drawer_sessions
-- ─────────────────────────────────────────────────────────────────────
-- Root cause (audit P0-3): the `supabase_realtime` publication only carried
--   campaigns, delivery_zones, order_items, orders, products,
--   reservation_tables, reservations, settings, table_floors.
--   KDS works via the `orders` aggregation channel (already present), but
--   there was NO direct subscription path for:
--     • kitchen_tickets   (direct ticket-level realtime, station views)
--     • inventory_logs    (admin/stock live stock feed)
--     • cash_drawer_sessions (live drawer state across terminals)
--   This migration makes those tables part of the realtime feed so future
--   (and direct) subscriptions work without another schema change.
--
-- Safety: ADD TABLE only. No data, no RLS, no contract change. Idempotent
--   guard: only add if not already a member of the publication.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.kitchen_tickets','public.inventory_logs','public.cash_drawer_sessions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname || '.' || tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
