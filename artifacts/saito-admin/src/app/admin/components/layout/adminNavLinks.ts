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
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  roles: ('admin' | 'superadmin')[];
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
    { id: 'dashboard', name: t('dashboard'), href: '/admin', icon: LayoutDashboard, roles: ['admin', 'superadmin'] },
    {
      id: 'pos',
      name: 'POS',
      href: '/admin/pos',
      icon: Monitor,
      roles: ['admin', 'superadmin'],
    },
    {
      id: 'reservations',
      name: t('reservations'),
      href: '/admin/reservations',
      icon: Calendar,
      roles: ['admin', 'superadmin'],
      badge: counts.pending,
    },
    { id: 'products', name: t('products'), href: '/admin/products', icon: ShoppingBag, roles: ['superadmin'] },
    { id: 'combos', name: t('combos'), href: '/admin/products', icon: PackagePlus, roles: ['superadmin'] },
    { id: 'campaigns', name: t('campaigns'), href: '/admin/campaigns', icon: Percent, roles: ['admin', 'superadmin'] },
    { id: 'stock', name: 'Stok', href: '/admin/stock', icon: Warehouse, roles: ['superadmin'] },
    { id: 'purchase-orders', name: 'Alış Sifarişləri', href: '/admin/purchase-orders', icon: ShoppingCart, roles: ['superadmin'] },
    { id: 'recipes', name: 'Reseptlər', href: '/admin/recipes', icon: ScrollText, roles: ['superadmin'] },
    { id: 'audit', name: 'Audit', href: '/admin/audit', icon: ShieldAlert, roles: ['superadmin'] },
    { id: 'stats', name: t('statistics'), href: '/admin/stats', icon: BarChart3, roles: ['superadmin'] },
    { id: 'settings', name: t('settings'), href: '/admin/settings', icon: Settings, roles: ['superadmin'] }
  ];
}

export function filterNavByRole(items: AdminNavItem[], role: 'admin' | 'superadmin' | null): AdminNavItem[] {
  if (!role) return [];
  return items.filter((l) => l.roles.includes(role));
}

/** Mobil alt nav: 3 əsas tab — dashboard, stats, reservations. Qalanları "Daha çox" popup-ında. */
export function getMobilePrimaryNavIds(role: 'admin' | 'superadmin' | null): Set<string> {
  if (role === 'superadmin') {
    return new Set(['dashboard', 'stats', 'reservations']);
  }
  return new Set(['dashboard', 'stats', 'reservations']);
}
