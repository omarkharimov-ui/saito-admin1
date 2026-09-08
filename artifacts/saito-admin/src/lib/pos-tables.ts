// ============================================================================
// POS floor composition — shared pure logic for /api/pos/tables (F-1 + F-3)
//
// Canonical aggregate contract (POS_FRONTEND_ORDER_AGG_SYNC_AUDIT.md, fix pass):
//   * A billed amount is counted EXACTLY ONCE: `total_amount` is always summed
//     from the open `orders` rows (the same rows the DB aggregate trigger
//     `trg_orders_sync_table_floors` feeds into table_floors.total_amount).
//     We never ADD floor.total_amount on top of an order sum.
//   * The "final" order-status set is ONE constant (FINAL_ORDER_STATUSES),
//     identical to the DB sync formula. The old API excluded only 3 of the 6.
//   * `guest_count` keeps its historical floor-first semantics (a seating fact
//     written by seat_guests_atomic / reservation flow; order sum is fallback).
//   * `item_count` stays orders-only (as before).
//
// Pure + dependency-free so it is unit-testable and reusable by clients.
// ============================================================================

/** Final order states — MUST match sync_table_order_aggregates (DB) exactly. */
export const FINAL_ORDER_STATUSES: readonly string[] = [
  'paid',
  'cancelled',
  'closed',
  'refunded',
  'partially_refunded',
  'voided',
] as const;

export const isFinalOrderStatus = (s: string | null | undefined): boolean =>
  s != null && (FINAL_ORDER_STATUSES as readonly string[]).includes(s);

export interface OpenOrderLike {
  id: string;
  table_number: number | null;
  status: string;
  total_amount: number | string | null;
  guest_count: number | string | null;
  updated_at?: string | null;
  order_items?: Array<{ quantity?: number | string | null }> | null;
  kitchen_status?: string | null;
  [key: string]: unknown;
}

export interface FloorRowLike {
  table_number: number;
  status: string;
  merged_into_table: number | null;
  current_order_id: string | null;
  total_amount: number | string | null;
  guest_count: number | string | null;
  order_count: number | string | null;
  has_pending: boolean | null;
  oldest_pending_at: string | null;
  kitchen_status?: string | null;
  reservation_id?: string | null;
  [key: string]: unknown;
}

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isOpenOrder = (o: OpenOrderLike): boolean => !isFinalOrderStatus(o.status);

/**
 * Kitchen states that count as "pending" — MUST match sync_table_order_aggregates
 * (DB) exactly: pending, reserved, sent, accepted, preparing, cooking, ready,
 * partially_ready, served. ('completed'/'cancelled' are terminal kitchen states.)
 */
export const PENDING_KITCHEN_STATUSES: readonly string[] = [
  'pending',
  'reserved',
  'sent',
  'accepted',
  'preparing',
  'cooking',
  'ready',
  'partially_ready',
  'served',
] as const;

export const hasOpenKitchen = (ks: string | null | undefined): boolean =>
  ks != null && (PENDING_KITCHEN_STATUSES as readonly string[]).includes(ks);

export const orderTotal = (o: OpenOrderLike): number => num(o.total_amount);

export const orderGuests = (o: OpenOrderLike): number => num(o.guest_count);

export const orderItemsCount = (o: OpenOrderLike): number =>
  (o.order_items ?? []).reduce((s: number, it: any) => s + num(it?.quantity), 0);

/**
 * Canonical open-order sums for a single table's order list.
 * Used for both single tables and merged-group members, so a billed amount can
 * never be counted twice (floor total + order sum was the F-1 defect).
 */
export function openOrderSums(orders: OpenOrderLike[]): {
  total: number;
  guests: number;
  items: number;
  count: number;
  lastActivity: string | null;
  /** has_pending formula (DB-identical): an open order in a non-terminal kitchen state */
  hasPending: boolean;
  /** oldest pending (DB-identical): MIN updated_at among open orders w/ pending kitchen */
  oldestPendingAt: string | null;
} {
  let total = 0;
  let guests = 0;
  let items = 0;
  let count = 0;
  let lastActivity: string | null = null;
  let hasPending = false;
  let oldestPendingAt: string | null = null;
  for (const o of orders) {
    if (!isOpenOrder(o)) continue;
    count += 1;
    total += orderTotal(o);
    guests += orderGuests(o);
    items += orderItemsCount(o);
    if (o.updated_at && (!lastActivity || o.updated_at > lastActivity)) {
      lastActivity = o.updated_at;
    }
    if (hasOpenKitchen(o.kitchen_status)) {
      hasPending = true;
      if (o.updated_at && (!oldestPendingAt || o.updated_at < oldestPendingAt)) {
        oldestPendingAt = o.updated_at;
      }
    }
  }
  return { total, guests, items, count, lastActivity, hasPending, oldestPendingAt };
}

