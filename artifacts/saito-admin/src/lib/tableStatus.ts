/**
 * Consolidated table status definitions and transition rules.
 * Single source of truth for POS/UI table display states.
 *
 * Database CHECK constraint (table_floors.status):
 *   empty | reserved | seated | ordering | in_kitchen | dining |
 *   bill_requested | payment_pending | paid | cleaning | merged | out_of_service
 *
 * OCCUPIED is a derived/computed status for frontend display —
 * it represents any non-empty, non-merged, non-out_of_service state.
 */

export enum TableStatus {
  EMPTY = 'empty',
  RESERVED = 'reserved',
  SEATED = 'seated',
  ORDERING = 'ordering',
  IN_KITCHEN = 'in_kitchen',
  DINING = 'dining',
  BILL_REQUESTED = 'bill_requested',
  PAYMENT_PENDING = 'payment_pending',
  PAID = 'paid',
  CLEANING = 'cleaning',
  MERGED = 'merged',
  OUT_OF_SERVICE = 'out_of_service',
}

/** Derived status — used in UI to group active tables */
export const OCCUPIED_STATUSES: ReadonlySet<TableStatus> = new Set([
  TableStatus.SEATED,
  TableStatus.ORDERING,
  TableStatus.IN_KITCHEN,
  TableStatus.DINING,
  TableStatus.BILL_REQUESTED,
  TableStatus.PAYMENT_PENDING,
  TableStatus.PAID,
  TableStatus.CLEANING,
]);

export type OrderStatus =
  | 'draft' | 'new' | 'open' | 'confirmed'
  | 'in_kitchen' | 'partially_ready' | 'ready'
  | 'served' | 'payment_pending'
  | 'paid' | 'closed' | 'cancelled' | 'refunded';

export type KitchenStatus =
  | 'pending' | 'accepted' | 'preparing' | 'cooking'
  | 'partially_ready' | 'ready' | 'completed' | 'cancelled'
  | 'reserved' | null | undefined;

export type DeliveryStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready'
  | 'waiting_courier' | 'picked_up' | 'in_transit'
  | 'delivered' | 'completed' | 'cancelled';

/**
 * Server-authoritative transition rules.
 * Matches state_transitions table in database.
 */
const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  [TableStatus.EMPTY]: [TableStatus.RESERVED, TableStatus.SEATED, TableStatus.ORDERING, TableStatus.OUT_OF_SERVICE],
  [TableStatus.RESERVED]: [TableStatus.SEATED, TableStatus.EMPTY],
  [TableStatus.SEATED]: [TableStatus.ORDERING, TableStatus.EMPTY],
  [TableStatus.ORDERING]: [TableStatus.IN_KITCHEN, TableStatus.EMPTY],
  [TableStatus.IN_KITCHEN]: [TableStatus.DINING, TableStatus.EMPTY],
  [TableStatus.DINING]: [TableStatus.BILL_REQUESTED, TableStatus.ORDERING, TableStatus.EMPTY],
  [TableStatus.BILL_REQUESTED]: [TableStatus.PAYMENT_PENDING],
  [TableStatus.PAYMENT_PENDING]: [TableStatus.PAID],
  [TableStatus.PAID]: [TableStatus.CLEANING, TableStatus.EMPTY],
  [TableStatus.CLEANING]: [TableStatus.EMPTY],
  [TableStatus.MERGED]: [TableStatus.EMPTY],
  [TableStatus.OUT_OF_SERVICE]: [TableStatus.EMPTY],
};

