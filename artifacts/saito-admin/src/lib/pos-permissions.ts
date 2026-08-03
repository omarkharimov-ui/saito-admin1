'use client';

export type PosRole = 'waiter' | 'manager' | 'superadmin';

const hierarchy: Record<PosRole, number> = {
  waiter: 0,
  manager: 1,
  superadmin: 2,
};

export function isAtLeast(role: string | null | undefined, min: PosRole): boolean {
  if (!role) return false;
  const r = role.toLowerCase() as PosRole;
  const userLevel = hierarchy[r];
  if (userLevel === undefined) return false;
  return userLevel >= hierarchy[min];
}

export const canManagePayment = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageDiscount = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageVoid = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageLoss = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageDismiss = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageMergeTransfer = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageCashDrawer = (r: string | null | undefined) => isAtLeast(r, 'manager');
export const canManageStaff = (r: string | null | undefined) => isAtLeast(r, 'superadmin');
export const requiresPin = (r: string | null | undefined) => r?.toLowerCase() === 'waiter';
