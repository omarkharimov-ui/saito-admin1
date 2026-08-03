-- Migration 3: add columns referenced by deployed RPC functions that are
-- missing on the remote schema (found via automated audit of all public
-- functions vs information_schema.columns).

-- order_items.updated_at: written by every kitchen ticket function
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- orders: written by mark_ready_atomic / calculate_order_total_v2
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0;

-- products: written by mark_sold_out_atomic
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- kitchen_analytics: written by log_kitchen_analytics
ALTER TABLE public.kitchen_analytics
  ADD COLUMN IF NOT EXISTS action TEXT;

-- audit_log: written by legacy saito_* / separate_tables_v1 undo functions
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS changed_by UUID;

-- operation_logs: written by merge_tables_v4 undo payload
ALTER TABLE public.operation_logs
  ADD COLUMN IF NOT EXISTS inverse_payload JSONB;

-- reservations: written by walkin/update_reservation/merge functions
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS order_type TEXT,
  ADD COLUMN IF NOT EXISTS reservation_merge_group_id UUID,
  ADD COLUMN IF NOT EXISTS table_ids INTEGER[] DEFAULT '{}';

-- Backfill reservations.table_ids from reservation_tables for existing rows
UPDATE public.reservations r
SET table_ids = COALESCE((
  SELECT array_agg(rt.table_number ORDER BY rt.table_number)
  FROM public.reservation_tables rt
  WHERE rt.reservation_id = r.id
), '{}')
WHERE r.table_ids IS NULL OR r.table_ids = '{}';
