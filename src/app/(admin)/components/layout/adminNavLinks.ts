import {
  LayoutDashboard,
  ShoppingBag,
  Settings,
  BarChart3,
  Percent,
  Calendar,
  ClipboardList,
  PackagePlus,
  FlaskConical,
  CookingPot,
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
  counts: { pending: number; orders: number; ready: number }
): AdminNavItem[] {
  return [
    { id: 'dashboard', name: t('dashboard'), href: '/', icon: LayoutDashboard, roles: ['admin', 'superadmin'] },
    {
      id: 'reservations',
      name: t('reservations'),
      href: '/reservations',
      icon: Calendar,
      roles: ['admin', 'superadmin'],
      badge: counts.pending,
    },
    {
      id: 'orders',
      name: t('orders'),
      href: '/orders',
      icon: ClipboardList,
      roles: ['admin', 'superadmin'],
      badge: counts.orders,
      blink: counts.orders > 0,
      readyBadge: counts.ready,
    },
    { id: 'products', name: t('products'), href: '/products', icon: ShoppingBag, roles: ['superadmin'] },
    { id: 'combos', name: t('combos'), href: '/combos', icon: PackagePlus, roles: ['superadmin'] },
    { id: 'campaigns', name: t('campaigns'), href: '/campaigns', icon: Percent, roles: ['admin', 'superadmin'] },
    { id: 'stock', name: 'Stok', href: '/stock', icon: FlaskConical, roles: ['superadmin'] },
    { id: 'recipes', name: 'Reseptlər', href: '/recipes', icon: CookingPot, roles: ['superadmin'] },
    { id: 'stats', name: t('statistics'), href: '/stats', icon: BarChart3, roles: ['superadmin'] },
    { id: 'settings', name: t('settings'), href: '/settings', icon: Settings, roles: ['superadmin'] },
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
