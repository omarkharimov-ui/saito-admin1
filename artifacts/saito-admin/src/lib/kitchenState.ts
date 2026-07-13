/**
 * Kitchen/Table State Machine — Single Source of Truth
 *
 * Table states: EMPTY | OCCUPIED | RESERVED
 * Kitchen states (order-level): DRAFT | WAITING | ACCEPTED | PREPARING | PARTIALLY_READY | READY | SERVED | CLOSED
 *
 * Table badges are DERIVED from the latest kitchen state of orders on the table.
 * They are NOT stored in the database.
 */

export type TableStatus = 'EMPTY' | 'OCCUPIED' | 'RESERVED';

export type KitchenStatus =
  | 'DRAFT'
  | 'WAITING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'PARTIALLY_READY'
  | 'READY'
  | 'SERVED'
  | 'CLOSED';

export const TABLE_STATUS_LABELS: Record<TableStatus, { az: string; en: string; ru: string }> = {
  EMPTY: { az: 'BOŞ', en: 'EMPTY', ru: 'ПУСТО' },
  OCCUPIED: { az: 'DOLU', en: 'OCCUPIED', ru: 'ЗАНЯТО' },
  RESERVED: { az: 'REZERV', en: 'RESERVED', ru: 'ЗАБРОНИРОВАНО' },
};

export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, { az: string; en: string; ru: string }> = {
  DRAFT: { az: 'LAYZER', en: 'DRAFT', ru: 'ЧЕРНОВИК' },
  WAITING: { az: 'GÖZLƏNİLİR', en: 'WAITING', ru: 'ОЖИДАНИЕ' },
  ACCEPTED: { az: 'QƏBUL EDİLDİ', en: 'ACCEPTED', ru: 'ПРИНЯТО' },
  PREPARING: { az: 'HAZIRLANIR', en: 'PREPARING', ru: 'ГОТОВИТСЯ' },
  PARTIALLY_READY: { az: 'QISMƏN HAZIR', en: 'PARTIALLY READY', ru: 'ЧАСТИЧНО ГОТОВО' },
  READY: { az: 'HAZIRDIR', en: 'READY', ru: 'ГОТОВО' },
  SERVED: { az: 'SERVİS EDİLDİ', en: 'SERVED', ru: 'ПОДАНО' },
  CLOSED: { az: 'BAĞLI', en: 'CLOSED', ru: 'ЗАКРЫТО' },
};

export const KITCHEN_STATUS_PRIORITY: Record<KitchenStatus, number> = {
  DRAFT: 0,
  WAITING: 1,
  ACCEPTED: 2,
  PREPARING: 3,
  PARTIALLY_READY: 4,
  READY: 5,
  SERVED: 6,
  CLOSED: 7,
};

export function deriveTableBadge(
  tableStatus: TableStatus,
  kitchenStatuses: KitchenStatus[]
): { label: string; color: string; bg: string; border: string } {
  if (kitchenStatuses.length === 0 || tableStatus === 'EMPTY') {
    return {
      label: TABLE_STATUS_LABELS[tableStatus].az,
      color: 'text-white/50',
      bg: 'bg-white/5',
      border: 'border-white/10',
    };
  }

  const worst = kitchenStatuses.reduce((a, b) =>
    KITCHEN_STATUS_PRIORITY[a] < KITCHEN_STATUS_PRIORITY[b] ? a : b
  );

  switch (worst) {
    case 'WAITING':
      return {
        label: 'GÖZLƏNİLİR',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
      };
    case 'ACCEPTED':
      return {
        label: 'QƏBUL EDİLDİ',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
      };
    case 'PREPARING':
      return {
        label: 'HAZIRLANIR',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
      };
    case 'PARTIALLY_READY':
      return {
        label: 'QISMƏN HAZIR',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/30',
      };
    case 'READY':
      return {
        label: 'HAZIRDIR',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
      };
    case 'SERVED':
      return {
        label: 'DOLU',
        color: 'text-white/70',
        bg: 'bg-white/10',
        border: 'border-white/20',
      };
    case 'CLOSED':
      return {
        label: 'BAĞLI',
        color: 'text-white/30',
        bg: 'bg-white/5',
        border: 'border-white/10',
      };
    default:
      return {
        label: TABLE_STATUS_LABELS[tableStatus].az,
        color: 'text-white/50',
        bg: 'bg-white/5',
        border: 'border-white/10',
      };
  }
}

export function isOrderActiveForKitchen(status: KitchenStatus): boolean {
  return ['WAITING', 'ACCEPTED', 'PREPARING', 'PARTIALLY_READY', 'READY'].includes(status);
}

export function isOrderFinished(status: KitchenStatus): boolean {
  return ['SERVED', 'CLOSED', 'DRAFT'].includes(status);
}
