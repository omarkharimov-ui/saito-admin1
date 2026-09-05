-- ============================================================
-- PHASE 0.2-C4: Cross-Entity Consistency — Order -> Reservation
-- Invariant: if orders.reservation_id is set, the order and its
--            reservation must share the same location/organization.
-- Enforcement: BEFORE trigger (reservation link is optional).
-- Verified: all 62 orders with a reservation already consistent (0 mismatch).
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_order_reservation_location()
RETURNS trigger AS $$
DECLARE
    res_rec RECORD;
BEGIN
    IF NEW.reservation_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT rv.location_id, rv.organization_id INTO res_rec
    FROM reservations rv WHERE rv.id = NEW.reservation_id;
    IF FOUND AND (res_rec.location_id IS DISTINCT FROM NEW.location_id
                  OR res_rec.organization_id IS DISTINCT FROM NEW.organization_id) THEN
        RAISE EXCEPTION 'Order reservation must belong to same location/organization as the order (order location=% org=%, reservation location=% org=%)',
            NEW.location_id, NEW.organization_id, res_rec.location_id, res_rec.organization_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_reservation_location ON orders;
CREATE TRIGGER trg_order_reservation_location
BEFORE INSERT OR UPDATE OF reservation_id, location_id, organization_id ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_order_reservation_location();
