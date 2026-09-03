-- =============================================
-- Unify DB permission keys with the app's unified RBAC model (src/lib/permissions.ts)
-- The DB (has_permission / requirePermission) is the source of truth for API access.
-- This seeds missing permission keys and grants them to roles to match the frontend model.
-- Idempotent: safe to re-run.
-- =============================================

-- 1) Insert missing permission keys
-- (category/description may be NULL; only `key` is required by role_permissions FK)
INSERT INTO permissions (key, name, code) VALUES
  ('dashboard.view', 'Dashboard', 'dashboard.view'),
  ('pos.use', 'POS istifadə', 'pos.use'),
  ('pos.payment', 'POS ödəniş', 'pos.payment'),
  ('pos.discount', 'POS endirim', 'pos.discount'),
  ('pos.void', 'POS ləğv', 'pos.void'),
  ('roles.manage', 'Rolların idarəsi', 'roles.manage'),
  ('schedule.view', 'Qrafikə baxış', 'schedule.view'),
  ('schedule.manage', 'Qrafikin idarəsi', 'schedule.manage'),
  ('timeclock.use', 'Davamiyyət istifadə', 'timeclock.use'),
  ('timeclock.override', 'Davamiyyət müdaxiləsi (menecer)', 'timeclock.override'),
  ('payroll.view', 'Maaş baxışı', 'payroll.view'),
  ('payroll.manage', 'Maaş idarəsi', 'payroll.manage'),
  ('tips.view', 'Çay/bəxşiş baxışı', 'tips.view'),
  ('tips.manage', 'Çay/bəxşiş idarəsi', 'tips.manage'),
  ('inventory.manage', 'Anbar idarəsi', 'inventory.manage'),
  ('campaigns.view', 'Kampaniya baxışı', 'campaigns.view'),
  ('campaigns.manage', 'Kampaniya idarəsi', 'campaigns.manage'),
  ('settings.view', 'Ayarlar baxışı', 'settings.view'),
  ('announcements.manage', 'Elanların idarəsi', 'announcements.manage'),
  ('shiftswap.manage', 'Növbə dəyişikliyi idarəsi', 'shiftswap.manage'),
  ('own.profile', 'Şəxsi profil', 'own.profile'),
  ('own.shifts', 'Şəxsi növbələr', 'own.shifts'),
  ('own.payroll', 'Şəxsi maaş', 'own.payroll'),
  ('own.tips', 'Şəxsi çay/bəxşiş', 'own.tips')
ON CONFLICT (key) DO NOTHING;

