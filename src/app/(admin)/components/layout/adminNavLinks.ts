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
  Calculator,
  ClipboardList,
  AlertTriangle,
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
    { id: 'dashboard', name: t('dashboard'), href: '/', icon: LayoutDashboard, roles: ['admin', 'superadmin'] },
    {
      id: 'pos',
      name: 'POS',
      href: '/pos',
      icon: Monitor,
      roles: ['admin', 'superadmin'],
    },
    {
      id: 'reservations',
      name: t('reservations'),
      href: '/reservations',
      icon: Calendar,
      roles: ['admin', 'superadmin'],
      badge: counts.pending,
    },
    { id: 'products', name: t('products'), href: '/products', icon: ShoppingBag, roles: ['superadmin'] },
    { id: 'combos', name: t('combos'), href: '/combos', icon: PackagePlus, roles: ['superadmin'] },
    { id: 'campaigns', name: t('campaigns'), href: '/campaigns', icon: Percent, roles: ['admin', 'superadmin'] },
    { id: 'stock', name: 'Stok', href: '/stock', icon: Warehouse, roles: ['superadmin'] },
    { id: 'inventory', name: 'Inventory', href: '/stock?tab=inventory', icon: ClipboardList, roles: ['superadmin'] },
    { id: 'recipes', name: 'Reseptlər', href: '/recipes', icon: ScrollText, roles: ['superadmin'] },
    { id: 'purchasing', name: 'Purchasing', href: '/stock?tab=purchasing', icon: Calculator, roles: ['superadmin'] },
    { id: 'recipe-ai', name: 'AI Recipe Builder', href: '/stock?tab=recipes', icon: ClipboardList, roles: ['superadmin'] },
    { id: 'ocr-import', name: 'OCR Import', href: '/stock?tab=purchasing', icon: ScrollText, roles: ['superadmin'] },
    { id: 'reverse-analysis', name: 'Reverse Analysis', href: '/stock?tab=cost-analysis', icon: AlertTriangle, roles: ['superadmin'] },
    { id: 'cost-analysis', name: 'Cost Analysis', href: '/stock?tab=cost-analysis', icon: BarChart3, roles: ['superadmin'] },
    { id: 'alerts', name: 'Alerts', href: '/stock?tab=alerts', icon: AlertTriangle, roles: ['superadmin'] },
    { id: 'stats', name: t('statistics'), href: '/stats', icon: BarChart3, roles: ['superadmin'] },
    { id: 'settings', name: t('settings'), href: '/settings', icon: Settings, roles: ['superadmin'] }
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
