-- Add ready state to table lifecycle for dine-in flow
-- ready = food is ready, waiter needs to serve
-- dining = food served to table

INSERT INTO public.state_transitions (entity, from_status, to_status, description, requires_role, requires_manager_pin)
VALUES 
  ('table', 'in_kitchen', 'ready', 'Food ready for service', NULL, false),
  ('table', 'ready', 'dining', 'Food served to table', NULL, false)
ON CONFLICT (entity, from_status, to_status) DO NOTHING;