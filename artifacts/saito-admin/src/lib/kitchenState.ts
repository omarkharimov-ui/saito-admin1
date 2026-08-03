/**
 * Kitchen/Table State Machine — Single Source of Truth
 *
 * Table states (from database CHECK constraint):
 *   empty | reserved | seated | ordering | in_kitchen | dining |
 *   bill_requested | payment_pending | paid | cleaning | merged | out_of_service
 *
 * Kitchen statuses (order-level, from database CHECK constraint):
 *   pending | accepted | preparing | cooking | partially_ready |
 *   ready | served | completed | cancelled | reserved | bar | hot | sushi
 *
 * Table badges are DERIVED from the latest kitchen status of orders on the table.
 * They are NOT stored in the database.
 */

export type TableStatus =
  | 'empty' | 'reserved' | 'seated' | 'ordering'
  | 'in_kitchen' | 'dining' | 'bill_requested'
  | 'payment_pending' | 'paid' | 'cleaning'
  | 'merged' | 'out_of_service';

export type KitchenStatus =
  | 'pending' | 'accepted' | 'preparing' | 'cooking'
  | 'partially_ready' | 'ready' | 'served' | 'completed'
  | 'cancelled' | 'reserved' | 'bar' | 'hot' | 'sushi';

export const TABLE_STATUS_LABELS: Record<TableStatus, { az: string; en: string; ru: string }> = {
  empty: { az: 'BOŞ', en: 'EMPTY', ru: 'ПУСТО' },
  reserved: { az: 'REZERV', en: 'RESERVED', ru: 'ЗАБРОНИРОВАНО' },
  seated: { az: 'OTURULUB', en: 'SEATED', ru: 'ПОСАЖЕН' },
  ordering: { az: 'SİFARİŞ', en: 'ORDERING', ru: 'ЗАКАЗ' },
  in_kitchen: { az: 'MƏTBƏX', en: 'IN KITCHEN', ru: 'НА КУХНЕ' },
  dining: { az: 'YEMƏK', en: 'DINING', ru: 'ОБЕД' },
  bill_requested: { az: 'HESAB', en: 'BILL REQUESTED', ru: 'ЗАПРОС СЧЁТА' },
  payment_pending: { az: 'ÖDƏNİŞ', en: 'PAYMENT', ru: 'ОПЛАТА' },
  paid: { az: 'ÖDƏNİB', en: 'PAID', ru: 'ОПЛАЧЕНО' },
  cleaning: { az: 'TƏMİZLİK', en: 'CLEANING', ru: 'УБОРКА' },
  merged: { az: 'BİRLƏŞDİRMƏ', en: 'MERGED', ru: 'ОБЪЕДИНЁНО' },
  out_of_service: { az: 'SERVİS YOX', en: 'OUT OF SERVICE', ru: 'НЕ В СЕРВИСЕ' },
};

export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, { az: string; en: string; ru: string }> = {
  pending: { az: 'GÖZLƏNİLİR', en: 'PENDING', ru: 'ОЖИДАНИЕ' },
  accepted: { az: 'QƏBUL EDİLDİ', en: 'ACCEPTED', ru: 'ПРИНЯТО' },
  preparing: { az: 'HAZIRLANIR', en: 'PREPARING', ru: 'ГОТОВИТСЯ' },
  cooking: { az: 'BİSHİRİLİR', en: 'COOKING', ru: 'ГОТОВИТСЯ' },
  partially_ready: { az: 'QISMƏN HAZIR', en: 'PARTIALLY READY', ru: 'ЧАСТИЧНО ГОТОВО' },
  ready: { az: 'HAZIRDIR', en: 'READY', ru: 'ГОТОВО' },
  served: { az: 'SERVİS EDİLDİ', en: 'SERVED', ru: 'ПОДАНО' },
  completed: { az: 'TİAMAM', en: 'COMPLETED', ru: 'ЗАВЕРШЕНО' },
  cancelled: { az: 'LƏĞV', en: 'CANCELLED', ru: 'ОТМЕНЕНО' },
  reserved: { az: 'REZERV', en: 'RESERVED', ru: 'ЗАБРОНИРОВАНО' },
  bar: { az: 'BAR', en: 'BAR', ru: 'БАР' },
  hot: { az: 'İSTİ', en: 'HOT', ru: 'ГОРЯЧЕЕ' },
  sushi: { az: 'SUŞİ', en: 'SUSHI', ru: 'СУШИ' },
};

export const KITCHEN_STATUS_PRIORITY: Record<KitchenStatus, number> = {
  reserved: 0,
  pending: 1,
  accepted: 2,
  preparing: 3,
  cooking: 3,
  bar: 3,
  hot: 3,
  sushi: 3,
  partially_ready: 4,
  ready: 5,
  served: 6,
  completed: 7,
  cancelled: 8,
};

export function deriveTableBadge(
  tableStatus: TableStatus,
  kitchenStatuses: KitchenStatus[]
): { label: string; color: string; bg: string; border: string } {
  if (kitchenStatuses.length === 0 || tableStatus === 'empty') {
    return {
      label: TABLE_STATUS_LABELS[tableStatus]?.az || tableStatus,
      color: 'text-white/50',
      bg: 'bg-white/5',
      border: 'border-white/10',
    };
  }

  const worst = kitchenStatuses.reduce((a, b) =>
    KITCHEN_STATUS_PRIORITY[a] < KITCHEN_STATUS_PRIORITY[b] ? a : b
  );

  switch (worst) {
    case 'pending':
      return { label: 'GÖZLƏNİLİR', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
    case 'accepted':
      return { label: 'QƏBUL EDİLDİ', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
    case 'preparing':
    case 'cooking':
    case 'bar':
    case 'hot':
    case 'sushi':
      return { label: 'HAZIRLANIR', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
    case 'partially_ready':
      return { label: 'QISMƏN HAZIR', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' };
    case 'ready':
      return { label: 'HAZIRDIR', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
    case 'served':
      return { label: 'DOLU', color: 'text-white/70', bg: 'bg-white/10', border: 'border-white/20' };
    case 'completed':
      return { label: 'TİAMAM', color: 'text-white/30', bg: 'bg-white/5', border: 'border-white/10' };
    default:
      return { label: TABLE_STATUS_LABELS[tableStatus]?.az || tableStatus, color: 'text-white/50', bg: 'bg-white/5', border: 'border-white/10' };
  }
}

export function isOrderActiveForKitchen(status: KitchenStatus): boolean {
  return ['pending', 'accepted', 'preparing', 'cooking', 'partially_ready', 'ready', 'bar', 'hot', 'sushi'].includes(status);
}

export function isOrderFinished(status: KitchenStatus): boolean {
  return ['served', 'completed', 'cancelled', 'reserved'].includes(status);
}
