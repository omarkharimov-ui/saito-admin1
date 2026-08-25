-- =====================================================================
-- SAITO — STAFF ROLE ASSIGNMENT (Phase 2: authorization foundation)
-- Link existing free-text staff.role to the canonical roles table so that
-- has_permission() / requirePermission() work. Localized labels mapped
-- explicitly; everything else falls back to lowercased role text.
-- =====================================================================

UPDATE public.staff SET role_id = (
  SELECT r.id FROM public.roles r
  WHERE r.name = CASE lower(public.staff.role)
    WHEN 'ofisiant'  THEN 'waiter'
    WHEN 'kassir'    THEN 'cashier'
    WHEN 'superadmin' THEN 'admin'
    WHEN 'admin'     THEN 'admin'
    WHEN 'menecer'   THEN 'manager'
    WHEN 'menedjer'  THEN 'manager'
    ELSE lower(public.staff.role)
  END
) WHERE public.staff.role_id IS NULL;
