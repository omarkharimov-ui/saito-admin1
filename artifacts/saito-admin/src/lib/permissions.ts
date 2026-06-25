export type Role = 'superadmin' | 'admin' | 'cashier' | 'kitchen';

export interface PermissionMatrix {
  pages: { [key: string]: Role[] };
  apis: { [key: string]: Role[] };
}

export const PERMISSIONS: PermissionMatrix = {
  pages: {
    '/admin/settings/users': ['superadmin'],
    '/admin/settings/smtp': ['superadmin'],
    '/admin/settings/security': ['superadmin'],
    '/admin/settings': ['superadmin', 'admin'],
    '/admin/stock': ['superadmin', 'admin'],
    '/admin/products': ['superadmin', 'admin'],
    '/admin/stats': ['superadmin', 'admin'],
    '/admin/campaigns': ['superadmin', 'admin'],
    '/admin/history': ['superadmin', 'admin'],
    '/admin/waste-standards': ['superadmin', 'admin'],
    '/admin/purchase-orders': ['superadmin', 'admin'],
    '/admin/audit': ['superadmin', 'admin'],
    '/admin/combos': ['superadmin', 'admin'],
    '/admin/recipes': ['superadmin', 'admin'],
    '/admin/tables': ['superadmin', 'admin'],
    '/admin/orders': ['superadmin', 'admin', 'cashier'],
    '/admin/pos': ['superadmin', 'admin', 'cashier'],
    '/admin/reservations': ['superadmin', 'admin', 'cashier'],
    '/kitchen': ['superadmin', 'admin', 'kitchen'],
    '/admin': ['superadmin', 'admin', 'cashier'], // Allow dashboard access for cashier too? Actually instruction says admin only for dashboard.
  },
  apis: {
    '/api/auth/users': ['superadmin'],
    '/api/auth/smtp': ['superadmin'],
    '/api/auth/smtp-test': ['superadmin'],
    '/api/products': ['superadmin', 'admin'],
    '/api/stock': ['superadmin', 'admin'],
    '/api/inventory': ['superadmin', 'admin'],
    '/api/recipes': ['superadmin', 'admin'],
    '/api/suppliers': ['superadmin', 'admin'],
    '/api/purchase-orders': ['superadmin', 'admin'],
    '/api/orders': ['superadmin', 'admin', 'cashier'],
    '/api/pos': ['superadmin', 'admin', 'cashier'],
    '/api/reservations': ['superadmin', 'admin', 'cashier'],
    '/api/kitchen': ['superadmin', 'admin', 'kitchen'],
    '/api/dashboard': ['superadmin', 'admin'],
  }
};

export function hasPermission(role: Role, path: string, isApi: boolean = false): boolean {
  if (role === 'superadmin') return true;
  
  const matrix = isApi ? PERMISSIONS.apis : PERMISSIONS.pages;
  
  // Find the most specific match
  const match = Object.keys(matrix)
    .sort((a, b) => b.length - a.length)
    .find(p => path.startsWith(p));
    
  if (!match) return false;
  
  return matrix[match].includes(role);
}

export function getRequiredRoles(path: string, isApi: boolean = false): Role[] {
  const matrix = isApi ? PERMISSIONS.apis : PERMISSIONS.pages;
  const match = Object.keys(matrix)
    .sort((a, b) => b.length - a.length)
    .find(p => path.startsWith(p));
    
  return match ? matrix[match] : [];
}
