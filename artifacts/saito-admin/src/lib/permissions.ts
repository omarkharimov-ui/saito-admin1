'use client';

export type Role = 'superadmin' | 'admin' | 'manager' | 'cashier' | 'kitchen' | 'waiter' | 'bartender' | 'host' | 'owner';

export type Permission =
  | 'dashboard.view'
  | 'pos.use'
  | 'pos.payment'
  | 'pos.discount'
  | 'pos.void'
  | 'staff.view'
  | 'staff.manage'
  | 'roles.manage'
  | 'schedule.view'
  | 'schedule.manage'
  | 'timeclock.use'
  | 'timeclock.override'
  | 'reports.view'
  | 'payroll.view'
  | 'payroll.manage'
  | 'tips.view'
  | 'tips.manage'
  | 'inventory.view'
  | 'inventory.manage'
  | 'reservations.view'
  | 'reservations.manage'
  | 'campaigns.view'
  | 'campaigns.manage'
  | 'settings.view'
  | 'settings.admin'
  | 'kitchen.view'
  | 'announcements.manage'
  | 'shiftswap.manage'
  | 'own.profile'
  | 'own.shifts'
  | 'own.payroll'
  | 'own.tips';

export interface PermissionRule {
  page: string;
  permission: Permission;
}

/**
 * Unified permission model.
 *
 * This is the SINGLE source of truth for frontend permissions, replacing both
 * the legacy `permissions.ts` hard-coded matrix and the POS-only
 * `pos-permissions.ts` hierarchy. Every permission string here maps 1:1 to a
 * value in the DB `permissions` table and is enforced server-side via the
 * `has_permission` RPC (see api-auth.ts requirePermission).
 *
 * -- DB-backed fallback ---------------------------------------------
 * The UI can call `has_permission` RPC directly for fine-grained checks, but
 * for fast sync page gating we keep this static map. Roles NOT listed for a
 * page default to NO access. superadmin is implicit ALLOW.
 */
export const PERMISSION_MATRIX: PermissionRule[] = [
  { page: '/admin/dashboard', permission: 'dashboard.view' },

  { page: '/admin/pos', permission: 'pos.use' },
  { page: '/admin/pos', permission: 'pos.payment' },

  { page: '/admin/reservations', permission: 'reservations.view' },

  { page: '/admin/products', permission: 'inventory.manage' },
  { page: '/admin/combos', permission: 'inventory.manage' },
  { page: '/admin/recipes', permission: 'inventory.manage' },
  { page: '/admin/stock', permission: 'inventory.view' },
  { page: '/admin/purchase-orders', permission: 'inventory.manage' },
  { page: '/admin/waste-standards', permission: 'inventory.manage' },
  { page: '/admin/kitchen-analytics', permission: 'kitchen.view' },

  { page: '/admin/staff', permission: 'staff.view' },
  { page: '/admin/staff/roles', permission: 'roles.manage' },
  { page: '/admin/staff/shifts', permission: 'schedule.view' },
  { page: '/admin/shifts', permission: 'schedule.view' },

  { page: '/admin/campaigns', permission: 'campaigns.view' },

  { page: '/admin/stats', permission: 'reports.view' },
  { page: '/admin/audit', permission: 'reports.view' },
  { page: '/admin/history', permission: 'reports.view' },
  { page: '/admin/loss-prevention', permission: 'reports.view' },
  { page: '/admin/orders', permission: 'pos.use' },
  { page: '/admin/tables', permission: 'pos.use' },

  { page: '/admin/settings', permission: 'settings.view' },
];

