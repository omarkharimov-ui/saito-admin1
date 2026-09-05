-- ============================================================
-- PHASE 0.2-C5: Cross-Entity Consistency — Order -> Staff (org)
-- Invariant: order.assigned_to / order.created_by staff must belong to
--            the SAME organization as the order.
-- NOTE: location-level staff membership is enforced later in 0.2-D
--       via staff_locations. This phase only enforces org consistency.
-- Verified: all 58 assigned orders + all created_by consistent (0 mismatch).
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_order_staff_org()
RETURNS trigger AS $$
DECLARE
    st_org uuid;
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        SELECT organization_id INTO st_org FROM staff WHERE id = NEW.assigned_to;
        IF FOUND AND st_org IS DISTINCT FROM NEW.organization_id THEN
            RAISE EXCEPTION 'Assigned staff must belong to the same organization as the order (staff org=% order org=%)', st_org, NEW.organization_id;
        END IF;
    END IF;
    IF NEW.created_by IS NOT NULL THEN
        SELECT organization_id INTO st_org FROM staff WHERE id = NEW.created_by;
        IF FOUND AND st_org IS DISTINCT FROM NEW.organization_id THEN
            RAISE EXCEPTION 'Creating staff must belong to the same organization as the order (staff org=% order org=%)', st_org, NEW.organization_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_staff_org ON orders;
CREATE TRIGGER trg_order_staff_org
BEFORE INSERT OR UPDATE OF assigned_to, created_by, organization_id ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_order_staff_org();
