'use client';

export type PosRole = 'waiter' | 'cashier' | 'superadmin';
export type Role = import('./permissions').Role;

export {
  canonicalRole,
  isAtLeast,
  canManagePayment,
  canManageDiscount,
  canManageVoid,
  canManageStaff,
  requiresPin,
} from './permissions';

/**
 * Backward-compatible re-export of the legacy POS role helpers.
 * All logic now lives in the unified `./permissions` module which maps to
 * the DB RBAC permission strings. Keeping these aliases ensures existing
 * POS components keep working without changes.
 */
