-- ============================================================================
-- 2026-10-01 (11z, owner: "db-də saxlanılır mı? çox güclü səviyyədə qurulubmu"):
-- AUDIT GAP — the delivery FEE was persisted (orders.delivery_fee) but the
-- KM it was charged for was NOT. Dispute ("nəyə görə ₼13.25?") had no
-- answerable trail: the OSRM road km died with the session.
--
-- delivery_km = the fee's distance input (numeric(8,1), null = legacy rows
-- or a genuinely manual KM-less flow). Written ONCE at order creation,
-- next to delivery_fee (the stored fee+km pair is the audit record; the
-- money-lock trigger protects the fee, the km is immutable context).
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_km numeric(8,1);
COMMENT ON COLUMN orders.delivery_km IS
  '11z: OSRM road km the delivery_fee was charged for (audit); null = legacy/manual';
