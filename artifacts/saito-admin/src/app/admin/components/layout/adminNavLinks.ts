import {
  LayoutDashboard,
  ShoppingBag,
  Settings,
  BarChart3,
  Percent,
  Calendar,
  PackagePlus,
  Warehouse,
  ScrollText,
  Monitor,
  ShieldAlert,
  ShoppingCart,
  Users,
  Shield,
  Timer,
  type LucideIcon,
} from 'lucide-react';

import { canAccessPage, type Role } from '@/lib/permissions';

export type AdminNavItem = {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  badge?: number;
  readyBadge?: number;
  blink?: boolean;
};

import type { TranslationKey } from '@/lib/i18n/translations';

export function getAdminNavItems(
  t: (key: TranslationKey) => string,
  counts: { pending: number; ready: number }
): AdminNavItem[] {
  return [
    { id: 'dashboard', name: t('dashboard'), href: '/admin', icon: LayoutDashboard, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    {
      id: 'pos',
      name: 'POS',
      href: '/admin/pos',
      icon: Monitor,
      roles: ['admin', 'manager', 'superadmin', 'owner', 'cashier'],
    },
    {
      id: 'reservations',
      name: t('reservations'),
      href: '/admin/reservations',
      icon: Calendar,
      roles: ['admin', 'manager', 'superadmin', 'owner', 'host'],
      badge: counts.pending,
    },
    { id: 'products', name: t('products'), href: '/admin/products', icon: ShoppingBag, roles: ['superadmin', 'owner'] },
    { id: 'combos', name: t('combos'), href: '/admin/products', icon: PackagePlus, roles: ['superadmin', 'owner'] },
    { id: 'campaigns', name: t('campaigns'), href: '/admin/campaigns', icon: Percent, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    { id: 'staff', name: 'İşçilər', href: '/admin/staff', icon: Users, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    { id: 'roles', name: 'Rollar', href: '/admin/staff/roles', icon: Shield, roles: ['superadmin', 'owner'] },
    { id: 'shifts', name: 'Növbələr', href: '/admin/shifts', icon: Timer, roles: ['admin', 'manager', 'superadmin', 'owner'] },

    { id: 'stock', name: 'Stok', href: '/admin/stock', icon: Warehouse, roles: ['superadmin', 'owner', 'admin'] },
    { id: 'purchase-orders', name: 'Alış Sifarişləri', href: '/admin/purchase-orders', icon: ShoppingCart, roles: ['superadmin', 'owner'] },
    { id: 'recipes', name: 'Reseptlər', href: '/admin/recipes', icon: ScrollText, roles: ['superadmin', 'owner'] },
    { id: 'audit', name: 'Audit', href: '/admin/audit', icon: ShieldAlert, roles: ['superadmin', 'owner', 'admin'] },
    { id: 'loss-prevention', name: 'Loss Prevention', href: '/admin/loss-prevention', icon: ShieldAlert, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    { id: 'stats', name: t('statistics'), href: '/admin/stats', icon: BarChart3, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    { id: 'settings', name: t('settings'), href: '/admin/settings', icon: Settings, roles: ['admin', 'superadmin', 'owner'] }
  ];
}

export function filterNavByRole(items: AdminNavItem[], role: Role | null): AdminNavItem[] {
  if (!role) return [];
  return items.filter((l) => l.roles.includes(role));
}

/** Mobil alt nav: 3 əsas tab — dashboard, stats, reservations. Qalanları "Daha çox" popup-ında. */
export function getMobilePrimaryNavIds(role: Role | null): Set<string> {
  return new Set(['dashboard', 'stats', 'reservations']);
}
