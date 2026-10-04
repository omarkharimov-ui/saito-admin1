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
  UserRound,
  Users,
  Shield,
  Timer,
  Gift,
  ClipboardCheck,
  Bike,
  Coffee,
  Wallet,
  Smartphone,
  Scale,
  RotateCcw,
  Trash,
  type LucideIcon,
} from '@/components/ui/saito-icons';

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
      // 2026-09-26 (Task 53 P1-3): owner mobile dashboard — phone-first
      // "Sahib paneli" (/owner): live sales/orders/alerts. Top-level, next to
      // Dashboard, so the owner can pin it to their home screen.
      id: 'owner-dash',
      name: t('owner_dash'),
      href: '/owner',
      icon: Smartphone,
      roles: ['admin', 'manager', 'superadmin', 'owner'],
    },
    {
      id: 'pos',
      name: 'POS',
      href: '/admin/pos',
      icon: Monitor,
      roles: ['admin', 'manager', 'superadmin', 'owner', 'cashier'],
    },
    {
      // 2026-09-24 (owner clarification): BDS = BAR Display System — the
      // station board for the bar (coffee/shakes/drinks), same machinery as
      // KDS. The delivery/pickup operations board moved to /admin/delivery.
      id: 'bds',
      name: 'BDS',
      href: '/admin/bds',
      icon: Coffee,
      roles: ['admin', 'manager', 'superadmin', 'owner', 'cashier'],
    },
    {
      // 2026-09-23 (owner) delivery/pickup fulfillment board — route moved
      // /admin/bds → /admin/delivery on 2026-09-24 when BDS became the bar
      // display. Its statuses are pressed HERE (kitchen = KDS, bar = BDS).
      id: 'delivery',
      name: 'Çatdırılma',
      href: '/admin/delivery',
      icon: Bike,
      roles: ['admin', 'manager', 'superadmin', 'owner', 'cashier'],
    },
    {
      // 2026-09-25 (owner, decision): EXPO display — tablet/2-ci ekran üçün
      // canlı "sifariş hazırdır / masa boşaldı / hesab göndərildi" ekranı.
      id: 'expo',
      name: 'EXPO',
      href: '/admin/expo',
      icon: Monitor,
      roles: ['admin', 'manager', 'superadmin', 'owner', 'cashier', 'host'],
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
    { id: 'customers', name: 'Müştərilər', href: '/admin/customers', icon: UserRound, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    { id: 'gift-cards', name: 'HƏDİYYƏ KARTLARI', href: '/admin/gift-cards', icon: Gift, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    { id: 'roles', name: 'Rollar', href: '/admin/staff/roles', icon: Shield, roles: ['superadmin', 'owner'] },
    { id: 'shifts', name: 'Növbələr', href: '/admin/shifts', icon: Timer, roles: ['admin', 'manager', 'superadmin', 'owner'] },
    {
      // 2026-09-23 (owner, Toast benchmark): drawer history + cash activity +
      // close-out-day checklist.
      id: 'cash-reports',
      name: 'Kassa',
      href: '/admin/cash-reports',
      icon: Wallet,
      roles: ['admin', 'manager', 'superadmin', 'owner'],
    },
    { id: 'checklists', name: 'CHECKLIST', href: '/admin/checklists', icon: ClipboardCheck, roles: ['admin', 'manager', 'superadmin', 'owner', 'cashier', 'host'] },

    { id: 'stock', name: 'Stok', href: '/admin/stock', icon: Warehouse, roles: ['superadmin', 'owner', 'admin'] },
    { id: 'purchase-orders', name: 'Alış Sifarişləri', href: '/admin/purchase-orders', icon: ShoppingCart, roles: ['superadmin', 'owner'] },
    { id: 'recipes', name: 'Reseptlər', href: '/admin/recipes', icon: ScrollText, roles: ['superadmin', 'owner'] },
    { id: 'audit', name: 'Audit', href: '/admin/audit', icon: ShieldAlert, roles: ['superadmin', 'owner', 'admin'] },
    // 13a (owner: inventory deep pass): the stocktake / supplier-returns /
    // waste-standards pages EXISTED but were orphaned (reachable only by
    // typing the URL — 0 usage in DB: stock_counts=0, supplier_returns=0,
    // waste_standards=0). Stocktake is THE tool to fix the 5 negative-stock
    // ingredients, so it gets first-class nav.
    { id: 'stock-counts', name: 'Stok Sayımı', href: '/admin/stock/counts', icon: Scale, roles: ['superadmin', 'owner'] },
    { id: 'stock-returns', name: 'Tədarük Returns', href: '/admin/stock/returns', icon: RotateCcw, roles: ['superadmin', 'owner'] },
    { id: 'waste-standards', name: 'İtki Standartları', href: '/admin/waste-standards', icon: Trash, roles: ['superadmin', 'owner'] },
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