/**
 * Guest count with historical floor-first semantics: a non-null floor value
 * (seating fact) wins; otherwise fall back to the open-order guest sum; if
 * there are open orders but the sum is 0, keep 0 (no invented `|| 1` rule).
 */
export function floorGuestCount(
  floorGuests: number | string | null,
  orders: OpenOrderLike[]
): number | null {
  if (floorGuests != null) return num(floorGuests);
  const open = orders.filter(isOpenOrder);
  if (open.length === 0) return null;
  const sum = open.reduce((s: number, o: OpenOrderLike) => s + orderGuests(o), 0);
  return sum;
}

export interface ComposedTable {
  floor: FloorRowLike;
  groupMembers: Array<{ floor: FloorRowLike; orders: OpenOrderLike[] }>;
  currentOrder: OpenOrderLike | null;
  statusOverride?: string;
}

/**
 * Compose the aggregate block of one table (or merged group) for the floor grid.
 * `groupMembers` = the table alone for a normal table, all group members for a
 * merged group (each with its own open orders). Guarantees: total counted once.
 */
export function composeAggregates({
  floor,
  groupMembers,
  currentOrder,
}: ComposedTable): {
  total_amount: number;
  guest_count: number | null;
  item_count: number;
  order_count: number;
  has_pending: boolean;
  oldest_pending_at: string | null;
  last_activity_at: string | null;
} {
  const isGroup = groupMembers.length > 1;

  // TOTAL: orders-only across the group (each member's open orders, each once).
  let total = 0;
  let guestsSum = 0;
  let guestsHaveFloor = false;
  let items = 0;
  let count = 0;
  let lastActivity: string | null = null;
  let hasPending = false;
  let oldestPendingAt: string | null = null;
  for (const m of groupMembers) {
    const s = openOrderSums(m.orders);
    total += s.total;
    items += s.items;
    count += s.count;
    if (s.lastActivity && (!lastActivity || s.lastActivity > lastActivity)) {
      lastActivity = s.lastActivity;
    }
    if (s.hasPending) hasPending = true;
    if (s.oldestPendingAt && (!oldestPendingAt || s.oldestPendingAt < oldestPendingAt)) {
      oldestPendingAt = s.oldestPendingAt;
    }
    const fg = m.floor.guest_count;
    if (isGroup) {
      // group: sum member floor guest values (historical semantics), fallback to orders
      if (fg != null) {
        guestsHaveFloor = true;
        guestsSum += num(fg);
      } else {
        guestsSum += s.guests;
      }
    } else {
      // single table: floor-first via floorGuestCount
      const g = floorGuestCount(fg, m.orders);
      if (g != null) {
        guestsHaveFloor = true;
        guestsSum += g;
      }
    }
  }

  // Non-group: honor the legacy "floor total when no open orders" fallback so a
  // never-synced floor still shows its stored amount (defense, not double count).
  if (!isGroup) {
    const openHere = groupMembers[0]?.orders.filter(isOpenOrder).length ?? 0;
    if (openHere === 0) {
      const stored = num(floor.total_amount);
      if (stored > 0) total = stored;
    }
  }

  const guest_out = guestsHaveFloor ? guestsSum : (count > 0 ? guestsSum : null);

  return {
    total_amount: total,
    guest_count: guest_out,
    item_count: items,
    order_count: count,
    has_pending: hasPending,
    oldest_pending_at: oldestPendingAt,
    last_activity_at: lastActivity,
  };
}

/** kitchen_status for the composed table (unchanged legacy precedence). */
export function composedKitchenStatus(
  currentOrder: OpenOrderLike | null,
  floorKitchen: string | null | undefined,
  fallbackOrders: OpenOrderLike[]
): string | null {
  return currentOrder?.kitchen_status ?? floorKitchen ?? fallbackOrders[0]?.kitchen_status ?? null;
}
