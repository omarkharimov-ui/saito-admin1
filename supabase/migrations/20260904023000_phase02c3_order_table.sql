-- ============================================================
-- PHASE 0.2-C3: Cross-Entity Consistency — Order -> Table
-- Invariant: if orders.table_number exists in table_floors, the order
--            and its table must share the same location/organization.
-- Conditional enforcement via trigger (NOT FK) because:
--   - 68 legacy "orphan" orders reference table_numbers not present in
--     table_floors (11,12,13,19,24,27-30); a hard FK would break them.
--   - NULL table_number (delivery/to-go) must remain allowed.
-- Verified: all 579 matched orders already have consistent location (0 mismatch).
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_order_table_location()
RETURNS trigger AS $$
DECLARE
    t RECORD;
BEGIN
    IF NEW.table_number IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT tf.location_id, tf.organization_id INTO t
    FROM table_floors tf WHERE tf.table_number = NEW.table_number;
    IF FOUND AND (t.location_id IS DISTINCT FROM NEW.location_id
                  OR t.organization_id IS DISTINCT FROM NEW.organization_id) THEN
        RAISE EXCEPTION 'Order table % must belong to same location/organization as the order (order location=% org=%, table location=% org=%)',
            NEW.table_number, NEW.location_id, NEW.organization_id, t.location_id, t.organization_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_table_location ON orders;
CREATE TRIGGER trg_order_table_location
BEFORE INSERT OR UPDATE OF table_number, location_id, organization_id ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_order_table_location();
