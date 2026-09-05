-- ============================================================
-- PHASE 0.2-C1: Cross-Entity Consistency — Reservation -> Table
-- Invariant: every table referenced by reservation.table_ids must
--            belong to the same location/organization as the reservation.
-- Enforcement: BEFORE trigger (table_ids is an array, not FK-able).
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_reservation_table_location()
RETURNS trigger AS $$
DECLARE
    t RECORD;
    mismatch boolean := false;
BEGIN
    IF NEW.table_ids IS NULL OR cardinality(NEW.table_ids) = 0 THEN
        RETURN NEW;
    END IF;
    FOR t IN
        SELECT tf.table_number, tf.location_id, tf.organization_id
        FROM table_floors tf
        WHERE tf.table_number = ANY (NEW.table_ids)
    LOOP
        IF t.location_id IS DISTINCT FROM NEW.location_id
           OR t.organization_id IS DISTINCT FROM NEW.organization_id THEN
            mismatch := true;
            EXIT;
        END IF;
    END LOOP;
    IF mismatch THEN
        RAISE EXCEPTION 'Reservation tables must belong to the same location/organization as the reservation (Allowed: location=% org=%)', NEW.location_id, NEW.organization_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservation_table_location ON reservations;
CREATE TRIGGER trg_reservation_table_location
BEFORE INSERT OR UPDATE OF table_ids, location_id, organization_id ON reservations
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_table_location();