-- 2) Grant role → permission mappings (by role name) matching src/lib/permissions.ts
WITH mapping(role_name, permission_key) AS (
  VALUES
    -- superadmin: full access
    ('superadmin', 'dashboard.view'), ('superadmin', 'pos.use'), ('superadmin', 'pos.payment'),
    ('superadmin', 'pos.discount'), ('superadmin', 'pos.void'), ('superadmin', 'staff.view'),
    ('superadmin', 'staff.manage'), ('superadmin', 'roles.manage'), ('superadmin', 'schedule.view'),
    ('superadmin', 'schedule.manage'), ('superadmin', 'timeclock.use'), ('superadmin', 'timeclock.override'),
    ('superadmin', 'reports.view'), ('superadmin', 'payroll.view'), ('superadmin', 'payroll.manage'),
    ('superadmin', 'tips.view'), ('superadmin', 'tips.manage'), ('superadmin', 'inventory.view'),
    ('superadmin', 'inventory.manage'), ('superadmin', 'reservations.view'), ('superadmin', 'reservations.manage'),
    ('superadmin', 'campaigns.view'), ('superadmin', 'campaigns.manage'), ('superadmin', 'settings.view'),
    ('superadmin', 'settings.admin'), ('superadmin', 'kitchen.view'), ('superadmin', 'announcements.manage'),
    ('superadmin', 'shiftswap.manage'), ('superadmin', 'own.profile'), ('superadmin', 'own.shifts'),
    ('superadmin', 'own.payroll'), ('superadmin', 'own.tips'),

    -- owner: full access
    ('owner', 'dashboard.view'), ('owner', 'pos.use'), ('owner', 'pos.payment'),
    ('owner', 'pos.discount'), ('owner', 'pos.void'), ('owner', 'staff.view'),
    ('owner', 'staff.manage'), ('owner', 'roles.manage'), ('owner', 'schedule.view'),
    ('owner', 'schedule.manage'), ('owner', 'timeclock.use'), ('owner', 'timeclock.override'),
    ('owner', 'reports.view'), ('owner', 'payroll.view'), ('owner', 'payroll.manage'),
    ('owner', 'tips.view'), ('owner', 'tips.manage'), ('owner', 'inventory.view'),
    ('owner', 'inventory.manage'), ('owner', 'reservations.view'), ('owner', 'reservations.manage'),
    ('owner', 'campaigns.view'), ('owner', 'campaigns.manage'), ('owner', 'settings.view'),
    ('owner', 'settings.admin'), ('owner', 'kitchen.view'), ('owner', 'announcements.manage'),
    ('owner', 'shiftswap.manage'), ('owner', 'own.profile'), ('owner', 'own.shifts'),
    ('owner', 'own.payroll'), ('owner', 'own.tips'),

    -- admin
    ('admin', 'dashboard.view'), ('admin', 'pos.use'), ('admin', 'pos.payment'),
    ('admin', 'pos.discount'), ('admin', 'pos.void'), ('admin', 'staff.view'),
    ('admin', 'schedule.view'), ('admin', 'schedule.manage'), ('admin', 'timeclock.use'),
    ('admin', 'timeclock.override'), ('admin', 'reports.view'), ('admin', 'tips.view'),
    ('admin', 'reservations.view'), ('admin', 'reservations.manage'), ('admin', 'campaigns.view'),
    ('admin', 'campaigns.manage'), ('admin', 'settings.view'), ('admin', 'own.profile'),
    ('admin', 'own.shifts'), ('admin', 'own.payroll'), ('admin', 'own.tips'),

    -- manager
    ('manager', 'dashboard.view'), ('manager', 'pos.use'), ('manager', 'pos.payment'),
    ('manager', 'pos.discount'), ('manager', 'pos.void'), ('manager', 'staff.view'),
    ('manager', 'schedule.view'), ('manager', 'schedule.manage'), ('manager', 'timeclock.use'),
    ('manager', 'timeclock.override'), ('manager', 'reports.view'), ('manager', 'tips.view'),
    ('manager', 'reservations.view'), ('manager', 'campaigns.view'), ('manager', 'own.profile'),
    ('manager', 'own.shifts'), ('manager', 'own.payroll'), ('manager', 'own.tips'),

    -- cashier
    ('cashier', 'pos.use'), ('cashier', 'pos.payment'), ('cashier', 'pos.discount'),
    ('cashier', 'pos.void'), ('cashier', 'timeclock.use'), ('cashier', 'own.profile'),
    ('cashier', 'own.shifts'), ('cashier', 'own.payroll'), ('cashier', 'own.tips'),

    -- waiter
    ('waiter', 'pos.use'), ('waiter', 'timeclock.use'), ('waiter', 'own.profile'),
    ('waiter', 'own.shifts'), ('waiter', 'own.payroll'), ('waiter', 'own.tips'),

    -- kitchen
    ('kitchen', 'kitchen.view'), ('kitchen', 'pos.use'), ('kitchen', 'timeclock.use'),
    ('kitchen', 'own.profile'), ('kitchen', 'own.shifts'), ('kitchen', 'own.payroll'), ('kitchen', 'own.tips'),

    -- bartender
    ('bartender', 'pos.use'), ('bartender', 'timeclock.use'), ('bartender', 'own.profile'),
    ('bartender', 'own.shifts'), ('bartender', 'own.payroll'), ('bartender', 'own.tips'),

    -- host
    ('host', 'reservations.view'), ('host', 'timeclock.use'), ('host', 'own.profile'),
    ('host', 'own.shifts'), ('host', 'own.payroll'), ('host', 'own.tips')
)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, m.permission_key
FROM mapping m
JOIN roles r ON r.name = m.role_name
ON CONFLICT (role_id, permission_key) DO NOTHING;
