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

    // 13f (owner: "inventory-a aid olan seyler eyni sehifede olsunlar"): the
    // inventory surfaces live on ONE page — /admin/stock hub with 10 internal
    // views (Anbar, Ağıllı Analiz, Tədarük, Alış Sifarişləri, Report,
    // Tədarükçülər, Sayım, Qaytarış, İtki St., Audit). Deep links and
    // bookmarks keep working via ?view= + thin redirects on the old routes.
    // 13g (owner: "reseptler ayri sehife edek, evvelki kimi"): RECIPES moves
    // back out to its own sidebar page — it is the menu-engine (BOM per
    // product), conceptually distinct from stock/procurement operations.
    { id: 'stock', name: 'Stok', href: '/admin/stock', icon: Warehouse, roles: ['superadmin', 'owner', 'admin'] },
    { id: 'recipes', name: 'Reseptlər', href: '/admin/recipes', icon: ScrollText, roles: ['superadmin', 'owner'] },
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