/** Default permission set per role. Used as fallback when DB is unreachable. */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: ['dashboard.view','pos.use','pos.payment','pos.discount','pos.void','staff.view','staff.manage','roles.manage','schedule.view','schedule.manage','timeclock.use','timeclock.override','reports.view','payroll.view','payroll.manage','tips.view','tips.manage','inventory.view','inventory.manage','reservations.view','reservations.manage','campaigns.view','campaigns.manage','settings.view','settings.admin','kitchen.view','announcements.manage','shiftswap.manage','own.profile','own.shifts','own.payroll','own.tips'],
  owner: ['dashboard.view','pos.use','pos.payment','pos.discount','pos.void','staff.view','staff.manage','roles.manage','schedule.view','schedule.manage','timeclock.use','timeclock.override','reports.view','payroll.view','payroll.manage','tips.view','tips.manage','inventory.view','inventory.manage','reservations.view','reservations.manage','campaigns.view','campaigns.manage','settings.view','settings.admin','kitchen.view','announcements.manage','shiftswap.manage','own.profile','own.shifts','own.payroll','own.tips'],
  admin: ['dashboard.view','pos.use','pos.payment','pos.discount','pos.void','staff.view','schedule.view','schedule.manage','timeclock.use','timeclock.override','reports.view','tips.view','reservations.view','reservations.manage','campaigns.view','campaigns.manage','settings.view','own.profile','own.shifts','own.payroll','own.tips'],
  manager: ['dashboard.view','pos.use','pos.payment','pos.discount','pos.void','staff.view','schedule.view','schedule.manage','timeclock.use','timeclock.override','reports.view','tips.view','reservations.view','campaigns.view','own.profile','own.shifts','own.payroll','own.tips'],
  cashier: ['pos.use','pos.payment','pos.discount','pos.void','timeclock.use','own.profile','own.shifts','own.payroll','own.tips'],
  waiter: ['pos.use','timeclock.use','own.profile','own.shifts','own.payroll','own.tips'],
  kitchen: ['kitchen.view','pos.use','timeclock.use','own.profile','own.shifts','own.payroll','own.tips'],
  bartender: ['pos.use','timeclock.use','own.profile','own.shifts','own.payroll','own.tips'],
  host: ['reservations.view','timeclock.use','own.profile','own.shifts','own.payroll','own.tips'],
};

/** Canonicalize raw role strings that may arrive from DB/legacy code. */
const ROLE_ALIASES: Record<string, Role> = {
  superadmin: 'superadmin',
  owner: 'owner',
  admin: 'admin',
  menecer: 'manager',
  menedjer: 'manager',
  manager: 'manager',
  kassir: 'cashier',
  kassa: 'cashier',
  cashier: 'cashier',
  ofisiant: 'waiter',
  waiter: 'waiter',
  aspaz: 'kitchen',
  kitchen: 'kitchen',
  barmen: 'bartender',
  bartender: 'bartender',
  host: 'host',
  hostes: 'host',
};

export function canonicalRole(raw: string | null | undefined): Role | 'unknown' {
  if (!raw) return 'unknown';
  const key = raw.toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(ROLE_ALIASES, key)) return ROLE_ALIASES[key];
  return 'unknown';
}

export function roleHasPermission(
  role: Role | string | null | undefined,
  permission: Permission
): boolean {
  const r = canonicalRole(role);
  if (r === 'unknown') return false;
  const perms = ROLE_DEFAULT_PERMISSIONS[r];
  if (!perms) return false;
  return perms.includes(permission);
}

/** Check whether a role can access a page path (exact prefix match). */
export function canAccessPage(rawRole: Role | string | null | undefined, path: string): boolean {
  const role = canonicalRole(rawRole);
  if (role === 'unknown') return false;
  if (role === 'superadmin' || role === 'owner') return true;

  const rule = PERMISSION_MATRIX
    .filter((r) => path.startsWith(r.page))
    .sort((a, b) => b.page.length - a.page.length)[0];

  if (!rule) return false;
  return roleHasPermission(role, rule.permission);
}

/** Legacy POS hierarchy checks now redirect to the unified permission model. */
export function isAtLeast(role: string | null | undefined, min: 'waiter' | 'cashier' | 'superadmin'): boolean {
  const r = canonicalRole(role);
  const order: Record<string, number> = { waiter: 0, cashier: 1, manager: 1, admin: 1, superadmin: 2, owner: 2 };
  if (order[r] === undefined) return false;
  return order[r] >= (order[min] ?? 0);
}

export const canManagePayment = (r: string | null | undefined) => roleHasPermission(r, 'pos.payment');
export const canManageDiscount = (r: string | null | undefined) => roleHasPermission(r, 'pos.discount');
export const canManageVoid = (r: string | null | undefined) => roleHasPermission(r, 'pos.void');
export const canManageStaff = (r: string | null | undefined) => roleHasPermission(r, 'staff.manage');
export const requiresPin = (r: string | null | undefined) => canonicalRole(r) === 'waiter';
