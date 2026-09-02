-- Add assignment column to staff table for role-aware assignment tracking
-- This column stores the role-specific assignment (e.g. floor/table for waiters,
-- cash register for cashiers, station for kitchen/bartender, location for manager/host)

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS assignment TEXT;

COMMENT ON COLUMN public.staff.assignment IS 'Role-aware assignment: floor/table for waiters, register for cashiers, station for kitchen/bartender, location for manager/host';