export function isValidTableTransition(from: TableStatus, to: TableStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

export function isTableOccupied(status: TableStatus): boolean {
  return OCCUPIED_STATUSES.has(status);
}

export interface TableComputeInput {
  floorStatus: string | null | undefined;
  activeOrders: unknown[];
  mergedIntoTable?: number | null | undefined;
  reservation?: { id: string } | null | undefined;
}

export function computeTableStatus(input: TableComputeInput): TableStatus {
  const { floorStatus, activeOrders, mergedIntoTable, reservation } = input;

  if (mergedIntoTable != null) return TableStatus.MERGED;
  if (reservation != null || floorStatus === 'reserved') return TableStatus.RESERVED;
  if (activeOrders.length > 0) return TableStatus.DINING;
  return TableStatus.EMPTY;
}

/** All valid order statuses for display/labeling */
export const ORDER_STATUS_LABELS: Record<OrderStatus, { az: string; en: string; ru: string }> = {
  draft: { az: 'QARALAMA', en: 'DRAFT', ru: 'ЧЕРНОВИК' },
  new: { az: 'YENİ', en: 'NEW', ru: 'НОВЫЙ' },
  open: { az: 'AÇIQ', en: 'OPEN', ru: 'ОТКРЫТ' },
  confirmed: { az: 'TƏSDİQLƏNİB', en: 'CONFIRMED', ru: 'ПОДТВЕРЖДЁН' },
  in_kitchen: { az: 'MƏTBƏXDƏ', en: 'IN KITCHEN', ru: 'НА КУХНЕ' },
  partially_ready: { az: 'QISMƏN HAZIR', en: 'PARTIALLY READY', ru: 'ЧАСТИЧНО ГОТОВО' },
  ready: { az: 'HAZIRDIR', en: 'READY', ru: 'ГОТОВО' },
  served: { az: 'VERİLİB', en: 'SERVED', ru: 'ПОДАНО' },
  payment_pending: { az: 'ÖDƏNİŞ GÖZLƏNİR', en: 'PAYMENT PENDING', ru: 'ОЖИДАНИЕ ОПЛАТЫ' },
  paid: { az: 'ÖDƏNİLİB', en: 'PAID', ru: 'ОПЛАЧЕНО' },
  closed: { az: 'BAĞLANIB', en: 'CLOSED', ru: 'ЗАКРЫТО' },
  cancelled: { az: 'LƏĞV EDİLİB', en: 'CANCELLED', ru: 'ОТМЕНЁНО' },
  refunded: { az: 'Geri qaytarılıb', en: 'REFUNDED', ru: 'ВОЗВРАТ' },
};

export const TABLE_STATUS_LABELS: Record<TableStatus, { az: string; en: string; ru: string }> = {
  [TableStatus.EMPTY]: { az: 'BOŞ', en: 'EMPTY', ru: 'ПУСТО' },
  [TableStatus.RESERVED]: { az: 'REZERV', en: 'RESERVED', ru: 'ЗАБРОНИРОВАНО' },
  [TableStatus.SEATED]: { az: 'OTURULUB', en: 'SEATED', ru: 'ПОСАЖЕН' },
  [TableStatus.ORDERING]: { az: 'SİFARİŞ', en: 'ORDERING', ru: 'ЗАКАЗ' },
  [TableStatus.IN_KITCHEN]: { az: 'MƏTBƏX', en: 'IN KITCHEN', ru: 'НА КУХНЕ' },
  [TableStatus.DINING]: { az: 'YEMƏK', en: 'DINING', ru: 'ОБЕД' },
  [TableStatus.BILL_REQUESTED]: { az: 'HESAB', en: 'BILL REQUESTED', ru: 'ЗАПРОС СЧЁТА' },
  [TableStatus.PAYMENT_PENDING]: { az: 'ÖDƏNİŞ', en: 'PAYMENT', ru: 'ОПЛАТА' },
  [TableStatus.PAID]: { az: 'ÖDƏNİB', en: 'PAID', ru: 'ОПЛАЧЕНО' },
  [TableStatus.CLEANING]: { az: 'TƏMİZLİK', en: 'CLEANING', ru: 'УБОРКА' },
  [TableStatus.MERGED]: { az: 'BİRLƏŞDİRMƏ', en: 'MERGED', ru: 'ОБЪЕДИНЁНО' },
  [TableStatus.OUT_OF_SERVICE]: { az: 'SERVİS YOX', en: 'OUT OF SERVICE', ru: 'НЕ В СЕРВИСЕ' },
};
