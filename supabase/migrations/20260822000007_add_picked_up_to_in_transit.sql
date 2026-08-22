-- Add picked_up → in_transit transition for delivery entity
-- Courier picks up order and is en route to customer

INSERT INTO public.state_transitions (entity, from_status, to_status, description, requires_role, requires_manager_pin)
VALUES ('delivery', 'picked_up', 'in_transit', 'Courier en route', NULL, false)
ON CONFLICT (entity, from_status, to_status) DO NOTHING;
