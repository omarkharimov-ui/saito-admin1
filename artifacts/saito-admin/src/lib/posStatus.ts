/**
 * CANONICAL POS status vocabulary (Phase 1 / G6).
 *
 * Verified against the LIVE production database on 2026-09-07 (H12 freeze):
 *  - table_floors.status       : empty | merged | occupied | reserved   (text, no CHECK)
 *  - table_floors.cleaning_status : clean                                (observed)
 *  - orders.status             : new | confirmed | paid | served | cancelled
 *  - orders.kitchen_status     : pending | preparing | ready | cooking | partially_ready |
 *                                completed | reserved | cancelled
 *  - order_items.kitchen_status: pending | ready | completed | cancelled | voided |
 *                                bar | hot | sushi                        (bar/hot/sushi = station tags)
 *  - payments.status           : captured | pending
 *  - order_payments.status     : pending
 *  - reservations.status       : pending | confirmed | waiting | checked_in | no_show |
 *                                cancelled | completed
 *  - sessions.status           : ACTIVE | EXPIRED | REVOKED (enum session_status)
 *  - staff.status              : ACTIVE | INACTIVE | SUSPENDED (enum staff_status)
 *
 * Rules:
 *  - DB values are the SOURCE OF TRUTH. UI aliases are allowed (FREE -> 'empty').
 *  - Do NOT invent DB values for UI convenience.
 *  - PAYMENT_PENDING is DERIVED (occupied + payment_status), never stored.
 *  - CLEANING: no canonical DB state exists today (no writer writes status='cleaning').
 *    Tracked as spec mismatch/backlog (Phase-1 G6). Presentational code may keep
 *    legacy string checks, but nothing may WRITE a 'cleaning' status.
 */

export const DB_TABLE_STATUS = ['empty', 'merged', 'occupied', 'reserved'] as const;
export type DbTableStatus = (typeof DB_TABLE_STATUS)[number];

export const DB_ORDER_STATUS = ['new', 'confirmed', 'paid', 'served', 'cancelled'] as const;
export type DbOrderStatus = (typeof DB_ORDER_STATUS)[number];

export const DB_ORDER_KITCHEN_STATUS = [
  'pending', 'preparing', 'ready', 'cooking', 'partially_ready', 'completed', 'reserved', 'cancelled',
] as const;
export type DbOrderKitchenStatus = (typeof DB_ORDER_KITCHEN_STATUS)[number];

export const DB_ITEM_KITCHEN_STATUS = [
  'pending', 'ready', 'completed', 'cancelled', 'voided', 'bar', 'hot', 'sushi',
] as const;
export type DbItemKitchenStatus = (typeof DB_ITEM_KITCHEN_STATUS)[number];

export const DB_PAYMENT_STATUS = ['captured', 'pending'] as const;
export type DbPaymentStatus = (typeof DB_PAYMENT_STATUS)[number];

export const DB_RESERVATION_STATUS = [
  'pending', 'confirmed', 'waiting', 'checked_in', 'no_show', 'cancelled', 'completed',
] as const;
export type DbReservationStatus = (typeof DB_RESERVATION_STATUS)[number];

/**
 * UI aliases -> DB values.
 * FREE is an alias for DB 'empty'. PAYMENT_PENDING / CLEANING are NOT DB values.
 */
export const TABLE_UI_ALIASES = {
  FREE: 'empty',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
} as const;

export type PosTableDisplayStatus =
  | 'free'          // DB empty
  | 'occupied'      // DB occupied
  | 'reserved'      // DB reserved
  | 'merged'        // DB merged (group child/parent)
  | 'payment_pending' // DERIVED: occupied + payment requested/partial
  | 'cleaning'      // legacy presentation only — NO canonical DB writer (backlog)
  | string;         // future-proof for station/derived variants

/** Map a DB table_floors.status row value to its canonical UI label. */
export function tableDbToUi(dbStatus: string | null | undefined): PosTableDisplayStatus {
  if (dbStatus === 'empty') return 'free';
  if (dbStatus === 'reserved') return 'reserved';
  if (dbStatus === 'merged') return 'merged';
  return 'occupied'; // occupied + anything else derives to occupied
}

export const TABLE_STATUS_LABELS: Record<string, { az: string; en: string; ru: string }> = {
  free: { az: 'BOŞ', en: 'FREE', ru: 'СВОБОДЕН' },
  occupied: { az: 'DOLU', en: 'OCCUPIED', ru: 'ЗАНЯТ' },
  reserved: { az: 'REZERV', en: 'RESERVED', ru: 'ЗАБРОНИРОВАН' },
  merged: { az: 'BİRLƏŞDİRİLMİŞ', en: 'MERGED', ru: 'ОБЪЕДИНЕН' },
  payment_pending: { az: 'HESAB', en: 'PAYMENT PENDING', ru: 'ОЖИДАНИЕ ОПЛАТЫ' },
};

/**
 * CLEANING verdict (Phase-1 G6): a literal DB status 'cleaning' is never written by
 * any backend writer (only cleaning_status='clean' exists). Representing CLEANING as a
 * first-class DB state would require a backend contract change -> documented as spec
 * mismatch/backlog. UI code must NOT persist a 'cleaning' status.
 */
export const CLEANING_BACKLOG =
  'CLEANING has no canonical DB state (no writer sets status=cleaning); spec mismatch tracked post-freeze.';
